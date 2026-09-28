export { UserRegisteredDto } from "./dto/user-registered.dto";
export { UserConfirmedDto } from "./dto/user-confirmed.dto";
export { PasswordResetDto } from "./dto/password-reset.dto";
export { UserDeactivatedDto } from "./dto/user-deactivated.dto";
export { UserDeletedDto } from "./dto/user-deleted.dto";
export { UserTwoFactorCodeDto } from "./dto/user-two-factor-code.dto";
export { WebhookEnvelopeDto } from "./dto/webhook-envelope.dto";
export { SubscriberDeactivatedDto } from "./dto/subscriber-deactivated.dto";

import { UserRegisteredDto } from "./dto/user-registered.dto";
import { UserConfirmedDto } from "./dto/user-confirmed.dto";
import { PasswordResetDto } from "./dto/password-reset.dto";
import { UserDeactivatedDto } from "./dto/user-deactivated.dto";
import { UserDeletedDto } from "./dto/user-deleted.dto";
import { UserTwoFactorCodeDto } from "./dto/user-two-factor-code.dto";
import { SubscriberDeactivatedDto } from "./dto/subscriber-deactivated.dto";

export const EventContracts = {
  "user.registered": UserRegisteredDto,
  "user.confirmed": UserConfirmedDto,
  "password.reset": PasswordResetDto,
  "user.deactivated": UserDeactivatedDto,
  "user.deleted": UserDeletedDto,
  "user.two_factor_code": UserTwoFactorCodeDto,
  "subscriber.deactivated": SubscriberDeactivatedDto,
} as const;

export type EventPattern = keyof typeof EventContracts;
