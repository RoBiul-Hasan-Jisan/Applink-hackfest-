// Provider-agnostic gateway contracts used by the engine. The simulator implements them fully.
// The LIVE implementations must map these to AppLink's documented payloads; they are intentionally not written
// until the official request/response fields are confirmed (docs/APPLINK_OPEN_QUESTIONS.md).
export interface InboundSms { id: string; from: string; text: string; receivedAt: Date }
export interface SmsGateway {
  send(m: { to: string; body: string; idempotencyKey: string }): Promise<{ providerMessageId: string; providerRequestId: string }>;
  fetchInbound(): Promise<InboundSms[]>; // polling model, mirroring the documented /sms/receive retrieval operation
}
export interface OtpGateway {
  request(phone: string): Promise<{ referenceNo: string; expiresAt: Date }>;
  verify(referenceNo: string, otp: string): Promise<boolean>; // true only on an explicit successful provider result
}
export interface UssdGateway { send(m: { sessionId: string; to: string; message: string; end: boolean }): Promise<{ requestId: string }> }
export interface Gateways { mode: 'simulator' | 'sandbox' | 'live'; sms: SmsGateway; otp: OtpGateway; ussd?: UssdGateway }
