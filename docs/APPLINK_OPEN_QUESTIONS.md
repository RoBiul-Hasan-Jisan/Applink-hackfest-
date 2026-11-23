# Applink: what the official docs settled, and what is still open
Read from dev.applink.com.bd on 22 Nov 2026: `/docs/sms`, `/docs/otp`, `/docs/ussd`, `/docs/quickstart`, `/docs/authentication`. **Not read** (not reachable by our fetch tool): `/docs/provisioning`, `/docs/status-codes`, `/docs/subscription`, pricing. Nothing below has been tested against the live service.

## Settled by the docs (now implemented)
- Every call is a POST with `applicationId` + `password` in the JSON body; content type `application/json;charset=utf-8`; calls must originate from a provisioned IP (E1303). Success is `statusCode` **`S1000`** (read the body, not HTTP).
- **SMS send** `/sms/send`: `version, message, destinationAddresses[], sourceAddress?, deliveryStatusRequest ("1" = report wanted), encoding? (0 text / 240 flash / 245 binary)`; response has `requestId` and per-destination `messageId/statusCode`.
- **Delivery report** (AppLink calls us): `destinationAddress, timeStamp, requestId, deliveryStatus` (DELIVERED, EXPIRED, DELETED, UNDELIVERABLE, ACCEPTED, UNKNOWN, REJECTED); we reply `{statusCode, statusDetail}`.
- **OTP**: `/otp/request` `{subscriberId: "tel:8801…"}` → `referenceNo`; `/otp/verify` `{referenceNo, otp}`; valid 5 minutes; `E1850` invalid, `E1851` expired, `E1855` bad reference.
- **USSD**: AppLink POSTs the user's input to our `/ussd/receive` (`sessionId, requestId, ussdOperation mo-init|mo-cont, sourceAddress, message, encoding 440`); we acknowledge, then push each screen with `/ussd/send` (`mt-cont`, or `mt-fin` for the last), encoding `440` (plain ASCII).
- **No callback signature or auth header is documented.** None is invented. Applied instead: payload validation, `applicationId` check (USSD/SMS-receive carry it), replay protection on `requestId`, optional IP allowlist (`APPLINK_CALLBACK_ALLOWED_IPS`).
- No sandbox is documented, so `APPLINK_MODE=sandbox` is refused.

## Still open (verify in your Applink account / with support@applink.com.bd)
1. **Inbound SMS delivery.** `/sms/receive` is described as *retrieving* messages "since the previous invocation", but its documented response has only `statusCode/statusDetail` (no message list) and its request fields are the message itself (`sourceAddress, message, requestId`). A poll therefore cannot be implemented from the docs, so we implemented it as a **callback** (`POST /webhooks/applink/sms/receive`). Confirm where the receive URL / short code + keyword are configured in provisioning and test it by texting your short code. Indirect hint only: other hSenid-platform providers' provisioning forms list "Delivery Report URL", "SMS short code", "keyword" and a USSD "Connection URL"; Applink's own provisioning page was not readable.
2. **tel format.** SMS examples use `tel:+8801959979376`; OTP examples and error E1325 use `tel:8801959979376`. Default `APPLINK_TEL_STYLE=plain`; switch to `plus` if SMS sends fail with E1325/E1317.
3. **Delivery-report matching.** The report carries `requestId`, while the text says to match on `messageId`. We match the report's `requestId` against both our stored message id and request id.
4. **Callback source IPs / authentication**: ask Applink for IP ranges to fill the allowlist; until then, delivery reports (no `applicationId` in the body) can only be validated by shape and can only update messages we sent.
5. **Masked numbers.** `tel` may be masked depending on application type. A masked id cannot be texted, erased or matched to our records. Confirm your app uses plain numbers.
6. **OTP side effect**: verification "activates the subscription process of AppLink". Confirm there is no charge or unwanted subscription for volunteers.
7. **Whitelisting (E1343)**: while the app is in test state only whitelisted numbers can receive messages. Whitelist your test numbers.
8. **Bangla SMS**: only encoding `0` (text) is documented; Unicode/segmentation/billing is not. Keep `SMS_LANGUAGE=en` until Applink confirms in writing.
9. **Pricing and charging per USSD screen/SMS**, daily/per-second limits (E1318/E1319): pricing page not read.
10. Static outbound IP provisioning and USSD service code / keyword allocation.

## Decisions to confirm (project)
Added workflow states (`APPROVED` review gate; decline → `APPROVED`; `REOPENED → ASSIGNED`); report code `DAI-YYYY-NNNN`; `STOP` and `ERASE` SMS commands; coordinators are not yet OTP-gated.
