// Only facts stated in the project brief are encoded here. Endpoint payloads are NOT defined yet:
// adapters (sms/ussd/otp) are intentionally absent until the official docs are read (docs/APPLINK_OPEN_QUESTIONS.md).
import { env } from '../../config/env.ts';
export const applinkConfig = {
  mode: env.APPLINK_MODE, // 'simulator' never touches the network
  baseUrl: env.APPLINK_BASE_URL,
  applicationId: env.APPLINK_APPLICATION_ID,
  password: env.APPLINK_PASSWORD, // backend only; goes in the JSON request body per brief
  contentType: 'application/json;charset=utf-8',
  enabled: { ussd: env.APPLINK_USSD_ENABLED, sms: env.APPLINK_SMS_ENABLED, otp: env.APPLINK_OTP_ENABLED },
} as const;
