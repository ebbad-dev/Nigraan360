# نگران 360 design system: "Paper & Graphite"

All contrast ratios below were **computed** with the WCAG 2.x relative-luminance formula during this audit. Every text pair meets AA (4.5:1 for body text); UI boundaries meet 3:1.

## 1. Colour tokens

### Brand (shared)
| Token | HEX | Use |
|---|---|---|
| `brand.lapis` | `#23408E` | Primary actions, selected state, links (Paper) |
| `brand.lapis-tint` | `#9DB1F5` | Primary actions and links (Graphite) |
| `brand.teal` | `#0E6767` | Secondary emphasis, info accents, chart series 2 |
| `brand.gold` | `#C8891A` | **Decorative only**: logo dot, "New" marker background. Never text on paper (2.93:1) |
| `brand.gold-text` | `#8A5A00` | Gold-family text on paper (5.83:1) |
| `brand.navy` | `#1C2230` | Sidebar and navigation surface (both appearances) |

### Paper (light)
| Token | HEX | Measured contrast |
|---|---|---|
| `bg.canvas` | `#F5F2EA` | — |
| `bg.subtle` (secondary background, table header) | `#EDE9DF` | — |
| `surface.default` | `#FFFDF8` | — |
| `surface.raised` (menus, dialogs) | `#FFFFFF` | — |
| `text.primary` | `#1B1F2A` | 14.71:1 on canvas |
| `text.secondary` | `#454C5C` | 7.69:1 on canvas |
| `text.muted` | `#636A7A` | 4.85:1 on canvas, 5.33:1 on surface |
| `border.divider` | `#D8D1C2` | Decorative dividers only (1.36:1) |
| `border.control` (inputs, checkboxes) | `#8A8273` | 3.74:1 on surface, 3.40:1 on canvas |
| `focus.ring` | `#3A5BD9` (2 px, 2 px offset) | 5.10:1 on canvas |
| `action.primary` / on-primary | `#23408E` / `#FFFFFF` | 9.57:1 |
| `status.success` | `#1D7349` | 5.74:1 on surface |
| `status.warning` | `#9A5600` | 5.58:1 |
| `status.error` | `#B42318` | 6.47:1 |
| `status.info` | `#1D5BA3` | 6.71:1 |

### Graphite (dark)
| Token | HEX | Measured contrast |
|---|---|---|
| `bg.canvas` | `#15181E` | — |
| `bg.subtle` | `#1B1F27` | — |
| `surface.default` | `#20242D` | — |
| `surface.raised` | `#272C37` | — |
| `text.primary` | `#ECEEF2` | 15.30:1 on canvas |
| `text.secondary` | `#B8BECB` | 8.33:1 on surface |
| `text.muted` | `#959CAC` | 5.64:1 on surface |
| `border.divider` | `#303644` | — |
| `border.control` | `#6E7686` | 3.40:1 on surface |
| `focus.ring` | `#8CA4FF` | 7.51:1 on canvas |
| `action.primary` / on-primary | `#9DB1F5` / `#10162B` | 8.57:1 |
| `status.success` | `#56C792` | 7.38:1 |
| `status.warning` | `#F0B44C` | 8.39:1 |
| `status.error` | `#F47C74` | 5.91:1 |
| `status.info` | `#7AB0F2` | 6.90:1 |

### Sidebar (both appearances)
- `nav.bg` `#1C2230`
- `nav.text` `#E9ECF2` (13.43:1)
- `nav.muted` `#A3AABA` (6.83:1)
- active item: `nav.active-bg` `#2A3350` with a 3 px lapis-tint bar on the inline-start edge

### Status semantics in the exam
| State | Colour | Icon | Text |
|---|---|---|---|
| Saved on server | success | check | "Saved on server · hh:mm:ss" |
| Pending sync | warning | rotate-cw | "Pending sync" |
| Save failed | error | alert-circle | "Not saved: <reason>" |
| Not answered | text.muted outline | circle | "Not answered" |
| Marked for review | info | flag | "Marked for review" |

