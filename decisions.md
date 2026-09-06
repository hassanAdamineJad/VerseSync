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
