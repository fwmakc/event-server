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
export class SubscriberEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar" })
  service: string;

  @Column({ type: "varchar" })
  url: string;

  @Column({ type: "text", array: true, default: [] })
  patterns: string[];

  @Column({ type: "boolean", default: true })
  active: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
