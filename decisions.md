# Agent-Influenced Decision Log

This file records meaningful project decisions made or materially influenced by AI agents. It is updated as decisions are made during implementation rather than reconstructed at the end.

## Decision entry template

### YYYY-MM-DD — Decision: Brief decision title

- **Context:** What required a decision.
- **Choice:** What was selected.
- **Rationale:** Why this choice fits the product and engineering constraints.
- **Rejected alternatives:** Other credible options considered and why they were not selected.
- **Consequences:** What this enables, constrains, or requires next.

## Initial agent-influenced decisions made before implementation

### 2026-09-06 — Decision: Build the arbitrary-track one-pass timing flow before waveform editing

- **Context:** The assignment has a pass/fail arbitrary-track requirement, while the primary product value is making initial lyric timing fast.
- **Choice:** Build the arbitrary-track one-pass timing flow before waveform editing.
- **Rationale:** It proves the pass/fail requirement and core product value before visual complexity.
- **Rejected alternatives:** Starting with waveform and drag/resize, which would delay validation of track import and the primary timing workflow.
- **Consequences:** The first milestone will use simple timing controls and editable millisecond values.

### 2026-09-06 — Decision: Support local audio files for BYO tracks initially

- **Context:** Bring-your-own-track must work without relying on the structurally single-track backend.
- **Choice:** Support local audio files for BYO tracks initially.
- **Rationale:** Local files meet the requirement without remote URL or CORS uncertainty.
- **Rejected alternatives:** Remote URL import and backend multi-track support.
- **Consequences:** Imported tracks are client-side and session-scoped.

### 2026-09-06 — Decision: Keep imported tracks separate from seeded-server persistence

- **Context:** The existing API can persist only the seeded track, and its PUT route snapshots both lyrics and alignment.
- **Choice:** Keep imported tracks separate from seeded-server persistence.
- **Rationale:** Saving imported lyrics through the existing API would overwrite the seeded track's current state.
- **Rejected alternatives:** IndexedDB persistence and backend schema changes.
- **Consequences:** Persistence behavior must be clearly communicated in the UI.

### 2026-09-06 — Decision: Use integer milliseconds as the client domain unit

- **Context:** Browser audio exposes time in seconds, while the API stores segment boundaries as integer milliseconds.
- **Choice:** Use integer milliseconds as the client domain unit.
- **Rationale:** It matches the API boundary and avoids repeated unit conversion.
- **Rejected alternatives:** Using floating-point seconds throughout client state or maintaining parallel second and millisecond representations.
- **Consequences:** Convert `audio.currentTime` seconds only at the audio adapter boundary.

### 2026-09-06 — Decision: Do not add waveform or state-management dependencies yet

- **Context:** The initial one-pass flow does not yet establish requirements that justify another library.
- **Choice:** Use React and browser audio APIs for the first milestone without new waveform or state-management dependencies.
- **Rationale:** The first milestone can be built with existing tools, and library requirements are not known yet.
- **Rejected alternatives:** Preemptively adding a waveform library or external state manager before their necessary capabilities are understood.
- **Consequences:** Re-evaluate dependencies after the one-pass flow is usable.

### 2026-09-06 — Decision: Use one domain reducer with separate capture and selection identities

- **Context:** Stamping, finishing, selecting, and exact edits can update several related timing values, while selecting a line during capture must not silently close or redirect the open segment.
- **Choice:** Keep authored editor transitions in a domain reducer. Store the selected line explicitly, store an open segment separately from completed segments, and keep the capture cursor anchored while a segment is open.
- **Rationale:** Each timing action becomes one pure, reviewable transition, and inspection can move independently without changing capture behavior.
- **Rejected alternatives:** Independent component state for each timing field, locking selection during capture, and making selection silently redirect the active capture.
- **Consequences:** The interface must label Selected and Capturing separately and explain exactly what the next stamp will do.

### 2026-09-06 — Decision: Validate replacement sources before discarding the active session

- **Context:** Media metadata and seeded API requests resolve asynchronously, local object URLs require explicit cleanup, and switching sources can otherwise destroy valid in-memory work before the replacement is known to be usable.
- **Choice:** Probe each candidate off-screen, guard it with a source generation, and commit it atomically only after validation. Confirm replacement for edited seeded work and every active local session.
- **Rationale:** Failed or stale loads leave the current editor untouched, while one controller has clear ownership of media events and object URL revocation.
- **Rejected alternatives:** Pointing the active audio element at unvalidated files, keeping every prior document in a speculative session cache, and replacing work immediately on file selection.
- **Consequences:** Source changes have a short validation step and sometimes one confirmation click; cancelled, failed, stale, replaced, and unmounted local URLs must all be revoked.

### 2026-09-06 — Decision: Allow overlapping exact edits with a warning

- **Context:** The fixture API permits overlaps, an existing seeded alignment must be preserved, and overlapping vocal lines can be intentional even though they make a single playing-line indicator ambiguous.
- **Choice:** Accept valid positive-duration overlaps, surface a warning after the edit, and derive the playing line from the active segment with the latest start time, breaking ties by lyric order.
- **Rationale:** This avoids silently rewriting or rejecting valid existing work while still calling attention to a likely correction mistake.
- **Rejected alternatives:** Rejecting every overlap and silently choosing or moving adjacent boundaries.
- **Consequences:** Overlaps remain explicit editorial choices; exact edits never alter another line automatically.

