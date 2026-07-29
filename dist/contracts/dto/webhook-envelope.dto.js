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
exports.WebhookEnvelopeDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class WebhookEnvelopeDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ description: "ID события в event-server" }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], WebhookEnvelopeDto.prototype, "eventId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Паттерн события", example: "user.registered" }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], WebhookEnvelopeDto.prototype, "pattern", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Domain payload события", type: "object" }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], WebhookEnvelopeDto.prototype, "payload", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Сервис-издатель", example: "auth-server" }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], WebhookEnvelopeDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "ISO 8601 timestamp доставки" }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], WebhookEnvelopeDto.prototype, "timestamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Номер попытки доставки" }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], WebhookEnvelopeDto.prototype, "attempt", void 0);
exports.WebhookEnvelopeDto = WebhookEnvelopeDto;
//# sourceMappingURL=webhook-envelope.dto.js.map