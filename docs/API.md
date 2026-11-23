# API (Express, base `/api` unless noted; auth = Firebase ID token in `Authorization: Bearer`)
Roles: **V** volunteer, **C** coordinator, **A** admin. All bodies are Zod-validated. Errors: `{error, message}`.

| Method & path | Who | Purpose |
|---|---|---|
| `GET /health` (root) | public | DB + integration mode |
| `POST /public/reports` (root) | public, 10/15min | Web report; optional `photoBase64` requires `consentToStoreEvidence` |
| `GET /public/areas` (root) | public | Area list for the form |
| `GET /me` · `POST /me/register-volunteer` | any signed-in | Profile; apply as volunteer (no claim until approved) |
| `POST /me/phone/request-otp` · `/verify-otp` | signed-in | Phone ownership via OTP gateway (verified only on explicit provider success) |
| `POST /admin/users/:uid/role` · `PATCH /admin/volunteers/:id/approve` | A | Role/approval + Firebase claim sync |
| `GET /review-queue` | C,A | Reports awaiting human review |
| `GET /reports` · `GET /reports/:id` | V (own), C, A | List/filter/search; detail with history |
| `POST /reports` | C,A | Create on behalf of a resident |
| `PATCH /reports/:id/approve` `{notDuplicate?}` | C,A | Review approval (dispatch happens only now) |
| `PATCH /reports/:id/reject` `{reason}` · `/reopen` `{reason}` · `/verify` · `/assign` `{assigneeId}` | C,A | Workflow |
| `PATCH /reports/:id/accept` · `/decline` `{reason}` · `/clean` `{notes}` | V | Responder actions (approved + phone-verified only) |
| `PATCH /reports/:id/priority` `{category,reason}` | C,A | Recorded override of rule-based priority |
| `POST /reports/:id/evidence` · `GET /evidence/:id` | V (assigned), C, A | Private evidence photos (EXIF stripped, SHA-256 recorded) |
| `GET /areas` · `/areas/:id` · `/risk` · `/risk/:areaId/history` | V,C,A | Areas; estimates with disclaimers |
| `GET /analytics/summary|reports|response-performance|risk-trends` | C,A | Genuine data only (synthetic excluded) |
| `GET /volunteers` · `/volunteers/:id` · `/volunteers/:id/tasks` · `PATCH /volunteers/:id/availability` | C,A / self | Volunteer network |
| `POST /campaigns/alert` · `GET /campaigns` · `GET /messages` · `GET /telecom` | C,A | Opted-in alerts (rate-limited, 24h dedupe); ledger |
| `GET /integrity` | C,A | Data integrity center |
| `POST /admin/erase` `{phone}` | A | Resident erasure request (also available by SMS `ERASE`) |
| `GET /audit` · `GET /settings/usage` | A / C,A | Audit trail; cost estimator |
| `/sim/*` (root) | dev only | Simulator; mounted only when `APPLINK_MODE=simulator` and not production |

Not mounted (payloads unconfirmed): `/webhooks/applink/ussd/receive`, `/webhooks/applink/sms/report`.
