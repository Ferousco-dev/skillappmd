# AppMD Design Brief and Generation Prompts

For Google Stitch, Figma AI, or a human designer. Section 1 is context you paste
once. Section 5 has one standalone prompt per screen. Section 7 is the list of
things to reject.

---

## 1. MASTER CONTEXT

> Paste this before any screen prompt.

**Product:** AppMD. A searchable index of public `SKILL.md` files, the plain
text capability files that AI coding agents load. We have indexed 3,797,117
occurrences across 282,200 GitHub repositories.

**Audience:** working software developers, evaluating whether they are allowed
to reuse a skill they found. Technical, impatient, sceptical of marketing.

**The single thing that makes this product different:** we tell you the licence
position of every file, including when we honestly do not know. Competing
indexes either show you the file contents or rank by popularity. We do neither.
We answer one question: where did this come from, and may you use it.

**Three rights states, and they are the emotional core of the interface:**

| State | Meaning | Weight |
| --- | --- | --- |
| Licensed | Licence resolved. You may use it. | Quiet. This is the boring case. |
| Unknown | No licence could be determined. Not the same as forbidden. | **Loud. This is the product.** |
| Restricted | Licence forbids redistribution. | Loud, and the only warning colour. |

**Hard constraints. The design must not contain any of these:**

- No skill file contents, no code preview, no markdown preview
- No "Copy", "Download", "Install" or `npx` command anywhere
- No GitHub stars, forks, or follower counts
- No trust score, safety score, "Safe" badge, or star rating
- No page numbers, because pagination is cursor based and there is no total
- No categories or tags, because the backend does not classify

**Emotional adjective:** forensic. This is a records office, not a shop.

**Do not look like:** a marketplace, an app store, or a component library site.
No product cards with thumbnails. No "featured" carousels.

---

## 2. VISUAL DIRECTION

**Named thesis:** *a ledger that breathes.*

The working screens are a records index: rules, alignment, monospace, tabular
figures, very little chrome. The landing page is the one place with theatre.
The two are joined by shared materials, not shared density.

**What makes it interesting rather than austere.** Every decorative element must
be made of real data:

- **Occurrence magnitude.** A skill seen 8,421 times and one seen 212 times
  should not look identical. Use a thin horizontal bar behind or beside the
  count. This is the deduplication story, which no competitor has.
- **Rights distribution.** The index header carries a single stacked bar
  showing the proportion of Licensed / Unknown / Restricted across the corpus.
  One row of pixels, high information density.
- **Stepped hairline motif.** A staircase of thin outlined rectangles,
  ascending left to right, used once per page as a corner or edge element.
  Never centred, never more than one per screen.

**No gradients. No glassmorphism. No blur. No drop shadows on cards. No icons
inside circles.**

---

## 3. COLOUR

Two themes, driven by one set of tokens. Both must ship.

```
LIGHT                              DARK
--surface        #ffffff           #0b0b0f
--surface-raised #ffffff           #16161c
--ink            #111116           #f3f3f6
--muted          #6b6b74           #9c9caa
--accent         #c98f73           #d9a184   (fills, borders, marks)
--accent-strong  #a86340           #d9a184   (accent applied to TEXT)
--hairline       ink at 9%         ink at 9%
```

Rights colours:

```
Licensed    muted grey, no colour
Unknown     --accent-strong
Restricted  #e11d48 light / #fda4af dark
```

**Two rules that are not negotiable:**

1. The accent is the rights colour. It is not a general purpose brand splash.
   On a working screen it should appear on roughly one row in three, never as a
   background wash, never on a button that is not about rights.
2. Every text colour must reach **4.5:1** against its background in both
   themes. The lighter peach fails this on white, which is why
   `--accent-strong` exists.

---

## 4. TYPE, SPACE, MOTION

**Type.** Two faces only.

- **Monospace** for anything that is data: skill names, repository paths,
  counts, identifiers, labels, column headings. Counts use tabular figures so
  columns align.
- **Sans** for prose: descriptions, explanations, page copy.

Scale: 34 / 30 / 20 / 15 / 13 / 12 / 11 / 10. Column headings and eyebrows are
10 to 11px uppercase with 0.16em tracking.

**Space.** 4px base. Row height 72 to 84px. Page gutter 24px mobile, 40px
desktop. Max content width 1152px.

**Radius.** 0 on rows, inputs, tables and buttons in the product. Small radius
only on the landing. Sharp corners are part of the ledger character.

