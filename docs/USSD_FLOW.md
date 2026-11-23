# USSD flow (optional until provisioned)
Implemented: the **session state machine** (`domain/ussd-machine.ts`, tested). **Not implemented:** the Applink USSD adapter (operations `mo-init/mo-cont/mt-*`, `/ussd/send`, callback), pending `APPLINK_OPEN_QUESTIONS.md` #7. The machine returns `{text, continueSession}`; the adapter will map that to the documented operations and the real session id (used here as the idempotency key).

All screens are plain ASCII and <= 160 characters (asserted in tests). Bangla Unicode is not used.

```mermaid
stateDiagram-v2
  [*] --> MENU
  MENU --> AREA: 1/2 report, 3 risk
  MENU --> TRACK_CODE: 5
  MENU --> [*]: 0 exit, 4 tip
  AREA --> AREA: 9 more / 8 prev
  AREA --> MENU: 0
  AREA --> LANDMARK: report area chosen
  AREA --> [*]: risk shown (estimate only)
  LANDMARK --> CONFIRM: text or 0 skip
  CONFIRM --> [*]: 1 yes+SMS, 2 yes no SMS (report code), 3 cancel
  TRACK_CODE --> [*]: status (owner only)
```
Handled: invalid input (3 strikes end the session), expired session (restarts at menu, stale input ignored), duplicate submit/retry (idempotent on session id), empty area list, daily per-phone limit. A report made over USSD is **awaiting review**; the confirmation screen says "Keep it to track your report".
