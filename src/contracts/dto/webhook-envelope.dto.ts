import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsString, IsObject, IsDateString } from "class-validator";

export class WebhookEnvelopeDto {
  @ApiProperty({ description: "ID события в event-server" })
  @IsNumber()
  eventId: number;

  @ApiProperty({ description: "Паттерн события", example: "user.registered" })
  @IsString()
  pattern: string;

  @ApiProperty({ description: "Domain payload события", type: Object })
  @IsObject()
  payload: Record<string, any>;

  @ApiProperty({ description: "Сервис-издатель", example: "auth-server" })
  @IsString()
  source: string;

  @ApiProperty({ description: "ISO 8601 timestamp доставки" })
  @IsString()
  timestamp: string;

  @ApiProperty({ description: "Номер попытки доставки" })
  @IsNumber()
  attempt: number;
}
