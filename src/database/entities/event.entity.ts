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