**Motion.** 160ms for colour, 420 to 520ms for anything spatial, easing
`cubic-bezier(0.22, 0.8, 0.26, 1)`. Hover on a row shifts it 14px right and
reveals a 2px rights-coloured rule on its left edge. Everything must be
disabled under `prefers-reduced-motion`.

---

## 5. SCREEN PROMPTS

> Each block is standalone. Paste the master context above it.

### 5.1 Landing

```
Design a landing page for AppMD, a searchable index of 3.8 million SKILL.md
files from public GitHub repositories.

Layout, top to bottom:
- Fixed header: small four-square outline logo left, theme toggle and a pill
  "Documentation" button right.
- Hanging elements: 8 logos of AI coding agents (Claude, Cursor, Gemini,
  Codex, Replit, Grok, Windsurf, Perplexity) suspended from the top edge on
  thin 1px threads of varying length, each with a small dot where the thread
  meets the ceiling and a tiny uppercase label beneath. They hang at different
  depths, like mobiles. Cards are white or near-black depending on theme, with
  a hairline border.
- A small pill badge: a stack of overlapping agent logos plus the text
  "Works with 8 coding agents".
- The word SKILLS rendered as mechanical split-flap departure board tiles,
  dark tiles with light letters, each tile a separate rounded rectangle with a
  horizontal seam across its middle.
- A stat line: a small filled accent square, then "3,797,117" in bold
  monospace, then "SKILL.md occurrences across 282,200 repositories" in grey.
- A wide search field with a 1px accent border, a magnifier icon on the left,
  placeholder "Search skills by name, repository, or owner", and a solid
  accent-filled submit button inside the right edge reading "Search skills".
- Below it, the word "Try" then five small outlined pill chips: testing,
  deployment, database, security, docs.
- Bottom left: "Privacy, cookies, contact" in 12px grey.
- Bottom right: a large faint staircase of thin outlined rectangles ascending
  to the right, running off both the right and bottom edges, at about 16%
  opacity.

Generous vertical space. The hanging logos and the staircase are the only
decoration. No gradients, no illustration, no photography.
```

### 5.2 Skills index, the main working screen

```
Design a dense index screen listing indexed skills. This is a ledger, not a
grid of cards.

Header area:
- Eyebrow: a small filled accent square then the word "INDEX" in 11px
  uppercase monospace with wide letter spacing.
- Title "Skills" at 34px, tight tracking.
- Right aligned on the same line: "3,797,117 occurrences / 282,200
  repositories" in 12px monospace with tabular figures.
- One paragraph of grey explanation, maximum 70 characters per line.
- A single horizontal stacked bar, 6px tall, full content width, showing the
  proportion of Licensed / Unknown / Restricted across the whole index, with a
  compact legend beneath it in 11px monospace.

The list:
- A column header row in 10px uppercase monospace grey: SKILL, REPOSITORY,
  SEEN, RIGHTS. Separated from the rows by a slightly stronger hairline.
- Each row, 80px tall, separated by 1px hairlines at 9% opacity. No card, no
  border box, no radius, no shadow.
- Left: skill name in 15px monospace, then its one line description in 13px
  grey beneath, truncated with an ellipsis.
- Right, aligned in columns: repository path in 12px monospace grey, then the
  occurrence count in 12px monospace tabular figures, with a thin horizontal
  bar beneath the number whose width encodes magnitude relative to the largest
  count on screen, then the rights marker.
- The rights marker is a small filled square plus a word: "Licensed" in grey,
  "Unknown" in the accent, "Restricted" in red.
- On hover the row shifts 14px right, its background lifts 3%, and a 2px
  vertical rule in the rights colour appears at the left edge.

At the bottom, a single outlined "Load more" button, centred. No page numbers.

Show at least 8 rows, weighted so roughly half are "Unknown".
```

### 5.3 Skill detail

