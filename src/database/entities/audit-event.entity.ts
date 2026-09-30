import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/**
 * Append-only, hash-chained security audit store. Rows are only ever INSERTed:
 * the service exposes no update/delete paths, and the hash chain
 * (hash = sha256(prev_hash | ts | fields)) makes silent tampering detectable
 * via GET /audit/verify.
 */
@Entity("audit_events")
@Index("idx_audit_events_action", ["action"])
@Index("idx_audit_events_account", ["accountId"])
@Index("idx_audit_events_created", ["createdAt"])
@Index("idx_audit_events_hash", ["hash"], { unique: true })
export class AuditEventEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar" })
  action: string;

  @Column({ type: "varchar", default: "success" })
  outcome: string;

  @Column({ name: "account_id", type: "bigint", nullable: true })
  accountId: number | null;

  @Column({ name: "account_username", type: "varchar", nullable: true })
  accountUsername: string | null;

  @Column({ name: "tenant_id", type: "bigint", nullable: true })
  tenantId: number | null;

  @Column({ type: "varchar", nullable: true })
  ip: string | null;

  @Column({ name: "user_agent", type: "varchar", nullable: true })
  userAgent: string | null;

  @Column({ name: "request_id", type: "varchar", nullable: true })
  requestId: string | null;

  @Column({ name: "target_type", type: "varchar", nullable: true })
  targetType: string | null;

  @Column({ name: "target_id", type: "varchar", nullable: true })
  targetId: string | null;

  @Column({ type: "jsonb", nullable: true })
  details: Record<string, unknown> | null;

  @Column({ name: "prev_hash", type: "char", length: 64 })
  prevHash: string;

  @Column({ type: "char", length: 64 })
  hash: string;

  /** Server-side wall-clock time of the write; part of the hash material. */
  @Column({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
