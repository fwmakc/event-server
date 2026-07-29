import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsString, IsOptional } from "class-validator";

export class UserRegisteredDto {
  @ApiProperty({ description: "Account ID" })
  @IsNumber()
  userId: number;

  @ApiProperty({ description: "Username (email)" })
  @IsString()
  username: string;

  @ApiProperty({ description: "Email (всегда = username)" })
  @IsString()
  email: string;

  @ApiProperty({ required: false, description: "Тема письма" })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({ required: false, description: "URL подтверждения" })
  @IsOptional()
  @IsString()
  confirmUrl?: string;
}
