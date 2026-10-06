import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import * as zlib from "node:zlib";
import { pipeline } from "node:stream/promises";
import { DataSource, QueryRunner, SelectQueryBuilder } from "typeorm";
import { AuditStoreService, computeAuditHash } from "@src/audit/audit-store.service";
import { AuditEventEntity } from "@src/database/entities";
import { AuditEventDto } from "@src/contracts";

/** Advisory-lock key for retention runs: two overlapping cron invocations
 * must not interleave export/purge. */
const LOCK_KEY = "audit_retention";
const CHUNK = 5000;

export class RetentionError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}

export interface RetentionArgs {
  /** Purge/export rows with created_at < before. */
  before?: Date;
  /** Purge/export rows with id <= toId. */
  toId?: number;
  outDir: string;
  exportOnly: boolean;
  purgeOnly: boolean;
  /** Required for purge without a preceding export. */
  force: boolean;
  /** Skip the post-export archive re-verification (discouraged). */
  noVerify: boolean;
  batch: number;
}

export interface ArchiveMeta {
  exportedAt: string;
  criteria: { before?: string; toId?: number };
  rows: number;
  firstId?: number;
  /** What the first exported row chained onto (genesis for a table start). */
  firstPrevHash?: string;
  lastId?: number;
  /** Chain base for what REMAINS after purging this range — the seed for
   * GET /audit/verify?fromId=&baseHash= once the prefix is gone. */
  lastHash?: string;
  /** sha256 of the uncompressed NDJSON stream. */
  sha256: string;
  verified?: boolean;
}

export interface ExportResult {
  file: string;
  metaFile: string;
  meta: ArchiveMeta;
}

export interface RetentionResult {
  archive: ExportResult | null;
  purgedRows: number;
}

export function parseRetentionArgs(argv: string[]): RetentionArgs {
  const args: RetentionArgs = {
    outDir: "./audit-archives",
    exportOnly: false,
    purgeOnly: false,
    force: false,
    noVerify: false,
    batch: 5000,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = (): string => {
      if (i + 1 >= argv.length) throw new RetentionError(`flag ${flag} needs a value`, 1);
      return argv[++i];
    };
    switch (flag) {
      case "--before": {
        const raw = value();
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) {
          throw new RetentionError(`--before "${raw}" is not a valid date`, 1);
        }
        args.before = date;
        break;
      }
      case "--to-id": {
        const raw = value();
        if (!/^\d+$/.test(raw)) throw new RetentionError(`--to-id "${raw}" is not an integer`, 1);
        args.toId = Number(raw);
        break;
      }
      case "--out":
        args.outDir = value();
        break;
      case "--batch": {
        const raw = value();
        if (!/^\d+$/.test(raw) || Number(raw) === 0) {
          throw new RetentionError(`--batch "${raw}" is not a positive integer`, 1);
        }
        args.batch = Number(raw);
        break;
      }
      case "--purge-only":
        args.purgeOnly = true;
        break;
      case "--export-only":
        args.exportOnly = true;
        break;
      case "--force":
        args.force = true;
        break;
      case "--no-verify":
        args.noVerify = true;
        break;
      default:
        throw new RetentionError(`unknown flag "${flag}"`, 1);
    }
  }
  if (args.purgeOnly && args.exportOnly) {
    throw new RetentionError("--purge-only and --export-only are mutually exclusive", 1);
  }
  if (args.purgeOnly && !args.force) {
    throw new RetentionError(
      "purge without export destroys records unarchived — pass --force to confirm",
      1,
    );
  }
  if (!args.before && args.toId === undefined) {
    throw new RetentionError("pick a range: --before <date> and/or --to-id <id>", 1);
  }
  return args;
}

type RangeCriteria = { before?: Date; toId?: number };

/** Sets the range conditions on a fresh query builder (call instead of
 * where()). String conditions on purpose: an array of FindOptionsWhere
 * would be OR. */
