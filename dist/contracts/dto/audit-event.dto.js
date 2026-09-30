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
exports.AuditEventDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class AuditEventDto {
}
exports.AuditEventDto = AuditEventDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Action dot-path, e.g. auth.login.failed" }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[a-zA-Z0-9_.-]{1,128}$/),
    __metadata("design:type", String)
], AuditEventDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: "Outcome of the audited operation",
        enum: ["allow", "deny", "success", "failure"],
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(["allow", "deny", "success", "failure"]),
    __metadata("design:type", String)
], AuditEventDto.prototype, "outcome", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Acting account id", required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], AuditEventDto.prototype, "accountId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Acting account username (email), snapshot", required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    __metadata("design:type", String)
], AuditEventDto.prototype, "accountUsername", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Tenant id of the acting account", required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], AuditEventDto.prototype, "tenantId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Client IP", required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], AuditEventDto.prototype, "ip", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "User-Agent", required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(512),
    __metadata("design:type", String)
], AuditEventDto.prototype, "userAgent", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Correlation id (X-Request-Id)", required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], AuditEventDto.prototype, "requestId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Target object type, e.g. account/file", required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], AuditEventDto.prototype, "targetType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: "Target object id (string form)", required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], AuditEventDto.prototype, "targetId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: "Extra structured details (no secrets)",
        required: false,
        type: Object,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], AuditEventDto.prototype, "details", void 0);
//# sourceMappingURL=audit-event.dto.js.map