# Go-live checklist
1. **Applink**: approved application, provisioned static server IP, whitelisted test numbers, credentials in a secret manager (never in git/frontend), callback URLs registered (see `APPLINK_INTEGRATION.md`), the live verification checklist completed with real ids recorded, and every item in `APPLINK_OPEN_QUESTIONS.md` "Still open" answered.
2. **Config**: `NODE_ENV=production` (simulator is refused), `APPLINK_MODE=live`, `SMS_LANGUAGE=en` unless Bangla confirmed, strong `PHONE_ENCRYPTION_KEY`/`PHONE_HASH_SECRET` (rotate plan documented), restricted `FRONTEND_ORIGIN`, TLS, private `EVIDENCE_DIR` on encrypted storage.
3. **Privacy**: retention purge and erasure are implemented (see DATA_PRIVACY.md): confirm the retention period with the site, decide photo/audit/hash retention, review consent text and access.
4. **Quality**: `npm run typecheck`, lint, `npm test`, frontend build, smoke test on a locked commit, rollback plan.
5. **Operations**: monitoring/alerts on API errors and Applink `statusCode`s, per-number and campaign rate limits, daily SMS cost watch, incident contacts, MongoDB + evidence backups with a tested restore.
6. **Cost**: verify approved Applink pricing (estimates assume BDT 2/SMS, 2/USSD screen).