function applyRange(
  qb: SelectQueryBuilder<AuditEventEntity>,
  criteria: RangeCriteria,
): SelectQueryBuilder<AuditEventEntity> {
  qb.where("TRUE");
  if (criteria.before) {
    qb.andWhere("a.created_at < :before", { before: criteria.before });
  }
  if (criteria.toId !== undefined) {
    qb.andWhere("a.id <= :toId", { toId: criteria.toId });
  }
  return qb;
}

/** Session-scoped advisory lock on its own connection: held for the whole
 * run, released by the caller in finally. Null when another run holds it. */
export async function acquireRetentionLock(ds: DataSource): Promise<QueryRunner | null> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  const rows: { locked: boolean }[] = await qr.query(
    `SELECT pg_try_advisory_lock(hashtext('${LOCK_KEY}')) AS locked`,
  );
  if (rows[0]?.locked !== true) {
    await qr.release();
    return null;
  }
  return qr;
}

export async function releaseRetentionLock(qr: QueryRunner): Promise<void> {
  try {
    await qr.query(`SELECT pg_advisory_unlock(hashtext('${LOCK_KEY}'))`);
  } finally {
    await qr.release();
  }
}

/** Stream the range to <outDir>/audit-export-<stamp>.ndjson.gz (one entity
 * JSON per line) computing the uncompressed sha256 along the way, plus a
 * .meta.json sidecar with the chain-boundary bookkeeping. */
export async function exportAuditRange(
  ds: DataSource,
  criteria: { before?: Date; toId?: number },
  outDir: string,
  batch = CHUNK,
): Promise<ExportResult> {
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(outDir, `audit-export-${stamp}.ndjson.gz`);
  const metaFile = `${file}.meta.json`;
  const repo = ds.getRepository(AuditEventEntity);
  const digest = crypto.createHash("sha256");

  const meta: ArchiveMeta = {
    exportedAt: new Date().toISOString(),
    criteria: {
      ...(criteria.before ? { before: criteria.before.toISOString() } : {}),
      ...(criteria.toId !== undefined ? { toId: criteria.toId } : {}),
    },
    rows: 0,
    sha256: "",
  };

  async function* lines(): AsyncGenerator<string> {
    let cursor = 0;
    for (;;) {
      const rows = await applyRange(repo.createQueryBuilder("a"), criteria)
        .andWhere("a.id > :cursor", { cursor })
        .orderBy("a.id", "ASC")
        .take(batch)
        .getMany();
      if (rows.length === 0) break;
      for (const row of rows) {
        meta.rows += 1;
        if (meta.firstId === undefined) {
          meta.firstId = row.id;
          meta.firstPrevHash = row.prevHash;
        }
        meta.lastId = row.id;
        meta.lastHash = row.hash;
        cursor = row.id;
        const line = `${JSON.stringify(row)}\n`;
        digest.update(line);
        yield line;
      }
    }
  }

  await pipeline(lines(), zlib.createGzip(), fs.createWriteStream(file));
  meta.sha256 = digest.digest("hex");
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
  return { file, metaFile, meta };
}

export interface ArchiveVerdict {
  valid: boolean;
  checked: number;
  brokenAt: number | null;
  reason?: string;
}

/** Re-walk an archive: every row's self-hash plus the prev→hash linkage
 * from the second row on (the first row's parent is outside the file —
 * its boundary is recorded in the meta as firstId/firstPrevHash). */
export async function verifyArchive(file: string): Promise<ArchiveVerdict> {
  const input = fs.createReadStream(file).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let checked = 0;
  let prevHash: string | undefined;
  try {
    for await (const line of rl) {
      if (line.length === 0) continue;
      let row: AuditEventEntity;
      try {
        row = JSON.parse(line);
      } catch {
        return { valid: false, checked, brokenAt: null, reason: `malformed JSON line ${checked + 1}` };
      }
      const expected = computeAuditHash(row.prevHash, new Date(row.createdAt), row);
      if (row.hash !== expected) {
        return {
          valid: false,
          checked,
          brokenAt: row.id ?? null,
          reason: `hash mismatch at id ${row.id}: content does not match its hash`,
        };
      }
      if (prevHash !== undefined && row.prevHash !== prevHash) {
        return {
          valid: false,
          checked,
          brokenAt: row.id ?? null,
          reason: `broken link at id ${row.id}: prev_hash does not match the previous row`,
        };
      }
      prevHash = row.hash;
      checked += 1;
    }
  } finally {
    rl.close();
    input.destroy();
  }
  return { valid: true, checked, brokenAt: null };
}

