import { IsString, IsNotEmpty, IsArray, IsOptional, IsBoolean, ArrayMinSize, MinLength } from "class-validator";

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

  // Optional per-subscriber HMAC secret for signed deliveries. Registrant
  // (an internal service) brings its own so both sides know it. Without
  // `secret` the delivery stays on the shared internal-key transport —
  // set `generateSecret: true` to have one generated and returned once.
  @IsOptional()
  @IsString()
  @MinLength(32)
  secret?: string;

  @IsOptional()
  @IsBoolean()
  generateSecret?: boolean;

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
  @IsString()
  @MinLength(32)
  secret?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
