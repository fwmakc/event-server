import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class MailComplainedDto {
  @ApiProperty({ description: "Recipient address that filed the complaint" })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: "Provider reporting the complaint",
    enum: ["smtp", "postmark", "ses", "sendgrid"],
  })
  @IsIn(["smtp", "postmark", "ses", "sendgrid"])
  provider: string;

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

  @ApiProperty({ description: "ISO timestamp of the complaint" })
  @IsString()
  complainedAt: string;
}
