# Rollback procedure

These are operational steps, not a record of a rollback test. No production change occurred in this mission and no remote rollback was run.

## Design / collage

1. In Studio on an isolated environment, select the original preset and confirm media IDs, copy, order, disabled sections and immersive configuration are preserved.
2. If the published preset is already active, revert only the approved PR #14 commit(s) on its feature branch or use the reversible preset. Do not rewrite shared history or force-push.
3. Compare current browser viewports and private/admin route styling before release. Do not publish to production under this mission.

## Private albums

1. Keep `PRIVATE_GALLERIES_ENABLED=false` in production until explicitly approved.
2. During an approved incident, disable the feature flag in the authorized environment and invalidate affected sessions using D1 `session_version`/account status per the incident plan.
3. Preserve D1, R2 originals, backup objects and audit evidence. Do not delete data, migrate production or restore QA over production.
4. Restore only into the specifically identified QA D1/R2 resources and verify row/object counts and hashes before routing the QA Worker.
5. Do not fall back automatically to local PBKDF2 on Workers Free after an outage; use the approved Access mode or keep the feature unavailable.

## Validation status

- Local design preset round-trip assertions exist on PR #14; browser/Studio rollback is untested.
- Historical D1/R2 QA restore exists under synthetic QA identity; no current restore was executed.
- Production readback remained unchanged; no write path was invoked.
- Therefore rollback **procedure documented; execution test BLOCKED**.
