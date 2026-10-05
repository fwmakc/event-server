import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class MailBouncedDto {
  @ApiProperty({ description: "Recipient address that bounced" })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: "Provider reporting the bounce",
    enum: ["smtp", "postmark", "ses", "sendgrid"],
  })
  @IsIn(["smtp", "postmark", "ses", "sendgrid"])
  provider: string;

  @ApiProperty({
    description: "hard = permanent (suppression candidate), soft = transient (retry path)",
    enum: ["hard", "soft"],
  })
  @IsIn(["hard", "soft"])
  type: "hard" | "soft";

  @ApiPropertyOptional({ description: "Provider/diagnostic reason" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional({ description: "Provider message id of the original send" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  messageId?: string;

  @ApiProperty({ description: "ISO timestamp of the bounce" })
  @IsString()
  bouncedAt: string;
}
