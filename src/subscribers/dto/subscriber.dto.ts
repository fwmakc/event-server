import { IsString, IsNotEmpty, IsArray, IsOptional, IsBoolean, ArrayMinSize } from "class-validator";

export class CreateSubscriberDto {
  @IsString()
  @IsNotEmpty()
  service: string;

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  patterns: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateSubscriberDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  patterns?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
