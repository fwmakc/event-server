import { IsString, IsNotEmpty, IsBoolean, IsNumber, IsOptional, IsEnum, Min, IsObject } from "class-validator";

export class PublishEventDto {
  @IsString()
  @IsNotEmpty()
  pattern: string;

  @IsObject()
  payload: any;

  @IsString()
  @IsNotEmpty()
  source: string;

  @IsOptional()
  @IsBoolean()
  broadcast?: boolean;

  @IsOptional()
  @IsBoolean()
  awaitResponse?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  timeout?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxAttempts?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  retryDelay?: number;

  @IsOptional()
  @IsBoolean()
  log?: boolean;

  @IsOptional()
  @IsNumber()
  ttl?: number | null;

  @IsOptional()
  @IsEnum(["low", "normal", "high"])
  priority?: "low" | "normal" | "high";

  @IsOptional()
  @IsNumber()
  @Min(0)
  delay?: number;
}
