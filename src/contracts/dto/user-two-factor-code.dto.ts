import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsString, IsOptional } from "class-validator";

export class UserTwoFactorCodeDto {
  @ApiProperty({ description: "Account ID" })
  @IsNumber()
  userId: number;

  @ApiProperty({ description: "Username (email)" })
  @IsString()
  username: string;

  @ApiProperty({ description: "Email (всегда = username)" })
  @IsString()
  email: string;

  @ApiProperty({ description: "Одноразовый код подтверждения" })
  @IsString()
  code: string;

  @ApiProperty({ required: false, description: "Тема письма" })
  @IsOptional()
  @IsString()
  subject?: string;
}