### Charts
Categorical order: `#23408E`, `#0E6767`, `#C8891A` (bars and areas only, not text), `#8A3B6E` (mulberry), `#5B7F2A` (olive), `#636A7A`.

Rules:
- Sequential scales use lapis at 20, 40, 60, 80 and 100% mixed with the surface colour.
- Always pair colour with labels and patterns for status-like data.

### Usage rules
- Lapis = "you can act here".
- Teal = information.
- Gold = brand moment.
- Status colours never double as brand accents.
- No gradients on controls or text. No glows. No blurred glass. Elevation = surface tone + border; one overlay shadow: `0 12px 32px -12px rgba(16,22,43,.28)`.

## 2. Typography

**Families:**

| Role | Family | Weights |
|---|---|---|
| Display (page and exam titles) | Source Serif 4 | 600 |
| Interface | IBM Plex Sans | 400, 500, 600 |
| Numerals and codes | IBM Plex Mono | 500 |
| Wordmark | Gulzar, outlined in SVG | — |

**Delivery:**
- Fonts are self-hosted as `woff2` under `frontend/public/fonts/` with `font-display: swap`.
- Latin subsets only, an estimated 150–200 KB total (to be measured when the fonts are added).
- No Google Fonts CDN at runtime.

**Scale** (16 px root; sizes in px, line height, letter spacing):

| Token | Size / line | Weight | Tracking | Family | Use |
|---|---|---|---|---|---|
| display-1 | 32 / 40 | 600 | −0.01em | Serif | Page title (one per page) |
| display-2 | 26 / 34 | 600 | −0.005em | Serif | Exam title in the workspace and results header |
| heading-1 | 20 / 28 | 600 | 0 | Plex Sans | Section title |
| heading-2 | 17 / 24 | 600 | 0 | Plex Sans | Card or panel title |
| question | 18 / 30 | 500 | 0 | Plex Sans | **Exam question text** |
| body | 16 / 26 | 400 | 0 | Plex Sans | Default text, answer options |
| body-sm | 14 / 22 | 400 | 0 | Plex Sans | Tables, secondary text |
| label | 14 / 20 | 500 | 0 | Plex Sans | Form labels, buttons, navigation |
| caption | 13 / 18 | 400 | 0.005em | Plex Sans | Helper text, timestamps |
| overline | 12 / 16 | 600 | 0.06em, uppercase | Plex Sans | Group headings (sparingly) |
| timer | 28 / 32 | 500 | 0, tabular | Plex Mono | Countdown |
| stat | 28 / 34 | 600 | 0, `font-variant-numeric: tabular-nums` | Plex Sans | KPIs, scores |
| code | 13 / 18 | 500 | 0 | Plex Mono | IDs, verification codes |

**Rules:**
- Text never goes below 12 px. The 55 existing uses of 10–11 px are migrated.
- Each screen uses at most 2 families, with the serif reserved for titles.
- Scores display as "8 / 11 (72.7%)" with tabular figures.
- Body text is capped at 72 characters per line (the question column has a maximum width of 720 px).

## 3. Spacing and layout

**Spacing scale (4 px base):** 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

| Item | Value |
|---|---|
| Page margin | 32 desktop · 24 tablet · 16 mobile |
| Content max width | 1200 (data pages) · 720 (forms, question column) |
| Sidebar | 264 expanded · 72 collapsed (≥1024); off-canvas below 1024 |
| Top bar | 64 desktop · 56 mobile |
| Section gap | 40 between sections, 24 between groups, 12 inside groups |
| Container padding | 24 (cards and panels) · 16 (dense) |
| Form | Label → control 6 · control → helper 6 · field gap 20 |
| Control heights | Button 40 (sm 32, lg 48) · input and select 40 · touch targets on mobile at least 44 (answer options 48) |
| Table rows | 48 default · 40 dense; header 40, sticky |
| Dialog widths | 420 (confirm) · 560 (form) · 760 (complex) |
| Breakpoints | sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536 |
| Grid | 12 columns, 24 gutter at ≥1024; 4 columns, 16 gutter on mobile |

