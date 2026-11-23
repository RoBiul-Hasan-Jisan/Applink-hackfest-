// Copied from the official docs (dev.applink.com.bd/docs/sms, /ussd, /otp). First letter: S success, E error, P partial.
// Always read the body `statusCode`, never only the HTTP status.
export const SUCCESS = 'S1000';
export const KNOWN_STATUS_CODES: Readonly<Record<string, string>> = {
  S1000: 'Success',
  E1301: 'ApplicationID not allowed for operator (OTP)', E1303: 'Request IP is not provisioned for this application', E1308: 'Permanent charging error',
  E1309: 'Service not allowed for this application', E1311: 'Mobile-terminated SMS not enabled in provisioning', E1312: 'Invalid request (missing/invalid field)',
  E1313: 'Authentication failed (unknown application or wrong password)', E1315: 'Service not found or not active', E1317: 'MSISDN invalid or not allowed',
  E1318: 'Per-second transaction limit exceeded', E1319: 'Daily transaction limit exceeded', E1325: 'Address format invalid (expected tel:8801959979376)',
  E1331: 'sourceAddress not allowed', E1334: 'Message too long', E1335: 'Advertisement message too long', E1341: 'Request failed for all destinations',
  E1342: 'MSISDN blacklisted', E1343: 'MSISDN not whitelisted (only whitelisted numbers allowed at this state)', E1601: 'Unexpected system error', E1603: 'Temporary system error',
  E1850: 'Invalid OTP', E1851: 'OTP request expired', E1855: 'Invalid OTP reference number', E1856: 'Invalid request (OTP)',
};
/** OTP verify outcomes that mean "the user typed a wrong/expired code" (not a system failure). */
export const OTP_REJECTED = ['E1850', 'E1851', 'E1855'] as const;
/** Retry-safe transient provider errors (only ever retried for idempotent calls). */
export const TRANSIENT = ['E1601', 'E1603'] as const;
