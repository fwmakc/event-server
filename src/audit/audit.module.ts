import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { InternalAuthGuard } from "api-server-toolkit/guard";
import { AuditEventEntity } from "@src/database/entities";
import { AuditController } from "./audit.controller";
import { AuditStoreService } from "./audit-store.service";

@Module({
  imports: [TypeOrmModule.forFeature([AuditEventEntity])],
  controllers: [AuditController],
  providers: [AuditStoreService, InternalAuthGuard],
  exports: [AuditStoreService],
})
export class AuditModule {}