### 2026-09-06 — Decision: Integrate Tailwind through its Vite plugin without a component library

- **Context:** Tailwind was approved for visual refinement, while the existing Vite 5 setup should not be upgraded or expanded with unrelated styling infrastructure.
- **Choice:** Add Tailwind 4 and `@tailwindcss/vite`, retain the existing Vite/React versions, and keep specialized range and accessibility rules in the existing stylesheet.
- **Rationale:** The official Vite integration needs only two development dependencies, one plugin entry, and one CSS import; the resolved plugin explicitly supports Vite 5.2 and newer.
- **Rejected alternatives:** A PostCSS configuration, a Tailwind configuration file with no current need, a UI component library, and a Vite upgrade.
- **Consequences:** Layout and interaction styling use Tailwind utilities through the existing component classes, while the generated dependency lockfile includes Tailwind's platform-specific optional packages.

### 2026-09-06 — Decision: Add a read-only decoded waveform overview before interactive timeline editing

- **Context:** The next requested milestone increment needs a ruler, playhead, waveform, and positioned segments, but must not introduce dragging, resizing, selection changes, or new persistence/editor actions yet.
- **Choice:** Decode the currently loaded audio in a dedicated read-only timeline component, render coarse amplitude peaks, and position completed segments from their real millisecond boundaries.
- **Rationale:** It adds visual timing context without disturbing the established capture workflow or expanding the editor state model.
- **Rejected alternatives:** Placeholder artwork, hardcoded waveform data, and bundling interactive editing behavior into the first timeline pass.
- **Consequences:** The timeline depends on browser audio decoding and may show a non-blocking fallback message when waveform extraction is unavailable, while segment placement remains fully data-driven.

### 2026-09-06 — Decision: Keep manual timeline viewport navigation independent from playback position

- **Context:** The timeline gained zoom presets and a separate full-track navigation range, while playback must continue normally and the visible window sometimes needs to stay fixed away from the current playhead.
- **Choice:** Default the timeline to follow the playhead, but disable follow mode when the user manually moves the navigation range and require an explicit Return to playhead action to restore centered tracking.
- **Rationale:** It keeps playback transport and timeline browsing decoupled, avoiding accidental seeks or window jumps while still making it obvious how to resume follow behavior.
- **Rejected alternatives:** Having manual viewport changes seek audio, automatically snapping back to the playhead after interaction, and maintaining follow mode while overriding the window start.
- **Consequences:** The timeline now owns a local follow/manual viewport state in addition to its zoom preset, and users can inspect a fixed region of the track without affecting playback.

### 2026-09-06 — Decision: Use Pointer Events with transient preview for segment dragging

- **Context:** Single-segment dragging needed live visual and inspector feedback without changing playback, capture state, or persistence behavior, while plain click and keyboard selection still had to work normally.
- **Choice:** Implement dragging with browser Pointer Events and pointer capture, start an actual drag only after a small movement threshold, show motion through a transient preview, and commit the final timing through the existing `editSegment` reducer path on pointer release.
- **Rationale:** Pointer capture keeps one drag interaction coherent across movement, the threshold preserves ordinary selection behavior, and the transient preview exposes live timing changes without treating every pointer move as a committed edit.
- **Rejected alternatives:** Mouse-only dragging, immediate drag activation on pointer down, updating audio playback position during drag, and introducing a separate persistence or reducer action just for timeline drag commits.
- **Consequences:** Timeline dragging remains a local UI interaction layered on top of the existing timing model, preserves segment duration while clamping within track bounds, and allows overlaps without special-case merge behavior.

### 2026-09-06 — Decision: Commit multi-segment timeline moves through one atomic domain action

- **Context:** Timeline multi-selection now allows a drag gesture to move several selected completed segments together while preserving their durations and relative spacing.
- **Choice:** Preview the whole moved group transiently during pointer interaction, then commit all moved segments together through one `editSegments` domain action on pointer release.
- **Rationale:** A grouped commit keeps the reducer as the single source of truth for the final timing update, avoids transient partial saves when several selected segments move together, and ensures overlap checks and messaging evaluate the final combined state once.
- **Rejected alternatives:** Dispatching a sequence of individual `editSegment` commits, committing every pointer move as state, and treating group movement as a timeline-only mutation outside the reducer.
- **Consequences:** Timeline group dragging can update the primary selected segment live in the inspector while still landing as one atomic state change when released.

### 2026-09-06 — Decision: Place untimed lines with a provisional three-second segment independent of capture

- **Context:** Drag-to-place must let an untimed lyric line land on the timeline immediately, even before precise trimming, while preserving the separate one-pass capture workflow and its cursor progression.
- **Choice:** On a valid drop, create a completed segment at the dropped start time with a provisional default duration of 3000ms, clamped to the track end with at least 1ms duration, and commit it through one atomic `placeSegment` action that does not redirect an open capture flow.
- **Rationale:** A short provisional segment makes placement useful immediately without guessing exact boundaries, and keeping placement independent from capture avoids surprising changes to the active line while still letting later capture naturally skip newly completed lines.
- **Rejected alternatives:** Requiring exact start and end selection during placement, choosing duration from lyric text length or waveform heuristics, and mutating selection, segment timing, and capture cursor through separate updates.
- **Consequences:** Drag-to-place becomes a fast initial placement tool, newly dropped lines open directly in the inspector for correction, and idle capture must advance past a newly completed cursor line when placement filled it in.
