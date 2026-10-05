export { UserRegisteredDto } from "./dto/user-registered.dto";
export { UserLoginDto } from "./dto/user-login.dto";
export { UserConfirmedDto } from "./dto/user-confirmed.dto";
export { PasswordResetDto } from "./dto/password-reset.dto";
export { UserDeactivatedDto } from "./dto/user-deactivated.dto";
export { UserDeletedDto } from "./dto/user-deleted.dto";
export { UserTwoFactorCodeDto } from "./dto/user-two-factor-code.dto";
export { WebhookEnvelopeDto } from "./dto/webhook-envelope.dto";
export { SubscriberDeactivatedDto } from "./dto/subscriber-deactivated.dto";
export { AuditEventDto } from "./dto/audit-event.dto";
export { MailBouncedDto } from "./dto/mail-bounced.dto";
export { MailComplainedDto } from "./dto/mail-complained.dto";

import { UserRegisteredDto } from "./dto/user-registered.dto";
import { UserLoginDto } from "./dto/user-login.dto";
import { UserConfirmedDto } from "./dto/user-confirmed.dto";
import { PasswordResetDto } from "./dto/password-reset.dto";
import { UserDeactivatedDto } from "./dto/user-deactivated.dto";
import { UserDeletedDto } from "./dto/user-deleted.dto";
import { UserTwoFactorCodeDto } from "./dto/user-two-factor-code.dto";
import { SubscriberDeactivatedDto } from "./dto/subscriber-deactivated.dto";
import { AuditEventDto } from "./dto/audit-event.dto";
import { MailBouncedDto } from "./dto/mail-bounced.dto";
import { MailComplainedDto } from "./dto/mail-complained.dto";

export const EventContracts = {
  "user.registered": UserRegisteredDto,
  "user.login": UserLoginDto,
  "user.confirmed": UserConfirmedDto,
  "password.reset": PasswordResetDto,
  "user.deactivated": UserDeactivatedDto,
  "user.deleted": UserDeletedDto,
  "user.two_factor_code": UserTwoFactorCodeDto,
  "subscriber.deactivated": SubscriberDeactivatedDto,
  "audit.event": AuditEventDto,
  "mail.bounced": MailBouncedDto,
  "mail.complained": MailComplainedDto,
} as const;

export type EventPattern = keyof typeof EventContracts;
