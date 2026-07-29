export declare class WebhookEnvelopeDto {
    eventId: number;
    pattern: string;
    payload: Record<string, any>;
    source: string;
    timestamp: string;
    attempt: number;
}
