import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

export type EventStatus = "pending" | "processing" | "delivered" | "failed";
export type EventPriority = "low" | "normal" | "high";

@Entity("events")
@Index("idx_events_status_deliver", ["status", "deliverAfter"])
@Index("idx_events_pattern", ["pattern"])
@Index("idx_events_expires", ["expiresAt"])
// journal 14: claim ordering (priority, createdAt) must be an index scan, not
// a sort of the whole due backlog. Partial: the claim only reads pending.
@Index("idx_events_claim", ["status", "priorityRank", "createdAt"], {
  where: `"status" = 'pending'`,
})
export class EventEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar" })
  pattern: string;

  @Column({ type: "jsonb" })
  payload: any;

  @Column({ type: "varchar" })
  source: string;

  @Column({ type: "boolean", default: true })
  broadcast: boolean;

  @Column({ name: "await_response", type: "boolean", default: false })
  awaitResponse: boolean;

  @Column({ type: "int", default: 30 })
  timeout: number;

  @Column({ name: "max_attempts", type: "int", default: 5 })
  maxAttempts: number;

  @Column({ name: "retry_delay", type: "int", default: 1 })
  retryDelay: number;

  @Column({ type: "boolean", default: true })
  log: boolean;

  @Column({ type: "int", nullable: true, default: 7 })
  ttl: number | null;

  @Column({ type: "varchar", default: "normal" })
  priority: EventPriority;

  // journal 14: static claim rank — lets the delivery claim walk an index
  // instead of sorting every due event under a pessimistic lock. A ~30k
  // no-subscriber backlog (audit.event on a stock deployment) otherwise
  // gets re-sorted every worker cycle and honest deliveries stall.
  @Column({
    name: "priority_rank",
    type: "smallint",
    asExpression: `CASE "priority" WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END`,
    generatedType: "STORED",
  })
  priorityRank: number;

  @Column({ type: "int", default: 0 })
  delay: number;

  @Column({ type: "varchar", default: "pending" })
  status: EventStatus;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @Column({ name: "expires_at", type: "timestamptz", nullable: true })
  expiresAt: Date | null;

  @Column({ name: "deliver_after", type: "timestamptz", nullable: true })
  deliverAfter: Date | null;
}
