# Agent Guide

## React and state

- Components need one clear responsibility.
- Check existing components before adding a new boundary.
- Keep state with the lowest owner that can coordinate every consumer that reads or updates it.
- Lift state only when multiple children truly need the same source of truth.
- Derive values during render instead of synchronizing duplicate state.
- Pass semantic callbacks such as `onSelectSegment` or `onCommitSegmentDrag` rather than raw setters.
- Extract components only when they add a meaningful responsibility, interaction boundary, reuse point, semantic boundary, or isolated testing value.
- Do not extract components only to shorten a parent file.
- Prefer composition or focused props over growing boolean configuration.
- Use discriminated unions when states are genuinely mutually exclusive.
- Avoid premature memoization; optimize only for an observed or measured problem.
- Keep domain-heavy conditions out of presentational JSX when a reducer or helper can express them more clearly.

## TypeScript and domain logic

- Avoid `any`; prefer `unknown` for external data and narrow it before use.
- Model valid states explicitly so impossible combinations are hard to represent.
- Reuse existing domain types from `editor.ts` where they fit.
- Keep timing rules, normalization, and transition logic in reducers or pure functions rather than presentation components.
- Preserve one source of truth for each rule.
- Keep the authored editor state distinct from transient UI preview state.
- Convert browser audio seconds to integer milliseconds only at the audio boundary.
- Preserve seeded and local tracks under the shared editor model instead of creating parallel timing logic.
- Use type assertions only when the invariant is already established and cannot be expressed more safely.

## Timeline interactions

- Follow the existing Pointer Events and pointer-capture approach used by the timeline and placement flows.
- Snapshot gesture inputs at pointer-down when reactive state could change during the gesture.
- Keep live preview separate from committed editor state.
- Commit multi-segment operations atomically.
- Preserve segment duration during movement.
- Maintain at least `1ms` positive duration while resizing.
- Clamp edits to track bounds.
- Preserve overlaps and show warnings instead of rewriting neighboring segments.
- Keep snapping behavior aligned with the established targets and Alt bypass unless the task changes it.
- Exclude the moving or resizing segment or group from its own snap targets.
- Clear preview, ghost, guide, and pointer state on every successful completion and cancellation path.
- Treat pointer-up outside the lane, pointer-cancel, lost pointer capture, Escape, blur, and unmount as cleanup paths.
- Keep capture cursor, selected line, timeline multi-selection, playback position, and viewport position conceptually separate.
- Timeline interactions must not seek or pause playback unless a task explicitly changes that behavior.

## Accessibility and UX

- Use semantic controls with keyboard support before adding custom ARIA.
- Preserve visible focus states.
- Do not rely on color alone to communicate selection, capture, warnings, or disabled state.
- Keep labels and status text readable even when timing badges or metadata are present.
- Make user-facing errors actionable and keep valid user input intact after failures.
- Keep client validation distinct from async or media-loading failures.
- Disable only the interaction currently in progress.
- Respect `prefers-reduced-motion`.
- Decorative visuals must be `aria-hidden` and non-interactive.
- Preserve readable contrast and usable target sizes in the dark theme.
