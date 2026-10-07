import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNumber, IsString } from "class-validator";

export class UserRolesChangedDto {
  @ApiProperty({ description: "Account ID" })
  @IsNumber()
  userId: number;

  @ApiProperty({ description: "Username (email)" })
  @IsString()
  username: string;

  @ApiProperty({ description: "Email (всегда = username)" })
  @IsString()
  email: string;

  @ApiProperty({
    description: "Полный набор имён ролей после изменения (пустой = все сняты)",
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  roles: string[];
}
