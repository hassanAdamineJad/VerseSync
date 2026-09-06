# Project Instructions

## Scope

- Make small, reviewable changes limited to the requested behavior.
- Inspect nearby code and identify the existing source of truth before editing.
- Preserve working behavior unless the task explicitly changes it.
- Report unrelated problems instead of silently expanding scope.
- Do not add speculative abstractions or extract components only to shorten files.
- Preserve the backend unless explicitly authorized.
- Do not add a dependency without explaining why existing platform APIs are insufficient.

## VerseSync invariants

- Never hardcode seeded track duration, title, IDs, or lyric count.
- Use stable lyric IDs; repeated lyric text is valid.
- Store domain timing as integer milliseconds.
- Imported tracks remain session-local unless explicitly changed.
- Selection or inspection and active capture are independent.
- Timeline selection, drag, resize, and placement must not seek or pause playback.
- Overlaps are allowed and surfaced as warnings; do not automatically push neighboring segments.
- Gesture previews are transient and commit atomically only when the gesture completes.
- Cancelled, outside, lost-pointer-capture, and unmounted gestures must clear temporary state.
- Snapping uses the established targets and Alt bypass behavior unless a task explicitly changes it.

## Relevant guide

- Before substantial React, TypeScript, timeline-interaction, error-handling, or testing work, read `docs/agent-guide.md`.
- Do not apply guide sections unrelated to the requested task.

## Decision log

- Before completing a task, determine whether it introduced a meaningful product, architecture, dependency, persistence, or consistency decision.
- If yes, update `decisions.md` during the same task.
- Do not record styling refinements, routine implementation details, or bug fixes that restore already-recorded behavior.
- State either what was added to `decisions.md` or: `No decision-log update was needed.`

## Verification

- Documentation-only changes: no build or test required.
- TypeScript or domain changes: run `pnpm typecheck` and the smallest relevant test when one exists.
- UI interaction changes: perform focused browser verification.
- Styling, build, or configuration changes: run `pnpm build`.
- Do not claim lint or formatting verification because the repository has no such command.
- Before final submission, run the full Playwright suite and production build.
- Never report a command or browser scenario as passed unless it was actually run.

## Git

- Do not commit unless explicitly requested.
- At a meaningful checkpoint, recommend a commit and provide a concise commit message.
- Do not combine unrelated work into one suggested commit.