## 4. Shape and elevation

- **Radius:** 6 (badges) · 8 (controls) · 12 (containers and dialogs) · full (avatars and the status dot).
- **Borders:** 1 px `border.divider` for structure; `border.control` for inputs.
- **Shadow:** only for overlays (menus, dialogs, toasts).

## 5. Components

| Component | Specification |
|---|---|
| **Button** | Variants: primary (lapis fill), secondary (surface + control border), quiet (text only), danger (error fill, used only in confirmations). Label is a 14/500 verb phrase ("Publish exam", "Save grade"). Icon 16 at the leading edge with an 8 px gap. Loading state: spinner replaces the icon, label unchanged, button disabled. Focus: 2 px ring, 2 px offset. |
| **Input / select / textarea** | 40 px high, 8 radius, `border.control`. Label is always visible (no placeholder-only fields). Helper text in caption style. Errors: `status.error` border + icon + message linked by `aria-describedby`, plus `role="alert"` on submit. |
| **Table** | Sticky header in `bg.subtle`. Numeric columns right-aligned with tabular figures. Each row has one primary link (the name). Row actions sit in a trailing "⋯" menu. Pagination: 25 per page plus total. Empty, loading (5 skeleton rows) and error states are defined. |
| **Card** | Only for independent objects (exam, question, incident, announcement): 12 radius, 24 padding, divider border, no shadow. |
| **Tabs** | Underline style, 14/500, 44 px hit area. `role="tablist"` with arrow-key navigation. Counts shown as a muted suffix: "Grading (3)". |
| **Dialog** | Title (heading-1), body, footer with the primary action on the inline-end side. Destructive confirmations restate the consequence ("Publishing shows scores to 42 candidates"). Focus is trapped; Escape closes. |
| **Toast** | Bottom-centre on mobile, bottom-end on desktop. 4 s auto-dismiss for success; errors persist until dismissed. Never used for exam save state (that is shown inline). |
| **Badge / status chip** | Icon + text + tint (12% status colour on the surface), 6 radius, 12/600. |
| **Navigation** | Sidebar groups per role. Active item: bar + tint. Keyboard reachable, with a skip link to `#main` first. |
| **Exam top bar** | Wordmark (compact) · exam title (truncate) · connection chip · save chip · timer (mono 28) · **Review & submit**. Sticky; turns `status.warning` at 5 minutes left and `status.error` at 1 minute. Timer changes are announced by a polite live region every 5 minutes and assertively at 1 minute. |
| **Question navigator** | 40 px squares in a 5-column grid. The state is shown by fill + icon (not colour alone), and the aria-label states the full status. On mobile it is a bottom sheet. |
| **Charts** | Recharts with tokens: 12/400 axis labels, light gridlines, direct labels where possible, plus "n = …" sample size and a small-sample note. |
| **Empty state** | 24 px icon + one-sentence explanation + the next action ("No exams yet. Create your first exam."). |
| **Loading** | Skeletons matching the final layout. Spinners only inside buttons. |
| **Error state** | What happened + whether data is safe + a retry action ("Couldn't load results. Your data is unchanged. Retry"). |

## 6. Accessibility rules

- Target **WCAG 2.2 AA**.
- Visible focus everywhere; skip link on every layout.
- Status is never conveyed by colour alone.
- Touch targets ≥ 24×24 px (2.5.8), with 44 px as the mobile minimum.
- Respect `prefers-reduced-motion` and `prefers-contrast`.
- Every form control has a programmatic label.
- No nested interactive elements.
- Language set on mixed-script runs (`lang="ur"`).

## 7. Theme rules

- Both appearances come from **one semantic token set** (`--bg-canvas`, `--text-primary`, …); components never reference raw HEX values.
- Switching appearance never changes layout, timing, questions or scoring.
- Preferences: system / Paper / Graphite, stored with the existing workspace preferences.
