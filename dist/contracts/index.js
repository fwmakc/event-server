"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventContracts = exports.WebhookEnvelopeDto = exports.UserDeletedDto = exports.UserDeactivatedDto = exports.PasswordResetDto = exports.UserConfirmedDto = exports.UserRegisteredDto = void 0;
var user_registered_dto_1 = require("./dto/user-registered.dto");
Object.defineProperty(exports, "UserRegisteredDto", { enumerable: true, get: function () { return user_registered_dto_1.UserRegisteredDto; } });
var user_confirmed_dto_1 = require("./dto/user-confirmed.dto");
Object.defineProperty(exports, "UserConfirmedDto", { enumerable: true, get: function () { return user_confirmed_dto_1.UserConfirmedDto; } });
var password_reset_dto_1 = require("./dto/password-reset.dto");
Object.defineProperty(exports, "PasswordResetDto", { enumerable: true, get: function () { return password_reset_dto_1.PasswordResetDto; } });
var user_deactivated_dto_1 = require("./dto/user-deactivated.dto");
Object.defineProperty(exports, "UserDeactivatedDto", { enumerable: true, get: function () { return user_deactivated_dto_1.UserDeactivatedDto; } });
var user_deleted_dto_1 = require("./dto/user-deleted.dto");
Object.defineProperty(exports, "UserDeletedDto", { enumerable: true, get: function () { return user_deleted_dto_1.UserDeletedDto; } });
var webhook_envelope_dto_1 = require("./dto/webhook-envelope.dto");
Object.defineProperty(exports, "WebhookEnvelopeDto", { enumerable: true, get: function () { return webhook_envelope_dto_1.WebhookEnvelopeDto; } });
const user_registered_dto_2 = require("./dto/user-registered.dto");
const user_confirmed_dto_2 = require("./dto/user-confirmed.dto");
const password_reset_dto_2 = require("./dto/password-reset.dto");
const user_deactivated_dto_2 = require("./dto/user-deactivated.dto");
const user_deleted_dto_2 = require("./dto/user-deleted.dto");
exports.EventContracts = {
    "user.registered": user_registered_dto_2.UserRegisteredDto,
    "user.confirmed": user_confirmed_dto_2.UserConfirmedDto,
    "password.reset": password_reset_dto_2.PasswordResetDto,
    "user.deactivated": user_deactivated_dto_2.UserDeactivatedDto,
    "user.deleted": user_deleted_dto_2.UserDeletedDto,
};
//# sourceMappingURL=index.js.map