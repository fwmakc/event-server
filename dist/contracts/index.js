"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventContracts = exports.MailComplainedDto = exports.MailBouncedDto = exports.AuditEventDto = exports.SubscriberDeactivatedDto = exports.WebhookEnvelopeDto = exports.UserTwoFactorCodeDto = exports.UserRolesChangedDto = exports.UserDeletedDto = exports.UserDeactivatedDto = exports.PasswordResetDto = exports.UserConfirmedDto = exports.UserLoginDto = exports.UserRegisteredDto = void 0;
var user_registered_dto_1 = require("./dto/user-registered.dto");
Object.defineProperty(exports, "UserRegisteredDto", { enumerable: true, get: function () { return user_registered_dto_1.UserRegisteredDto; } });
var user_login_dto_1 = require("./dto/user-login.dto");
Object.defineProperty(exports, "UserLoginDto", { enumerable: true, get: function () { return user_login_dto_1.UserLoginDto; } });
var user_confirmed_dto_1 = require("./dto/user-confirmed.dto");
Object.defineProperty(exports, "UserConfirmedDto", { enumerable: true, get: function () { return user_confirmed_dto_1.UserConfirmedDto; } });
var password_reset_dto_1 = require("./dto/password-reset.dto");
Object.defineProperty(exports, "PasswordResetDto", { enumerable: true, get: function () { return password_reset_dto_1.PasswordResetDto; } });
var user_deactivated_dto_1 = require("./dto/user-deactivated.dto");
Object.defineProperty(exports, "UserDeactivatedDto", { enumerable: true, get: function () { return user_deactivated_dto_1.UserDeactivatedDto; } });
var user_deleted_dto_1 = require("./dto/user-deleted.dto");
Object.defineProperty(exports, "UserDeletedDto", { enumerable: true, get: function () { return user_deleted_dto_1.UserDeletedDto; } });
var user_roles_changed_dto_1 = require("./dto/user-roles-changed.dto");
Object.defineProperty(exports, "UserRolesChangedDto", { enumerable: true, get: function () { return user_roles_changed_dto_1.UserRolesChangedDto; } });
var user_two_factor_code_dto_1 = require("./dto/user-two-factor-code.dto");
Object.defineProperty(exports, "UserTwoFactorCodeDto", { enumerable: true, get: function () { return user_two_factor_code_dto_1.UserTwoFactorCodeDto; } });
var webhook_envelope_dto_1 = require("./dto/webhook-envelope.dto");
Object.defineProperty(exports, "WebhookEnvelopeDto", { enumerable: true, get: function () { return webhook_envelope_dto_1.WebhookEnvelopeDto; } });
var subscriber_deactivated_dto_1 = require("./dto/subscriber-deactivated.dto");
Object.defineProperty(exports, "SubscriberDeactivatedDto", { enumerable: true, get: function () { return subscriber_deactivated_dto_1.SubscriberDeactivatedDto; } });
var audit_event_dto_1 = require("./dto/audit-event.dto");
Object.defineProperty(exports, "AuditEventDto", { enumerable: true, get: function () { return audit_event_dto_1.AuditEventDto; } });
var mail_bounced_dto_1 = require("./dto/mail-bounced.dto");
Object.defineProperty(exports, "MailBouncedDto", { enumerable: true, get: function () { return mail_bounced_dto_1.MailBouncedDto; } });
var mail_complained_dto_1 = require("./dto/mail-complained.dto");
Object.defineProperty(exports, "MailComplainedDto", { enumerable: true, get: function () { return mail_complained_dto_1.MailComplainedDto; } });
const user_registered_dto_2 = require("./dto/user-registered.dto");
const user_login_dto_2 = require("./dto/user-login.dto");
const user_confirmed_dto_2 = require("./dto/user-confirmed.dto");
const password_reset_dto_2 = require("./dto/password-reset.dto");
const user_deactivated_dto_2 = require("./dto/user-deactivated.dto");
const user_deleted_dto_2 = require("./dto/user-deleted.dto");
const user_roles_changed_dto_2 = require("./dto/user-roles-changed.dto");
const user_two_factor_code_dto_2 = require("./dto/user-two-factor-code.dto");
const subscriber_deactivated_dto_2 = require("./dto/subscriber-deactivated.dto");
const audit_event_dto_2 = require("./dto/audit-event.dto");
const mail_bounced_dto_2 = require("./dto/mail-bounced.dto");
const mail_complained_dto_2 = require("./dto/mail-complained.dto");
exports.EventContracts = {
    "user.registered": user_registered_dto_2.UserRegisteredDto,
    "user.login": user_login_dto_2.UserLoginDto,
    "user.confirmed": user_confirmed_dto_2.UserConfirmedDto,
    "password.reset": password_reset_dto_2.PasswordResetDto,
    "user.deactivated": user_deactivated_dto_2.UserDeactivatedDto,
    "user.deleted": user_deleted_dto_2.UserDeletedDto,
    "user.roles_changed": user_roles_changed_dto_2.UserRolesChangedDto,
    "user.two_factor_code": user_two_factor_code_dto_2.UserTwoFactorCodeDto,
    "subscriber.deactivated": subscriber_deactivated_dto_2.SubscriberDeactivatedDto,
    "audit.event": audit_event_dto_2.AuditEventDto,
    "mail.bounced": mail_bounced_dto_2.MailBouncedDto,
    "mail.complained": mail_complained_dto_2.MailComplainedDto,
};
//# sourceMappingURL=index.js.map