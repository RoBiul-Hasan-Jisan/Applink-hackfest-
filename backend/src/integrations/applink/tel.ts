// MSISDN formatting. Docs are inconsistent: SMS examples use "tel:+8801959979376"; OTP examples and the E1325 error text use "tel:8801959979376".
// The style is configurable (APPLINK_TEL_STYLE); OTP always uses the documented plain form.
export type TelStyle = 'plain' | 'plus';
export const toTel = (canonical: string, style: TelStyle = 'plain'): string => `tel:${style === 'plus' ? '+' : ''}${canonical}`;
