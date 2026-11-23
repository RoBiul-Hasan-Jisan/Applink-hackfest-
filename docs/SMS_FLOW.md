# SMS flow
Commands (case/whitespace-insensitive; Bangla digits accepted): `REPORT WATER|HOTSPOT|DRAIN|OTHER <area> [landmark]`, `STATUS <code>`, `ACCEPT <code>`, `DONE <code>`, `1`/`2` (resident: fixed / still a problem), `STOP` (end updates), `ERASE` / `DELETE MY DATA` (erase contact, photos, history). Unknown text gets one HELP reply per number per 24h (cost control).

Checks before acting: sender identified by keyed phone hash; ACCEPT/DONE only for the assigned, admin-approved, phone-verified volunteer; STATUS only for the reporter, assignee or staff; replies 1/2 only for the reporter's own pending report; replays of the same provider message id are ignored. Anything refused gets the same generic "not recognised" reply (no information leak).

Outbound: report received, "possible duplicate" notice, volunteer assignment, reminder (once, after `reminderAfterHours`), resolution request, reopened acknowledgement, opted-in area alert. Resident messages only with `consentToUpdates`; STOP erases the stored contact number and consent. English by default; Bangla templates exist behind `SMS_LANGUAGE=bn` until encoding is confirmed.

Delivery honesty: the ledger counts **accepted** (provider accepted our request) separately from **delivered** (only a delivery report may set it). Inbound transport (poll vs webhook) is unresolved: `APPLINK_OPEN_QUESTIONS.md` #1.
