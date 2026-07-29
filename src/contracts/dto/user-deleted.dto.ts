import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsString } from "class-validator";

export class UserDeletedDto {
  @ApiProperty({ description: "Account ID" })
  @IsNumber()
  userId: number;

  @ApiProperty({ description: "Username (email)" })
  @IsString()
  username: string;

  @ApiProperty({ description: "Email (всегда = username)" })
  @IsString()
  email: string;
}
