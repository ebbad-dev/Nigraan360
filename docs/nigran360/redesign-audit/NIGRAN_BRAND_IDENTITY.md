# نگران 360: brand identity

## 1. Positioning

**نگران 360** is the examination platform an institution can trust when it matters: every answer accounted for, every minute fair, every result verifiable.

*Nigran* (نگران) means a guardian or invigilator: someone who watches over the exam on behalf of everyone in it. **360** stands for the whole lifecycle, from creation to delivery, monitoring, grading, publication and verification. It also stands for resilience: the exam stays whole even when the connection doesn't.

The brand watches over fairness, not over people. That rules out surveillance imagery: no eyes, cameras or shields.

**Personality:**

| Trait | Means |
|---|---|
| Calm authority | Quiet surfaces, measured type, no alarms unless something is wrong |
| Scholarly | Echoes the exam paper and the manuscript margin rather than the SOC dashboard |
| Precise | Exact numbers, tabular figures, explicit states ("Saved on server", not "Saved") |
| Humane | Plain language; monitoring signals are framed as indicators for review |

## 2. Name and spelling (non-negotiable)

| Rule | Correct | Incorrect |
|---|---|---|
| Brand lockup | `نگران 360` | `Nigran 360` (as a logo), `نگران تین سو ساٹھ`, `نگران٣٦٠`, `نگران ۳۶۰` |
| Urdu letters | ن گ ر ا ن (noon, gaaf, re, alif, noon) | نگرانی (that is "supervision", a different word), نگراں |
| Digits | Western digits **360** as specified | Eastern Arabic-Indic digits (۳۶۰) in the logo |
| Running English copy | "Nigran 360" in body text where a Latin name is needed (README, legal, email subject) | Mixing scripts inside one heading |

## 3. Mixed-script rendering (bidirectional text)

- **Canonical visual order:** read right to left, **نگران** sits on the right and **360** on its left. This is how `نگران 360` renders in an RTL context, and it is the order in the master artwork.
- **Master artwork:** the logo is delivered as an **outlined SVG**, with glyphs converted to paths. Shaping, joining and digit placement are therefore fixed and cannot vary with fonts, browser bidi or the PDF engine. This is the only form used for the logo, favicon and PDF.
- **Live text** (for example screen-reader names and the HTML title) uses `<span lang="ur" dir="rtl">نگران 360</span>` (or `<bdi>`), so the run is isolated from surrounding LTR text. `<title>` uses `نگران 360 · Secure Examinations`; the run is wrapped in U+2067 … U+2069 (RTL isolate) where the platform supports it.
- **Accessible name:** `aria-label="Nigran 360"` on the logo link, so screen readers announce it predictably. The Urdu glyphs are visual.
- **QA check:** at 16, 24 and 48 px, confirm that ن joins to گ, the gaaf keeps its second stroke (گ, not ک), alif breaks the join, the final ن takes its final form with the dot above, and 360 is never reordered to 063.

## 4. Typography for the wordmark

| Option | Assessment |
|---|---|
| **Gulzar** (Nastaliq designed for screens, SIL OFL) | **Recommended** for the wordmark. Authentic Urdu Nastaliq character, much cleaner at display sizes than traditional Nastaliq, and freely licensed. It has a tall vertical footprint, so it is outlined and optically adjusted in the SVG. |
| Noto Nastaliq Urdu (OFL) | Correct and robust, but heavier and with deep descenders. Fallback reference only. |
| Noto Naskh Arabic / Naskh styles (OFL) | Most legible at small sizes, but it reads as Arabic-generic rather than Urdu. Reserved for a future Urdu **interface** (body text), not the brand. |

**360** is set in the brand's Latin display serif (Source Serif 4, semibold, lining figures). It is optically sized so that the digit cap height matches the main body of the Nastaliq letters (not the ascender of گ), and baseline-aligned to the Nastaliq baseline.

## 5. Mark (icon) concept: the open noon

