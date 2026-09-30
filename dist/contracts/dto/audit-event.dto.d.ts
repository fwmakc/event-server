export declare class AuditEventDto {
    action: string;
    outcome?: string;
    accountId?: number;
    accountUsername?: string;
    tenantId?: number;
    ip?: string;
    userAgent?: string;
    requestId?: string;
    targetType?: string;
    targetId?: string;
    details?: Record<string, unknown>;
}
