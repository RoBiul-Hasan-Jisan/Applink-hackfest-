# DengueZero ActionNet

Evidence-first dengue **prevention coordination** for Bangladesh: a real observation is reviewed by a person, prioritised by explicit explainable rules, dispatched to an authorised responder over Applink SMS, and closed only with recorded, independently verifiable evidence.

> **Hard rule:** no synthetic production data, no fabricated interventions, no invented model accuracy. Test fixtures exist only inside `tests/` folders and are excluded from every analytic.
> It supports environmental prevention. It does **not** diagnose anyone or predict street-level infection.

This merges two plans: **ActionNet** (USSD/SMS/OTP, schemas, volunteer workflow, tests) and **DengueZero OS** (CARE, review-before-dispatch, data integrity, pilot discipline, business model).

## Honest status
| Area | State |
|---|---|
| Domain logic and orchestration (`backend/src/domain`) | Implemented. **82 tests pass** (`cd backend && npm test`, Node >= 22.18, no install needed). Strict `tsc` clean on this code |
| ML pipeline (`ml/`) | Implemented with a release gate. **5 tests pass**. Ships **no data** |
| Express API, Mongo store, Firebase auth/RBAC, scripts | Written. **Never run**: no packages/network were available when built. Expect to fix small integration issues on first `npm install && npm run typecheck` |
| Frontend (Next.js) | Written. All 33 files parse. **Never built or run**. shadcn/ui is represented by hand-written primitives in `components/ui` (see `components.json` to add the CLI components) |
| **Applink SMS / OTP / USSD adapters + callback handlers** | **Implemented from the official docs** (read 22 Nov 2026) and tested against fake HTTP using the documented request/response shapes. **Never called against the live service**, so not proven working. Open questions remain (`docs/APPLINK_OPEN_QUESTIONS.md`), mainly how inbound SMS is delivered |

You are **not prize-eligible until one real Applink API works end to end**. Provision the app and run the live checklist in `docs/APPLINK_INTEGRATION.md` (SMS send + delivery report first).

## Workflow
`NEW (review pending)` → human **APPROVED** (or REJECTED) → `ASSIGNED` → `ACCEPTED` → `CLEANED` → `VERIFIED`; `REOPENED` from ASSIGNED/CLEANED/VERIFIED. Nothing is dispatched before approval. Every transition stores actor, role, time, reason. Possible duplicates must be confirmed or merged by the reviewer. Priority rules are versioned (`rules-v1`) and can be overridden with a recorded reason; only a *validated* risk estimate ever feeds priority.

## Layout
`backend/` Express + Mongoose + Firebase Admin · `frontend/` Next.js App Router · `ml/` optional gated pipeline · `docs/` · `data/areas.template.json`

## Setup
1. **MongoDB** URI in `backend/.env` (copy `.env.example`; generate keys: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
2. **Firebase**: enable Email/Password and Google; create a service account (backend vars) and a web app (frontend vars). Never commit keys.
3. `cd backend && npm install && npm run typecheck && npm test`
4. Real areas: copy `data/areas.template.json` to `data/areas.json`, replace the placeholder with your pilot site's areas, then `node scripts/bootstrap-areas.ts`.
5. First admin: sign up in Firebase, then `node scripts/setRole.ts you@example.com admin "Your Name"`; sign in again.
6. `npm run dev` (API on :5000, `APPLINK_MODE=simulator` by default; refused in production). `cd ../frontend && npm install && cp .env.example .env.local && npm run dev`.
7. Applink: see `docs/APPLINK_INTEGRATION.md` and `docs/GO_LIVE.md`. Optional ML: `ml/README.md`.

## Roles
Residents need no account (USSD/SMS/public form). Volunteers apply, verify their phone (OTP), and are **approved by an admin**; only then do they get the `volunteer` claim. Coordinators/admins are assigned by an admin only. Roles live in Firebase custom claims, synced with the profile.
