export { UserRegisteredDto } from "./dto/user-registered.dto";
export { UserConfirmedDto } from "./dto/user-confirmed.dto";
export { PasswordResetDto } from "./dto/password-reset.dto";
export { UserDeactivatedDto } from "./dto/user-deactivated.dto";
export { UserDeletedDto } from "./dto/user-deleted.dto";
export { WebhookEnvelopeDto } from "./dto/webhook-envelope.dto";

import { UserRegisteredDto } from "./dto/user-registered.dto";
import { UserConfirmedDto } from "./dto/user-confirmed.dto";
import { PasswordResetDto } from "./dto/password-reset.dto";
import { UserDeactivatedDto } from "./dto/user-deactivated.dto";
import { UserDeletedDto } from "./dto/user-deleted.dto";

export const EventContracts = {
  "user.registered": UserRegisteredDto,
  "user.confirmed": UserConfirmedDto,
  "password.reset": PasswordResetDto,
  "user.deactivated": UserDeactivatedDto,
  "user.deleted": UserDeletedDto,
} as const;

export type EventPattern = keyof typeof EventContracts;