```
Design a detail screen for one indexed skill. It is a record, presented like an
archival entry.

- Breadcrumb in 12px monospace: Home / Skills / commit-message
- Eyebrow: accent square plus "SKILL" in 11px uppercase monospace.
- Title "commit-message" in 30px monospace.
- One line description in 15px grey.
- The repository path beneath it in 12px monospace, as a link.

Then a vertical stack of sections, each introduced by a 10px uppercase
monospace grey label and separated by a hairline. In this order, and the order
matters:

1. RIGHTS, first and most prominent. A 3px vertical rule in the rights colour
   down the left of the block. The state word in monospace, then the reason in
   plain text, for example "No licence file detected in repository". When the
   state is Unknown, a further grey paragraph explaining that unknown is not
   the same as forbidden.
2. DECLARED. A two column definition list, labels in 12px monospace grey at a
   fixed 160px width, values in 13px. Fields: Name, Description.
3. INFERRED. Currently empty, showing an explanatory grey sentence rather than
   an empty box.
4. ATTRIBUTION. Repository and Owner as a definition list, then an outlined
   "View source repository" button.
5. OCCURRENCES. A line reading "Seen 3,902 times across indexed repositories",
   then a bordered list of occurrence rows in 12px monospace, then a "Load more
   occurrences" button.
6. CONTENT. A short grey paragraph explaining that AppMD does not store or
   display the body of a SKILL.md file.

No tabs. No code block. No copy button. No download.
```

### 5.4 Search

```
Design a search results screen.

- Eyebrow "QUERY" with accent square, title "Search" at 34px, one grey line of
  explanation.
- A search field spanning the content width, square corners, 1px hairline
  border that turns accent on focus, monospace 13px input text, with a solid
  square-cornered "Search" button attached to its right.
- A result count line: the number in monospace, then "shown for", then the
  query term in the accent colour.
- The same ledger rows as the index screen.

Also design three states of this screen:
- Idle, before any query: a bordered dashed panel, centred, headed "Search the
  index", one grey explanatory line, and an outlined "Browse all skills"
  button.
- No results: same panel, headed with the query in quotes, offering a broader
  search.
- Loading: five skeleton rows matching the exact geometry of the real rows.
```

### 5.5 Source

```
Design a screen for one source repository.

- Breadcrumb, then eyebrow "SOURCE" with accent square.
- Title is the repository path "anthropics/skills" at 34px.
- Right aligned: an outlined square-cornered "View on GitHub" button.
- One grey explanatory line.
- Then a section "INDEXED SKILLS" using the same ledger rows.
- A small grey footnote explaining that filtering skills by repository is not
  yet supported by the API.
```

### 5.6 Mobile, 375px

```
Design the same index screen at 375px width.

- Header collapses to logo, theme toggle, and a hamburger. The open menu is a
  full width panel with 48px tall rows, not a shrunken desktop bar.
- Ledger rows stack: skill name and description on the first line group, then
  repository, count and rights on a second line as a horizontal row of three
  in 11px monospace.
- The rights marker keeps its colour and its word. Never reduce it to a dot
  alone.
- Nothing scrolls horizontally.
```

---

## 6. COMPONENT INVENTORY

Ask for these as a set, so the tool produces a system rather than pages.

Header, mobile menu panel, search field, ledger row, ledger column header,
rights marker, rights statement block, occurrence bar, stacked distribution
bar, definition list row, breadcrumb, outlined button, solid button, pill chip,
skeleton row, empty panel, error panel, footnote, page eyebrow, page title with
right aligned stat.

Each in default, hover, focus visible, and disabled where it applies, in both
themes.

---

## 7. REJECT LIST

Anything below means the output missed the brief.

- Cards with rounded corners and a 1px grey border for list items
- Three feature tiles in a row with an icon above a heading
- A hero with a centred badge, a huge heading, a grey subheading and two buttons
- Purple or indigo to blue gradients
- Glassmorphism, blurred colour blobs, mesh gradients
- Emoji used as icons
- Stock photography or 3D illustration
- A star rating, a score out of 100, or a "verified" tick
- Any green "Safe" badge
- Copy such as "Elevate", "Unlock", "Seamlessly", "Supercharge"
- Sliders, carousels, or auto-advancing anything
- Page number pagination
- Any depiction of file contents

---

## 8. ONE PARAGRAPH VERSION

For a tool that only accepts a short prompt:

> A forensic index of 3.8 million AI agent skill files. Two themes, light and
> near black. Monospace for all data, sans for prose, sharp corners, hairline
> rules, no cards and no shadows. Dense 80px ledger rows: skill name,
> description, repository path, occurrence count with a magnitude bar, and a
> rights marker reading Licensed, Unknown or Restricted. A single warm peach
> accent, used only for the Unknown rights state and small square marks.
> Generous whitespace above the list, very tight within it. One thin staircase
> of outlined rectangles per screen as the only decoration. No cards, no
> gradients, no icons in circles, no illustration.
