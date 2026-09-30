import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash } from "node:crypto";
import { Repository, SelectQueryBuilder } from "typeorm";
import { AuditEventEntity } from "@src/database/entities";
import { AuditEventDto } from "@src/contracts";

export const AUDIT_EVENT_PATTERN = "audit.event";
const GENESIS_HASH = "0".repeat(64);
// Transaction-scoped advisory lock: concurrent appends would read the same
// chain head and fork the chain. Keyed by text so every writer agrees on it.
const CHAIN_LOCK_KEY = "audit_events_hash_chain";
const VERIFY_CHUNK = 1000;

/** Deterministic JSON: sorted keys at every level, so a hash computed at
 * append time can be recomputed from what Postgres jsonb gives back. */
function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** Hash material covers exactly the stored columns. Fields must stay in sync
 * with both append() and verify() — the chain breaks otherwise. */
export function computeAuditHash(
  prevHash: string,
  ts: Date,
  entry: {
    action: string;
    outcome: string;
    accountId?: number | null;
    accountUsername?: string | null;
    tenantId?: number | null;
    ip?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
    targetType?: string | null;
    targetId?: string | null;
    details?: Record<string, unknown> | null;
  },
): string {
  const material = [
    prevHash,
    ts.toISOString(),
    entry.action,
    entry.outcome,
    entry.accountId ?? "",
    entry.accountUsername ?? "",
    entry.tenantId ?? "",
    entry.ip ?? "",
    entry.userAgent ?? "",
    entry.requestId ?? "",
    entry.targetType ?? "",
    entry.targetId ?? "",
    entry.details ? canonicalJson(entry.details) : "",
  ].join("|");
  return createHash("sha256").update(material).digest("hex");
}

export interface AuditQuery {
  actionPrefix?: string;
  outcome?: string;
  accountId?: number;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditStoreService {
  private readonly logger = new Logger(AuditStoreService.name);

  constructor(
    @InjectRepository(AuditEventEntity)
    private readonly repo: Repository<AuditEventEntity>,
  ) {}

  /**
   * Append one record to the tamper-evident chain. The prev-hash read and the
   * insert share one transaction guarded by an advisory lock, so the chain is
   * linear even with concurrent publishers.
   */
  async append(dto: AuditEventDto): Promise<AuditEventEntity> {
    return this.repo.manager.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [CHAIN_LOCK_KEY]);

      const last = await manager
        .getRepository(AuditEventEntity)
        .createQueryBuilder("a")
        .select("a.hash", "hash")
        .orderBy("a.id", "DESC")
        .limit(1)
        .getRawOne();
      const prevHash = last?.hash ?? GENESIS_HASH;

      const ts = new Date();
      const entity = manager.getRepository(AuditEventEntity).create({
        action: dto.action,
        outcome: dto.outcome ?? "success",
        accountId: dto.accountId ?? null,
        accountUsername: dto.accountUsername ?? null,
        tenantId: dto.tenantId ?? null,
        ip: dto.ip ?? null,
        userAgent: dto.userAgent ?? null,
        requestId: dto.requestId ?? null,
        targetType: dto.targetType ?? null,
        targetId: dto.targetId ?? null,
        details: dto.details ?? null,
        prevHash,
        hash: computeAuditHash(prevHash, ts, { ...dto, outcome: dto.outcome ?? "success" }),
        createdAt: ts,
      });
      const saved = await manager.getRepository(AuditEventEntity).save(entity);
      this.logger.log(`Audit record ${saved.id} appended: ${dto.action} (${dto.outcome ?? "success"})`);
      return saved;
    });
  }

  /**
   * Re-walk the chain recomputing every hash. Returns the id of the first
   * broken link (or null when the chain holds).
   */
  async verify(fromId?: number, toId?: number): Promise<{
    valid: boolean;
    checked: number;
    brokenAt: number | null;
    reason?: string;
  }> {
    let cursor = fromId ?? 0;
    let expectedPrev = GENESIS_HASH;
    // When starting mid-chain, seed the expected prev from the row before it.
    if (fromId && fromId > 0) {
      const prior = await this.repo.findOne({
        where: { id: fromId - 1 },
        select: ["id", "hash"],
      });
      if (!prior) {
        return { valid: false, checked: 0, brokenAt: null, reason: `no record before id ${fromId}` };
      }
      expectedPrev = prior.hash;
    }

    let checked = 0;
    for (;;) {
      const chunk = await this.repo
        .createQueryBuilder("a")
        .where("a.id > :cursor", { cursor })
        .andWhere(toId ? "a.id <= :toId" : "TRUE", { toId })
        .orderBy("a.id", "ASC")
        .take(VERIFY_CHUNK)
        .getMany();

      if (chunk.length === 0) break;
      for (const row of chunk) {
        const expected = computeAuditHash(row.prevHash, row.createdAt, row);
        if (row.prevHash !== expectedPrev) {
          return {
            valid: false,
            checked,
            brokenAt: row.id,
            reason: "broken link: prev_hash does not match the previous record",
          };
        }
        if (row.hash !== expected) {
          return {
            valid: false,
            checked,
            brokenAt: row.id,
            reason: "hash mismatch: record content does not match its hash",
          };
        }
        expectedPrev = row.hash;
        cursor = row.id;
        checked += 1;
      }
      if (chunk.length < VERIFY_CHUNK) break;
    }
    return { valid: true, checked, brokenAt: null };
  }

  async findMany(query: AuditQuery): Promise<{
    total: number;
    page: number;
    limit: number;
    data: AuditEventEntity[];
  }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;

    const qb: SelectQueryBuilder<AuditEventEntity> = this.repo.createQueryBuilder("a");
    if (query.actionPrefix) {
      qb.andWhere("a.action LIKE :prefix", { prefix: `${query.actionPrefix}%` });
    }
    if (query.outcome) {
      qb.andWhere("a.outcome = :outcome", { outcome: query.outcome });
    }
    if (query.accountId !== undefined) {
      qb.andWhere("a.account_id = :accountId", { accountId: query.accountId });
    }
    if (query.targetType) {
      qb.andWhere("a.target_type = :targetType", { targetType: query.targetType });
    }
    if (query.targetId) {
      qb.andWhere("a.target_id = :targetId", { targetId: query.targetId });
    }
    if (query.from) {
      qb.andWhere("a.created_at >= :from", { from: query.from });
    }
    if (query.to) {
      qb.andWhere("a.created_at <= :to", { to: query.to });
    }

    qb.orderBy("a.id", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { total, page, limit, data };
  }
}
