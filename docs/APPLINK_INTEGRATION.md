# Applink integration
**Status: implemented against the official docs and tested only with fake HTTP shaped like the documented examples (82 tests). Not yet run against the live service: no Applink call has been made, so nothing here is "working" until you do the live checks below.**

| Piece | File | Docs |
|---|---|---|
| Shared client (creds in body, `S1000` check, timeouts, safe retries, masked logs) | `integrations/applink/applink.client.ts` | /docs/authentication |
| SMS send + delivery request | `sms.adapter.ts` | /docs/sms `POST /sms/send` |
| OTP request / verify (true only on `S1000`) | `otp.adapter.ts` | /docs/otp |
| USSD send (`mt-cont` / `mt-fin`, encoding 440) | `ussd.adapter.ts` | /docs/ussd `POST /ussd/send` |
| Callback handlers + routes | `callbacks.ts`, `routes/webhooks.ts` | `/ussd/receive`, `/sms/receive`, `/sms/report` |
| Status codes (copied from docs) | `status-codes.ts` | |

**Callback URLs to register in Applink provisioning** (HTTPS, public): `https://<host>/webhooks/applink/ussd/receive` (USSD connection URL), `https://<host>/webhooks/applink/sms/report` (delivery report URL), `https://<host>/webhooks/applink/sms/receive` (inbound SMS, if your app is configured to push; see open question #1). Routes are mounted only when `APPLINK_MODE=live`, and each only if `APPLINK_USSD_ENABLED` / `APPLINK_SMS_ENABLED` is true.

**Config (backend only):** `APPLINK_MODE=live`, `APPLINK_APPLICATION_ID`, `APPLINK_PASSWORD`, `APPLINK_SUCCESS_STATUS_CODES=S1000`, `APPLINK_TEL_STYLE`, optional `APPLINK_SOURCE_ADDRESS`, optional `APPLINK_CALLBACK_ALLOWED_IPS`, `APPLINK_{USSD,SMS,OTP}_ENABLED`. Your server must call from the IP provisioned for the app.

## Live verification checklist (do these, record the real ids)
1. Provision the app, get `applicationId` + API key, provision the server IP, whitelist test numbers.
2. **SMS send**: trigger a report with SMS consent; confirm `requestId`/`messageId` in `/api/telecom`. If E1325/E1317, flip `APPLINK_TEL_STYLE`.
3. **Delivery report**: confirm the callback arrives and the ledger moves from "accepted" to "delivered".
4. **Inbound SMS**: text the short code `REPORT WATER <area>`; confirm the callback arrives (open question #1).
5. **OTP**: request and verify for an approved volunteer; check there is no unexpected subscription/charge.
6. **USSD** (only if provisioned): dial the service code; confirm menu, a full report, and `mt-fin` closing the session.
Costs: assumed BDT 2/SMS and 2/USSD menu; verify on your pricing page. Mode banner in the UI shows LIVE/SIMULATOR.
