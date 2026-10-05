export declare class MailBouncedDto {
    email: string;
    provider: string;
    type: "hard" | "soft";
    reason?: string;
    messageId?: string;
    bouncedAt: string;
}
