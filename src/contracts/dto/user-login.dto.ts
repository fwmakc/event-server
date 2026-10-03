import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsString, IsOptional } from "class-validator";

export class UserLoginDto {
  @ApiProperty({ description: "Account ID" })
  @IsNumber()
  userId: number;

  @ApiProperty({ description: "Username (email)" })
  @IsString()
  username: string;

  @ApiProperty({ required: false, description: "Email (всегда = username)" })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ required: false, description: "IP клиента" })
  @IsOptional()
  @IsString()
  ip?: string;

  @ApiProperty({ required: false, description: "User-Agent" })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiProperty({ required: false, description: "ОС из User-Agent" })
  @IsOptional()
  @IsString()
  os?: string;

  @ApiProperty({ required: false, description: "Браузер из User-Agent" })
  @IsOptional()
  @IsString()
  browser?: string;
}