/** Batched DELETE of the range; returns the number of removed rows.
 * Batching keeps every transaction short so autovacuum can keep up. */
export async function purgeAuditRange(
  ds: DataSource,
  criteria: { before?: Date; toId?: number },
  batch = CHUNK,
): Promise<number> {
  const repo = ds.getRepository(AuditEventEntity);
  let total = 0;
  for (;;) {
    const rows = await applyRange(repo.createQueryBuilder("a"), criteria)
      .orderBy("a.id", "ASC")
      .take(batch)
      .getMany();
    if (rows.length === 0) break;
    await repo.delete(rows.map((row) => row.id));
    total += rows.length;
  }
  return total;
}

/**
 * Orchestrates one retention run under the advisory lock:
 * export → verify archive → purge → self-audit (audit.purged appended
 * through the normal chained path, documenting the truncation in the
 * journal itself). Safe order is enforced: purge never runs unless the
 * archive (when produced) verified clean.
 */
export async function runRetention(ds: DataSource, args: RetentionArgs): Promise<RetentionResult> {
  const criteria = { before: args.before, toId: args.toId };
  const lock = await acquireRetentionLock(ds);
  if (!lock) {
    throw new RetentionError("another retention run holds the advisory lock", 1);
  }
  try {
    let archive: ExportResult | null = null;
    if (!args.purgeOnly) {
      archive = await exportAuditRange(ds, criteria, args.outDir, args.batch);
      if (!args.noVerify) {
        const verdict = await verifyArchive(archive.file);
        if (!verdict.valid) {
          throw new RetentionError(
            `archive failed verification (${verdict.reason}) — purge aborted; ` +
              `delete the bad archive and re-run`,
            2,
          );
        }
        archive.meta.verified = true;
        fs.writeFileSync(archive.metaFile, JSON.stringify(archive.meta, null, 2));
      }
    }

    let purgedRows = 0;
    if (!args.exportOnly) {
      purgedRows = await purgeAuditRange(ds, criteria, args.batch);
      if (purgedRows > 0) {
        const store = new AuditStoreService(ds.getRepository(AuditEventEntity));
        const dto: AuditEventDto = {
          action: "audit.purged",
          outcome: "success",
          targetType: "audit_events",
          details: {
            criteria: {
              ...(args.before ? { before: args.before.toISOString() } : {}),
              ...(args.toId !== undefined ? { toId: args.toId } : {}),
            },
            purgedRows,
            archive: archive ? path.basename(archive.file) : null,
            chainBase:
              archive && archive.meta.lastHash
                ? { lastId: archive.meta.lastId, lastHash: archive.meta.lastHash }
                : null,
          },
        };
        await store.append(dto);
      }
    }

    return { archive, purgedRows };
  } finally {
    await releaseRetentionLock(lock);
  }
}

async function main(): Promise<void> {
  let args: RetentionArgs;
  try {
    args = parseRetentionArgs(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  const { default: AppDataSource } = await import("../config/typeorm.config");
  const ds = AppDataSource;
  if (!ds.isInitialized) await ds.initialize();

  try {
    const result = await runRetention(ds, args);
    const meta = result.archive?.meta;
    console.log(
      JSON.stringify({
        status: "ok",
        purgedRows: result.purgedRows,
        ...(result.archive
          ? {
              archive: result.archive.file,
              meta: result.archive.metaFile,
              exportedRows: meta?.rows,
              sha256: meta?.sha256,
              // keep this pair: it seeds /audit/verify for the surviving base
              chainBase: { lastId: meta?.lastId, lastHash: meta?.lastHash },
            }
          : {}),
      }),
    );
  } catch (err) {
    if (err instanceof RetentionError) {
      console.error(err.message);
      process.exit(err.exitCode);
    }
    throw err;
  } finally {
    if (ds.isInitialized) await ds.destroy();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(3);
  });
}
