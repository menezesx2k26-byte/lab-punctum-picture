# Studio regression record

The planned browser exercise is to apply the reversible `colagem-autoral` preset; change photos, copy, order and visibility; save a draft; preview; discard; reload; switch presets; return to original; verify idempotence and `default/light/dark/accent/photo` section surfaces without loss of IDs or content.

**Result: BLOCKED.** No Studio session or click-through was run against either PR branch. The `tests/unit/collage-preset.spec.ts` tests configuration preservation and round-trip behavior; it does not prove Studio controls, persistence, preview/discard UI, or actual photographs. Static preset tests are code-level evidence only.

| Contract | Automated evidence | Browser/editor evidence | Status |
| --- | --- | --- | --- |
| Preset is allowlisted/reversible | Unit tests in PR #14 | Not run | BLOCKED |
| Studio edits selected images and copy | No browser event exercised | Not run | BLOCKED |
| Save/discard/reload/preview | No browser persistence exercise | Not run | BLOCKED |
| Restore prior preset without loss | Unit test checks selected configuration data | Not run in Studio | BLOCKED |
| Surface modes and contrast after edit | Contrast unit assertions cover sample colors only | Not run | BLOCKED |

No production publish or config write was attempted. The preset itself is reversible; this is not evidence that the full rollback workflow was exercised.
