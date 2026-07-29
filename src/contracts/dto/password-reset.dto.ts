import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class PasswordResetDto {
  @ApiProperty({ description: "Username (email)" })
  @IsString()
  username: string;

  @ApiProperty({ description: "Email (всегда = username)" })
  @IsString()
  email: string;

  @ApiProperty({ description: "Тема письма" })
  @IsString()
  subject: string;

  @ApiProperty({ description: "URL сброса пароля" })
  @IsString()
  resetUrl: string;
}
