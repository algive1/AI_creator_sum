# Provider capability-driven UI audit — 2026-09-20

## Scope
Xiaoma/Hongniao image, video and video-edit capability propagation from provider catalog to the mini-program form.

## Changes
- Video-edit media cards now render every media type declared by the selected model capability instead of reducing multi-source edit models to video-only.
- Unknown video reference limits are conservative: no arbitrary four-reference capability is advertised when upstream metadata is absent.
- Public tier serialization no longer injects a stale maxReferenceImages=4 before the bound model capability resolver runs.

## Architecture rule
Provider model metadata (remote_parameters/maxItems and explicit max_* fields) is authoritative. Tier values are compatibility fallbacks only. The mini-program must render fields from public capabilities and must not infer additional provider support.

## Security
Provider keys remain server-side environment/config secrets. Do not put provider credentials in migrations, source, client bundles, logs, snapshots, or CI fixtures. Rotate any key that has been pasted into chat or other plaintext channels.

## Release gate
Before production deployment, run with production credentials:
1. npm run db:migrate
2. npm run sync:provider-models -- --mode=preview --providers=xiaoma,hongniao
3. npm run sync:provider-models -- --mode=apply --providers=xiaoma,hongniao
4. npm run check:provider-model-catalog -- --providers=xiaoma,hongniao
5. server build/lint/tests and mini-program typecheck/build/tests
6. Real smoke tasks for text-to-image, image edit, text-to-video, image-to-video and video-edit on at least one live model per provider.

A catalog sync is a deployment operation because it needs live provider credentials and the target database; it is intentionally not performed by GitHub CI.
