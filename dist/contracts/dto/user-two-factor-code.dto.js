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
exports.UserTwoFactorCodeDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class UserTwoFactorCodeDto {
}
exports.UserTwoFactorCodeDto = UserTwoFactorCodeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Account ID" }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], UserTwoFactorCodeDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Username (email)" }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UserTwoFactorCodeDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Email (всегда = username)" }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UserTwoFactorCodeDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Одноразовый код подтверждения" }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UserTwoFactorCodeDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false, description: "Тема письма" }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UserTwoFactorCodeDto.prototype, "subject", void 0);
//# sourceMappingURL=user-two-factor-code.dto.js.map