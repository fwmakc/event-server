import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class PasswordResetDto {
  @ApiProperty({ description: "Username (email)" })
  @IsString()
  username: string;

  @ApiProperty({ description: "Email (всегда = username)" })
  @IsString()
  email: string;

  // consumer (message-server) defaults to "Password Reset" — the publisher
  // (auth reset handler) takes it from the client body, which legitimately
  // omits it; a required subject here silently killed reset mails
  @ApiProperty({ description: "Тема письма", required: false })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({ description: "URL сброса пароля" })
  @IsString()
  resetUrl: string;
}