- **Concept:** نگران begins and ends with **ن (noon)**: a bowl with a single dot above it. The icon draws that bowl continuing almost all the way around into a **360° ring** that stops just short of closing, with the noon's dot sitting in the gap.
  - The ring is the full examination cycle.
  - The dot is the one thing the guardian watches over: the candidate's work.
  - The near-closed loop says "complete but not closed off". It is literally the brand's first letter.
- **Construction:**
  - one continuous stroke at 12% of the mark width, with round terminals;
  - gap = 30° at the top-right;
  - dot diameter = 1.4 × stroke width, centred in the gap.
- **Why not a shield, eye or cap:** those are the category clichés the brief forbids. The open noon is ownable, cultural, and readable at 16 px because it is only two shapes.

## 6. Variants

| Variant | Composition | Use |
|---|---|---|
| Primary lockup | Mark + `نگران 360` (RTL order: mark at right, then نگران, then 360) | Login, splash, PDF header, README |
| Compact horizontal | Smaller mark + wordmark, single line, wordmark height 22 px | App top bar and sidebar (expanded) |
| Icon only | Open-noon mark | Collapsed sidebar, favicon, app icon, loading |
| Report lockup | Primary lockup in ink (`#1B1F2A`) on paper, 18 mm wide minimum, plus the verification QR in the footer | PDF reports |
| Mono | Single colour (ink, or paper on dark) | Watermarks, print, embossing |

**Mobile:** compact lockup in a 56 px top bar. Below 360 px viewport width, the icon only plus the page title.

## 7. Clear space and minimum size

- **Clear space:** the height of the noon dot × 2 on every side. Inside the app, at least 8 px.
- **Minimum sizes:**
  - primary lockup: 120 px wide on screen, 30 mm in print;
  - compact lockup: 96 px wide;
  - icon: 16 px (favicon, with a dedicated pixel-hinted 16 px drawing), 24 px in UI.

## 8. Colour usage

| Surface | Mark | Wordmark |
|---|---|---|
| Paper (`#F5F2EA`) or white surface | Lapis `#23408E`, dot in Zarnab gold `#C8891A` | Ink `#1B1F2A` |
| Graphite (`#15181E`) or sidebar navy (`#1C2230`) | Lapis tint `#9DB1F5`, dot gold `#E0A940` | Paper `#F5F2EA` |
| Photos or gradients | Not allowed; place the lockup on a solid surface | — |

The gold dot is the only place gold appears in the identity. It is decorative and never used as text colour on light surfaces, because #C8891A on paper is only 2.93:1.

## 9. Icon direction for the UI

- **Family:** lucide only (already a dependency). No second icon family.
- **Style:** 1.75 px stroke, 20 px default size, 16 px inside dense tables, 24 px for empty states.
- **Meaning:** icons accompany labels; they never replace them, except for universal controls (close, menu, search) that have an aria-label.
- **Status:** never encoded by colour alone. Each status pairs an icon and text with its colour: saved ✓, pending ⟳, failed !, flagged ⚑.

## 10. Consistency rules

1. Every primary brand surface uses the Urdu lockup: login, app bar, PDF, favicon, verification page, emails.
2. Never re-type the logo in live text for decoration; use the SVG.
3. "Nigran 360" in Latin letters appears only in running text and in metadata where Urdu is unsupported.
4. Monitoring, risk or "integrity" wording never appears in the brand line. **Tagline:** "Fair exams, verified results" (English UI) / «منصفانہ امتحان، مصدقہ نتائج» (Urdu, for future localisation; to be proofread by a native editor before use).
5. Assets are self-hosted (fonts and SVG) with no external font CDN.

## 11. Future Urdu interface

A full Urdu/RTL UI is feasible: Tailwind logical properties, `dir="rtl"` on `<html>`, Noto Naskh Arabic for body text, and translation files. It is **out of scope** for this submission. The design tokens use logical spacing (`ps-`/`pe-`) so the redesign does not block it.
