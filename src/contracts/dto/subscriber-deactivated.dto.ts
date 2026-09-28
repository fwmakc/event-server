import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsString } from "class-validator";

export class SubscriberDeactivatedDto {
  @ApiProperty({ description: "Deactivated subscriber ID" })
  @IsNumber()
  subscriberId: number;

  @ApiProperty({ description: "Subscriber service name" })
  @IsString()
  service: string;

  @ApiProperty({ description: "Subscriber webhook URL" })
  @IsString()
  url: string;

  @ApiProperty({ description: "Consecutive permanent failures that tripped the circuit breaker" })
  @IsNumber()
  failures: number;

  @ApiProperty({ description: "ISO timestamp of the deactivation" })
  @IsString()
  deactivatedAt: string;
}
