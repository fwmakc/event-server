import { ApiProperty } from "@nestjs/swagger";
import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

/**
 * One tamper-evident audit record. Published with the "audit.event" pattern.
 * `action` is an open dot-path (auth.login.failed, access.denied, data.updated);
 * everything except `action` is optional so anonymous events (e.g. a failed
 * login for an unknown username) can be recorded too.
 *
 * `details` MUST NOT contain secrets or plaintext passwords — it is stored
 * verbatim in the append-only audit store.
 */
export class AuditEventDto {
  @ApiProperty({ description: "Action dot-path, e.g. auth.login.failed" })
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]{1,128}$/)
  action: string;

  @ApiProperty({
    description: "Outcome of the audited operation",
    enum: ["allow", "deny", "success", "failure"],
    required: false,
  })
  @IsOptional()
  @IsIn(["allow", "deny", "success", "failure"])
  outcome?: string;

  @ApiProperty({ description: "Acting account id", required: false })
  @IsOptional()
  @IsNumber()
  accountId?: number;

  @ApiProperty({ description: "Acting account username (email), snapshot", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  accountUsername?: string;

  @ApiProperty({ description: "Tenant id of the acting account", required: false })
  @IsOptional()
  @IsNumber()
  tenantId?: number;

  @ApiProperty({ description: "Client IP", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ip?: string;

  @ApiProperty({ description: "User-Agent", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;

  @ApiProperty({ description: "Correlation id (X-Request-Id)", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  requestId?: string;

  @ApiProperty({ description: "Target object type, e.g. account/file", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  targetType?: string;

  @ApiProperty({ description: "Target object id (string form)", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetId?: string;

  @ApiProperty({
    description: "Extra structured details (no secrets)",
    required: false,
    type: Object,
  })
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
