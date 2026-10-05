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
exports.MailBouncedDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class MailBouncedDto {
}
exports.MailBouncedDto = MailBouncedDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Recipient address that bounced" }),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], MailBouncedDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: "Provider reporting the bounce",
        enum: ["smtp", "postmark", "ses", "sendgrid"],
    }),
    (0, class_validator_1.IsIn)(["smtp", "postmark", "ses", "sendgrid"]),
    __metadata("design:type", String)
], MailBouncedDto.prototype, "provider", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: "hard = permanent (suppression candidate), soft = transient (retry path)",
        enum: ["hard", "soft"],
    }),
    (0, class_validator_1.IsIn)(["hard", "soft"]),
    __metadata("design:type", String)
], MailBouncedDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: "Provider/diagnostic reason" }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], MailBouncedDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: "Provider message id of the original send" }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    __metadata("design:type", String)
], MailBouncedDto.prototype, "messageId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "ISO timestamp of the bounce" }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MailBouncedDto.prototype, "bouncedAt", void 0);
//# sourceMappingURL=mail-bounced.dto.js.map