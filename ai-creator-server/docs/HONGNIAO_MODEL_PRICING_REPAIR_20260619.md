# Hongniao Model Pricing Repair - 2026-06-19

## Scope

This repair fixes Hongniao seed/sync data where the upstream model metadata has
`config.billing.amount`, but `ai_models.points_cost` and
`ai_models.api_cost_cents` were inserted as `0`.

## Behavior

- `points_cost` is derived as `round(billing.amount * 10)`, with a minimum of 1.
- `api_cost_cents` is derived as `round(billing.amount * 100)`, with a minimum of 1.
- Existing non-zero admin pricing is preserved.
- The 2026-06-18 Hongniao refresh seed is corrected for fresh installs.
- The 2026-06-19 repair migration updates already-migrated databases.

## Verification

Run:

```bash
cd ai-creator-server/server
npm run check:hongniao-video
npx tsx test/model-sync-service.test.mjs
```

In the admin feature entry form, selecting a different primary model should
refresh the pricing matrix options and rebuild model-derived default rows.
