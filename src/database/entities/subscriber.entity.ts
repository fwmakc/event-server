import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("subscribers")
@Index("idx_subscribers_active", ["active"])
// GIN index on the patterns array — created by the AddSubscriberGinIndex
// migration; TypeORM cannot express GIN via decorators, and this version's
// IndexOptions type predates the `synchronize` flag (runtime honors it), so
// cast. Keeps the index out of schema diffing.
@Index("idx_subscribers_patterns", ["patterns"], { synchronize: false } as any)
export class SubscriberEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar" })
  service: string;

  @Column({ type: "varchar" })
  url: string;

  @Column({ type: "text", array: true, default: [] })
  patterns: string[];

  // Per-subscriber HMAC secret for delivery signatures. Nullable: legacy
  // subscribers keep the shared-key transport until a secret is provisioned.
  // Never returned by list/read endpoints — only at create/rotate.
  @Column({ type: "varchar", nullable: true })
  secret: string | null;

  @Column({ type: "boolean", default: true })
  active: boolean;

  @Column({ name: "failure_streak", type: "int", default: 0 })
  failureStreak: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
