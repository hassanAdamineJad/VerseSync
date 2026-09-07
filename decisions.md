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

### 2026-09-06 — Decision: Snap timeline edits to the playhead and segment boundaries with an Alt bypass

- **Context:** Timeline interactions now include single-segment moves, grouped moves, edge resizing, and sidebar drag-to-place, all of which benefit from lightweight alignment help without introducing a beat grid or changing playback state.
- **Choice:** Snap only to the current playhead and the start or end boundaries of other completed segments, use an 8px threshold converted through the active visible-window scale, show one dashed snap guide only while a target is actively applied, and let holding Alt temporarily disable snapping for precise free movement.
- **Rationale:** These targets support practical lyric alignment without inventing musical structure, a pixel-based threshold keeps the feel consistent across zoom levels, and a modifier bypass gives precision control without adding a persistent mode toggle.
- **Rejected alternatives:** Snapping to ruler ticks, using a fixed millisecond threshold regardless of zoom, keeping the guide visible when not actively snapping, and adding a dedicated snap on/off control instead of a transient modifier key.
- **Consequences:** Timeline movement, resizing, and provisional placement can align quickly to nearby meaningful timing anchors while preserving track bounds, segment duration rules, and existing capture behavior.

### 2026-09-06 — Decision: Gate the editor behind a dedicated track-setup entry screen

- **Context:** The product now needs a clearer first-run path that separates choosing a sample or validating a local track from the heavier timing workspace, while preserving the existing import rules and session-only editor behavior.
- **Choice:** Show a dedicated Track Setup screen before the editor opens, keep its fields initially empty, let `Try sample track` enter through the existing seeded loader, and let `Open timing workspace` submit the existing local file plus pasted-lyrics flow only when a file is chosen and at least one lyric line parses successfully.
- **Rationale:** A dedicated setup step makes the entry flow easier to understand without changing the underlying document model or media lifecycle, and it keeps local validation and sample loading on the same trusted application paths already used inside the workspace.
- **Rejected alternatives:** Auto-loading the seeded track on first render, pre-filling fake audio or lyrics, splitting setup into a separate route, and introducing a second source-normalization path just for the initial screen.
- **Consequences:** Users now make an explicit sample-or-local choice before entering the editor, while the existing workspace and replacement-safety behavior remain unchanged after a track is active.

### 2026-09-06 — Decision: Keep lyric text identity separate from timing removal and line deletion

- **Context:** The editor now needs explicit lyric-line management without breaking stable IDs, one-pass capture, or timeline state cleanup.
- **Choice:** Editing a lyric updates only its text while preserving line identity and any existing timing; removing timing clears only the selected line's segment so the lyric can be captured or placed again; deleting a line removes the lyric and any segment atomically, blocks deletion of the active capture line, and never allows the sheet to become empty.
- **Rationale:** These semantics keep lyrical content, segment timing, and destructive removal distinct so the reducer remains the single source of truth for atomic editorial changes.
- **Rejected alternatives:** Treating timing removal as lyric deletion, regenerating line IDs during text edits, allowing capture lines to be deleted mid-gesture, and permitting deletion of the last remaining line.
- **Consequences:** Sidebar and inspector actions can stay explicit and predictable while timeline selection and capture references must be cleaned whenever a line or segment is removed.

### 2026-09-06 — Decision: Use click-to-edit lyric rows with blur save and Escape cancel

- **Context:** Lyric rows now need direct inline editing without changing row geometry, capture state, or timing semantics.
- **Choice:** Keep the row text as the inline edit trigger, open editing in-place within a fixed-height textarea, save valid changes on Enter or blur, and cancel with Escape without committing.
- **Rationale:** This keeps lyric text editing fast and local to the selected row while preserving stable row layout and avoiding accidental timing or capture mutations.
- **Rejected alternatives:** Opening a separate edit panel, auto-growing editors that shift neighboring rows, and committing text changes on every keystroke.
- **Consequences:** Rows reserve stable space for display, editing, and validation, and destructive actions must suppress blur-save when they intentionally interrupt editing.

### 2026-09-06 — Decision: Export LRC directly from current in-memory segments

- **Context:** The editor now needs an export path for the current lyric alignment without introducing persistence or depending on the fixture backend.
- **Choice:** Generate `.lrc` text from the current completed segments only, resolve lyric text by stable `lineId`, sort by `startMs` with lyric-sheet order as the tie-breaker, and download it with browser Blob APIs from the workspace header.
- **Rationale:** This exports exactly what the user has in memory, preserves repeated and edited lyrics, and keeps LRC generation as a pure domain formatting step rather than a server concern.
- **Rejected alternatives:** Exporting untimed placeholder entries, relying on backend routes for file creation, and deriving lyric identity from array position or displayed text at export time.
- **Consequences:** Overlaps and equal timestamps remain valid export cases, untimed lines are omitted, and the UI needs only a guarded client-side download action when timed segments exist.

### 2026-09-06 — Decision: Use Lucide React for repeated action icons

- **Context:** The interface now includes a growing set of repeated action icons across the workspace, including export, delete, add, and drag affordances.
- **Choice:** Add `lucide-react` and use direct named imports for the needed icons while keeping the existing custom brand mark and avoiding a broader component library.
- **Rationale:** A consistent maintained icon set is preferable to accumulating handwritten SVG paths, and direct imports keep the dependency scope limited.
- **Rejected alternatives:** Continuing to add one-off inline SVG paths and introducing a full UI component library just to standardize icons.
- **Consequences:** Action icons now share one visual source and must stay explicitly named at the import site rather than pulling in an icon namespace.

### 2026-09-07 — Decision: Merge with next keeps the first line identity and combines timing conservatively

