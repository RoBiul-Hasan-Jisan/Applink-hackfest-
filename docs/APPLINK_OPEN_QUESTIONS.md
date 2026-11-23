# Applink open questions

**Nothing here is resolved.** Official docs could not be read when this was built. No payload, callback authentication scheme or MSISDN format has been assumed. `backend/src/integrations/applink/` contains only config, errors and the gateway *interfaces*; live adapters, `/webhooks/applink/*` routes and USSD transport are deliberately absent.

Facts taken from the brief (unverified by us): base URL `https://api.applink.com.bd`; body fields `applicationId` + `password`; `application/json;charset=utf-8`; calls must come from a provisioned IP; USSD encoding `440`; OTP valid 5 minutes with a `referenceNo`; `/sms/report` is a delivery callback; cost figures BDT 2/SMS and BDT 2/USSD menu.

## Blocking (resolve first, in this order)
1. **Inbound SMS mechanism.** The original brief says `/sms/receive` is a *retrieval* call to poll. A reviewer's notes say Applink's developer tutorial describes inbound messages being *pushed to a configured receive URL*. Both may exist. Confirm which one your provisioned application uses and test it. The engine supports both shapes: `pollInboundSms()` for retrieval, `handleInboundSms()` for a webhook handler (it is idempotent on the provider message id).
2. SMS send: field names, sender id, length limits, `statusCode` values, request/message ids.
3. Delivery report (`/sms/report`): fields and authentication. Until wired, `recordDeliveryReport()` is never called and the ledger correctly shows "delivery unconfirmed".
4. Callback authentication and source IP ranges (a generic `WEBHOOK_SECRET` is **not** assumed to be sent).
5. App provisioning/approval status and the IP your server will use.
6. MSISDN format each API expects (internal canonical form is `8801XXXXXXXXX`).
7. **USSD** (only if provisioned): `mo-init/mo-cont/mt-*` fields, session id, continue vs end, retry semantics.
8. **OTP** (only if provisioned): request/verify fields, retry limits, error codes.
9. Bangla SMS: Unicode support, encoding flag, segment billing. Keep `SMS_LANGUAGE=en` until confirmed.
10. Sandbox existence; approved pricing and whether a USSD "menu" is every screen.

## Decisions to confirm
- Added workflow states/actions vs the original spec: `APPROVED` (review gate), `ASSIGNED→APPROVED` on decline, `REOPENED→ASSIGNED`.
- Report code format `DAI-YYYY-NNNN` (legacy prefix kept; short `DAI-1024` accepted and mapped to the current year).
- SMS `STOP` opt-out added. SMS-originated reports treat replies to the sender as consented.
- Verifier independence: the verifier is a different *role* from the responder; requiring a different *person* from the approver is not enforced (small teams).
- Coordinators are not yet OTP-gated.
