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