- **Context:** The editor needed a single-line merge action that works for both timed and untimed lyric lines without breaking stable lyric identities, capture state, timeline selection, or LRC export.
- **Choice:** Add one atomic `mergeLineWithNext` reducer action that keeps the current line's `id`, removes the immediately following line, joins their trimmed text with one space, and derives merged timing by preserving the only completed segment when exactly one exists or by spanning `min(startMs)` to `max(endMs)` when both lines are completed.
- **Rationale:** Keeping the first line identity preserves stable references across selection, export, and later edits, while the conservative timing span avoids discarding known timing information or inventing boundaries for untimed content.
- **Rejected alternatives:** Generating a new merged line ID, preserving the second line instead of the first, requiring both lines to be timed before merging, and recalculating timing from text length or waveform heuristics.
- **Consequences:** Merge remains safe to expose from the inspector for single-line selections, removed-line segment selections and previews must be cleared or filtered away, and LRC export naturally emits only the surviving merged line because export still resolves text by live `lineId`.

### 2026-09-07 — Decision: Scope session history to committed editor state and exclude transient workspace UI

- **Context:** Undo and Redo were requested for authored lyric and segment edits, but the workspace also owns playback, viewport, and drag-preview state that should not rewind independently or create partial restores.
- **Choice:** Keep explicit `past`, `present`, and `future` history around committed `EditorState` snapshots only, record only authored reducer actions that actually change document or timing state, clear `future` on a new authored edit after Undo, clear all history on track replacement, and keep transient workspace UI such as playback, zoom, viewport, selection-only interactions, and drag or placement previews outside the history snapshots. Because the snapshots already include `openSegment`, segments, lines, capture cursor, selection, dirty state, and message, Undo and Redo may restore an in-progress capture atomically instead of being disabled whenever capture is open.
- **Rationale:** This preserves one atomic domain restore boundary for lines, segments, capture cursor, selection, dirty state, and user messages without turning temporary interaction affordances into misleading undo steps.
- **Rejected alternatives:** A generic reusable history abstraction, recording every reducer action including inspection and validation-message changes, and attempting to interleave playback or preview state into authored history.
- **Consequences:** Undo and Redo remain predictable for committed edits, shortcuts and buttons must cancel previews before navigation, and history navigation can move between closed and open capture states without seeking, pausing, or otherwise coupling editor restoration to playback.

### 2026-09-07 — Decision: Split keeps the original line identity and requires explicit two-line confirmation

- **Context:** The editor needed a segment split flow that preserves stable lyric identities and timing boundaries while avoiding any silent guess about how one lyric line should be rewritten into two.
- **Choice:** Add one atomic `splitLine` reducer action that keeps the original line ID for the first result, inserts a new stable line immediately after it, preserves timing as `start -> splitMs` and `splitMs -> end`, and requires the user to confirm exactly two non-empty lyric lines plus a split time strictly inside the existing segment.
- **Rationale:** Keeping the first line identity preserves existing references and history semantics, while an explicit editable draft avoids incorrect automatic wording changes and makes the final split text an intentional user decision.
- **Rejected alternatives:** Auto-splitting text by heuristic word boundaries without confirmation, creating two brand-new IDs, and allowing edge-aligned split times that would create zero-length segments.
- **Consequences:** Split can be one authored history step with reliable Undo/Redo behavior, invalid drafts stay local to the inspector until corrected, and LRC export naturally emits two ordered entries because document order and segment boundaries remain explicit.

### 2026-09-07 — Decision: Use the sidebar grip for both lyric reordering and untimed timeline placement

- **Context:** The lyric sheet needed drag-to-reorder without sacrificing the existing untimed drag-to-place workflow, while completed lines must stay reorderable but never create duplicate placements on the timeline.
- **Choice:** Keep one shared grip affordance on every lyric row, interpret drops between sidebar rows as one atomic `reorderLine` document action, and keep drops onto the timeline lane as placement only for untimed non-capturing lines.
- **Rationale:** One handle keeps the interaction compact and predictable, stable line IDs let reorder preserve selection, timing, and any open capture state safely, and routing by drop target avoids introducing a second drag affordance or mode toggle.
- **Rejected alternatives:** Separate reorder and placement handles, disabling reordering during active capture, regenerating IDs on reorder, and automatically retiming or reselecting lines after moving them.
- **Consequences:** Drag cleanup must clear sidebar insertion indicators, placement ghosts, and pointer state on every exit path; capture progression now follows the new document order because `captureCursorLineId` is recomputed against the reordered lines when needed; Undo/Redo treat each successful reorder as one authored history step.

### 2026-09-07 — Decision: Extend the shared sidebar grip to support adjacent-row drag merge

- **Context:** The lyric sheet now needs drag-to-merge without adding another affordance or inventing a second set of merge semantics beyond the existing `mergeLineWithNext` domain action.
- **Choice:** Keep the shared grip and route its drop targets into three exclusive outcomes: timeline lane places only eligible untimed lines, drops between rows reorder, and drops onto the body of an adjacent row merge by dispatching `mergeLineWithNext` for the earlier line in document order regardless of drag direction.
- **Rationale:** This preserves one compact gesture model while keeping merge semantics identical across the inspector button and drag interaction, including stable ID retention, text order, timing combination rules, capture safety, and history behavior.
- **Rejected alternatives:** A separate merge handle, allowing non-adjacent drag merge, creating distinct drag-only merge logic, and falling back to reorder when the user drops onto an adjacent row body but merging is blocked.
- **Consequences:** The sidebar must surface mutually exclusive feedback for reorder and merge targets, blocked adjacent-body drops now cancel cleanly instead of silently reordering, and every cleanup path must clear merge highlights, insertion indicators, placement ghosts, and pointer state together.
