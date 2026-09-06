# Project Instructions

## Decision log

- Keep `decisions.md` updated while implementation progresses; do not reconstruct it at the end.
- Record only meaningful decisions made or materially influenced by the agent.
- For each decision, record the context, choice, rationale, rejected alternatives, and consequences.

## Product and domain constraints

- Never hardcode the seeded track duration, IDs, title, or 28-line count.
- Use stable lyric line IDs; repeated lyric text is valid.
- Keep domain timing values as integer milliseconds.
- Preserve the existing backend unless a later task explicitly authorizes changing it.

## Dependencies and change scope

- Do not add a dependency without explaining why platform APIs or existing dependencies are insufficient.
- Prefer small, reviewable changes.

## Verification and milestone handoff

- During development, run the smallest relevant verification:
  - TypeScript or state changes: run the type-check or build.
  - UI interactions: verify manually in the browser.
  - Tested flows: run the focused Playwright test.
- Do not run the full suite after every small edit.
- Before final handoff, run the full Playwright suite and production build.
- After each milestone, report files changed, visible behavior, decisions, verification, and known issues.
