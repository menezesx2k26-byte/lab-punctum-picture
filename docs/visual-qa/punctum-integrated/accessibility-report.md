# Accessibility report

**Result: BLOCKED for conformance.** No current browser, keyboard, screen-reader, reduced-motion, color-surface or 200% zoom audit was performed. A CSS declaration and a color contrast unit test do not establish WCAG conformance.

| Check | Criterion | Evidence | Result |
| --- | --- | --- | --- |
| Color contrast | Every text/control state meets at least WCAG AA 4.5:1 for normal text and 3:1 for large text/UI as applicable | PR #14 unit test checks selected purple/paper/yellow combinations; no full Studio or photo/dark surface matrix | PARTIAL; overall BLOCKED |
| Semantic heading order | No skipped/incorrect story heading levels in collage cards | SSR assertion checks the story title renders as `h3`; CI run `40161708958` | PASS for tested component |
| Keyboard/focus | All nav, carousel, menu and Studio controls work with visible focus | Not run in browser | BLOCKED |
| Screen reader | Accessible names, landmarks, status/errors, alt text and reading order | No current VoiceOver/TalkBack/NVDA run | BLOCKED |
| Reduced motion | Respect `prefers-reduced-motion` across transitions/carousel | No browser/emulation measurement | BLOCKED |
| Touch | Interactive targets actually measure at least 48 × 48 CSS px | CSS test checks declared minimums, not computed boxes | PARTIAL; overall BLOCKED |

Re-test on the current PR #14 SHA with axe/manual review, keyboard navigation, a supported screen reader and touch device before closing the gate. No accessibility certification is claimed.
