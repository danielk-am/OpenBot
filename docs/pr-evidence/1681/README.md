# Before/after evidence for issue 1681

These are real browser captures of the repository's `BotRoster` inside its `PageShell`, with deterministic synthetic Bot data and API responses. They are not production screenshots or images generated from a description. The surrounding authenticated app shell is not included.

All comparisons use the same six visible Bots and one folded hidden Bot, light theme, Chrome, device scale 1 and reduced motion. Desktop viewport: 1280 × 1100; mobile: 390 × 844. Images capture the full document. No production accounts, secrets or user data are present.

| Stage | Actual source revision | Capture files |
| --- | --- | --- |
| Before PR 1684 | `93e1d5dbc57960682b9b1168ed98ceb66d755379` | baseline-desktop.png, baseline-mobile.png |
| After PR 1684 / before personal tags | `31d83567b2c6ef0f436fe864aee8f05c612922ad` | controls-desktop.png, controls-mobile.png, controls-search.png |
| After personal tags | `2a8ddc7287d3715a32882578cd60eae4813e6f8b` | tags-desktop.png, tags-mobile.png, tags-editor-mobile.png, tags-filter.png |

Captures match the current product PR heads, including their changelog entries.

The controls-search capture searches for `reports` and sorts Name A–Z. The tags captures add `Finance, Client work` to Finance Analyst through its real dialog. The tags-filter capture selects `Finance`. The capture script asserts the non-matching Bots are absent, verifies save/reload persistence, checks mobile horizontal overflow and rejects JavaScript errors or unrelated load-failure notices.

`evidence-fixture.tsx`, `evidence-fixture.html` and `capture-evidence.cjs` preserve the exact local fixture and capture script. They use local workspace paths; adjust them when reproducing elsewhere. Copy the fixture into the selected revision's `app/__evidence.tsx` and `app/__evidence.html`, install that revision's dependencies, run `APP_PORT=13182 bun run --cwd app dev`, then capture baseline, controls or tags against the corresponding revision. The capture script uses the locally installed Chrome and Playwright Core.

Images live only on this evidence branch. They add no binary files to either product PR.

## Select caret follow-up

`padding-before-desktop.png` and `padding-before-mobile.png` capture the tags stack at `9c8532c0450220e1b6e0255e0d3b768f9d685eb2`. Their matching `padding-after-*` captures show the corrected select controls at `2a8ddc7287d3715a32882578cd60eae4813e6f8b`. These are browser crops of the real search/filter region at the same desktop/mobile viewports. `check-select-padding.cjs` records a failing check before the fix and verifies 10px inline-end caret inset, 36px reserved padding, native keyboard selection, RTL and no mobile horizontal overflow after the fix. The same helper is used in the first PR for its two controls.
