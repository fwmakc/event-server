"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContractsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const index_1 = require("./index");
const user_registered_dto_1 = require("./dto/user-registered.dto");
const user_confirmed_dto_1 = require("./dto/user-confirmed.dto");
const password_reset_dto_1 = require("./dto/password-reset.dto");
const user_deactivated_dto_1 = require("./dto/user-deactivated.dto");
const user_deleted_dto_1 = require("./dto/user-deleted.dto");
const webhook_envelope_dto_1 = require("./dto/webhook-envelope.dto");
let ContractsController = class ContractsController {
    getCatalog() {
        return Object.entries(index_1.EventContracts).map(([pattern, dto]) => ({
            pattern,
            schema: dto.name,
        }));
    }
};
__decorate([
    (0, common_1.Get)("catalog"),
    (0, swagger_1.ApiOperation)({ summary: "Реестр всех контрактов событий" }),
    (0, swagger_1.ApiExtraModels)(user_registered_dto_1.UserRegisteredDto, user_confirmed_dto_1.UserConfirmedDto, password_reset_dto_1.PasswordResetDto, user_deactivated_dto_1.UserDeactivatedDto, user_deleted_dto_1.UserDeletedDto, webhook_envelope_dto_1.WebhookEnvelopeDto),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ContractsController.prototype, "getCatalog", null);
ContractsController = __decorate([
    (0, swagger_1.ApiTags)("Event Contracts"),
    (0, common_1.Controller)("events")
], ContractsController);
exports.ContractsController = ContractsController;
//# sourceMappingURL=contracts.controller.js.map