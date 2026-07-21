import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

export type DeliveryStatus = "pending" | "delivered" | "failed";

@Entity("deliveries")
@Index("idx_deliveries_status_next", ["status", "nextAttemptAt"])
@Index("idx_deliveries_event", ["eventId"])
@Index("idx_deliveries_subscriber", ["subscriberId"])
export class DeliveryEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "event_id", type: "int" })
  eventId: number;

  @Column({ name: "subscriber_id", type: "int" })
  subscriberId: number;

  @Column({ type: "varchar", default: "pending" })
  status: DeliveryStatus;

  @Column({ type: "int", default: 0 })
  attempts: number;

  @Column({ name: "max_attempts", type: "int", default: 5 })
  maxAttempts: number;

  @Column({ name: "last_attempt_at", type: "timestamptz", nullable: true })
  lastAttemptAt: Date | null;

  @Column({ name: "next_attempt_at", type: "timestamptz", nullable: true })
  nextAttemptAt: Date | null;

  @Column({ name: "response_code", type: "int", nullable: true })
  responseCode: number | null;

  @Column({ name: "response_body", type: "text", nullable: true })
  responseBody: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
