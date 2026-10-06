import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from "@nestjs/common";
import { InternalAuthGuard } from "api-server-toolkit/guard";
import { AuditQuery, AuditStoreService } from "./audit-store.service";

/**
 * Internal audit access: query the append-only store and verify the
 * tamper-evident hash chain. Guarded by X-Internal-Api-Key — exposing these
 * through the gateway to human operators is a gateway-level decision.
 */
@Controller("audit")
@UseGuards(InternalAuthGuard)
export class AuditController {
  constructor(private readonly auditStore: AuditStoreService) {}

  @Get("events")
  findMany(
    @Query("actionPrefix") actionPrefix?: string,
    @Query("outcome") outcome?: string,
    @Query("accountId") accountId?: string,
    @Query("targetType") targetType?: string,
    @Query("targetId") targetId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const query: AuditQuery = {
      actionPrefix,
      outcome,
      targetType,
      targetId,
      from,
      to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    };
    if (accountId && /^\d+$/.test(accountId)) {
      query.accountId = Number(accountId);
    }
    return this.auditStore.findMany(query);
  }

  @Get("verify")
  verify(
    @Query("fromId") fromId?: string,
    @Query("toId") toId?: string,
    @Query("baseHash") baseHash?: string,
  ) {
    if (baseHash !== undefined && !/^[0-9a-f]{64}$/i.test(baseHash)) {
      throw new BadRequestException("baseHash must be a 64-char hex sha256");
    }
    return this.auditStore.verify(
      fromId && /^\d+$/.test(fromId) ? Number(fromId) : undefined,
      toId && /^\d+$/.test(toId) ? Number(toId) : undefined,
      baseHash,
    );
  }
}
