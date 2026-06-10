# Sign-in Hotfix 2026-06-10

## Scope

- Backend API response format.
- Database migration for existing production databases.
- Daily sign-in points account compatibility.

## Cause

`POST /api/v1/checkin/normal` can fail on older databases when `point_accounts.total_refunded` is missing. The MySQL driver returns an error code such as `ER_BAD_FIELD_ERROR`; if that string is passed directly to the API response `code`, the mini-program treats the response as non-standard JSON.

## Fix

- `server/src/utils/response.ts` normalizes non-numeric error codes to `ErrorCodes.SERVER_ERROR`.
- `server/src/utils/response.ts` returns numeric `code` from the deprecated endpoint helper.
- `server/src/migrations/20260610_004_point_accounts_total_refunded.sql` adds `point_accounts.total_refunded` idempotently.
- Install, runtime, and payment checks now verify `point_accounts.total_refunded`.

## Deploy Note

Production must run:

```bash
npm run db:migrate
pm2 restart ai-creator
```
