# نگران 360: design direction

## Directions evaluated

**A. Balanced blend:**
- graphite-navy structure (sidebar, top bar);
- soft tonal mid-surfaces (`#E9E5DC` / `#2A2F3A`);
- restrained lapis accents;
- a single appearance.

**B. Refined light foundation:**
- warm paper background (`#F5F2EA`) with off-white surfaces;
- 1 px warm borders;
- strong ink typography;
- a single light appearance.

**C. Adaptive system "Paper & Graphite":**
- one token set with two appearances that share hue, structure and type;
- **Paper** (light, warm) and **Graphite** (`#15181E`, not black);
- the structural navy sidebar from A is kept in both;
- the candidate can pick an appearance; examiner and admin follow the system setting.

## Scoring (1 = poor, 5 = excellent)

| Criterion | Weight | A | B | C |
|---|---|---|---|---|
| Product identity / distinctiveness | 2 | 4 | 3 | 5 |
| Professional credibility (institutional buyer) | 2 | 4 | 5 | 5 |
| Readability of long question text | 3 | 3 | 5 | 5 |
| Visual comfort over 2–3 hour sessions | 3 | 3 | 4 | 5 |
| Accessibility headroom (contrast, low vision) | 2 | 4 | 5 | 5 |
| Information hierarchy | 2 | 4 | 4 | 4 |
| Data density (monitor, results, admin tables) | 2 | 4 | 4 | 4 |
| Candidate exam usability | 3 | 3 | 4 | 5 |
| Examiner monitoring (often dim rooms, long watch) | 2 | 4 | 3 | 5 |
| Mobile behaviour | 1 | 4 | 4 | 4 |
| Implementation complexity (inverse) | 2 | 4 | 5 | 3 |
| Cross-role consistency | 2 | 4 | 4 | 4 |
| **Weighted total (max 130)** | | **95** | **109** | **119** |

Totals = Σ(weight × score).

## Recommendation: C, "Paper & Graphite"

**Why C:**
- **Exam reading comfort.** Long question text is easiest to read as dark ink on warm paper. It is also the visual language of a printed exam paper, which the brand deliberately evokes.
- **Monitoring comfort.** Invigilators watching a monitor for an hour in a dim hall are better served by Graphite.
- **A real need for both.** One audience reads, the other watches, so the theme switch is justified by use, not fashion. It is also an accessibility preference (light sensitivity, glare). It can live in the candidate's display preferences next to text size and contrast, which already exist (4.7).
- **One identity, not two templates.** Both appearances keep:
  - the navy structural sidebar;
  - the lapis action colour;
  - the same type system, spacing and component shapes.
  Only the surface and text ramps change.
- **Lower risk than it looks.** The codebase already themes through CSS variables (`--background`, `--card`, …). Adding a second token block is mechanical. The real work is removing hard-coded `white/10` and `glass` usages (L7) and auditing contrast in both modes.

**Defaults:**
- Paper for the candidate and admin.
- Graphite for the examiner monitor screen.
- "Follow system" otherwise.

The default appearance of a screen never changes timing, questions or marking.

**Rejected:**
- **A:** looks distinctive, but tonal mid-surfaces hurt long-form reading and still lean towards a "dark dashboard".
- **B:** credible, but gives monitoring rooms no comfortable option, and a light-only product feels plain next to the brand's lapis and gold.

## Design principles

1. **The paper comes first.** Question text gets the best typography, space and contrast in the product. Everything else defers to it.
2. **State before decoration.** Colour and motion are spent on meaning: saved, pending, failed, live, late.
3. **Structure from layout, not boxes.** Use spacing, alignment and dividers. Cards appear only for movable or independent objects (an exam, a question, an incident).
4. **Say exactly what happened.** "Saved on server · 14:02:31", not "Saved". "Indicator for review", not "Cheating detected".
5. **One primary action per view.**
6. **Calm under failure.** Outages are communicated firmly but never alarmingly; the candidate always knows what counts.

## Colour

See the design system for HEX tokens and measured contrast.
- **Lapis** (`#23408E`) carries actions and selection.
- **Teal ink** (`#0E6767`) is the secondary colour: informational accents and charts.
- **Zarnab gold** (`#C8891A`) is reserved for the brand dot and "new" markers.
- Status colours are separate from brand colours.

## Typography

- **Display:** Source Serif 4, for page titles and exam titles only. It brings an academic, printed-paper character.
- **Interface:** IBM Plex Sans. Its institutional tone suits forms and tables, and it has excellent tabular figures.
- **Numerals:** IBM Plex Mono, for the timer, IDs and verification codes.
- **Wordmark:** Gulzar, outlined.

All fonts are under the SIL OFL and self-hosted.

## Layout and surfaces

- **App frame:** a navy sidebar (264 px) and a 64 px top bar.
- **Content:** sits on the paper or graphite background, with a maximum width of 1200 px (forms 720 px).
- **Elevation:** shown by surface tone plus a 1 px border, never by glow. There is one shadow level, for overlays only.
- **Corner radius:** 8 px for controls and 12 px for containers. The current 14–24 px radii look template-like.

## Motion

- 120–180 ms opacity and position transitions for overlays and toasts, and a 1 s save-confirmation tick.
- **No motion in the exam workspace** except state changes:
  - the save badge cross-fades;
  - the timer turns amber at 5 minutes and red at 1 minute, with a single 600 ms pulse at each threshold, never continuous.
- All motion is disabled under `prefers-reduced-motion`.

## Responsive behaviour

**Examiner and admin:**
- designed for ≥1024 px;
- tables collapse to stacked rows below 768 px.

**Candidate:**
- mobile-first exam layout;
- sticky timer bar;
- navigator in a bottom sheet;
- answer options with touch targets of at least 48 px.
