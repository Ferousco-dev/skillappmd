# SkillsMP Front-End Audit

| | |
| --- | --- |
| Document | `SKILLSMP-FRONTEND-AUDIT.md` v1.0 · Phase 0 research · 2026-08-27 |
| Subject | https://skillsmp.com |
| Purpose | Extract reusable UX patterns for AppMD. Not a cloning specification. |
| Method | Live inspection: rendered screenshots at 1440x900 plus fetched page structure |

SkillsMP is an independent index of public `SKILL.md` files. It is the closest
comparable product to AppMD and therefore the most useful reference. It is not
affiliated with AppMD.

---

## 0. Headline finding

**SkillsMP's core value proposition is one AppMD structurally cannot copy.**

Their skill detail page renders the raw `SKILL.md` body, a file explorer, a
"Copy prompt" action and a "Download Zip" action. Content delivery is the
product.

`API.md` §5 forbids this for AppMD:

> Third-party skill **content** | `REQ-062`, `DEC-009`, Phase 1, regardless of licence

This is not a gap to close later. It is a deliberate architectural position.
Every downstream design decision follows from it, and it is recorded here so
that no later screen quietly assumes content is available.

The consequence: AppMD cannot win on "read the skill here". It has to win on
**provenance, rights clarity, deduplication and discovery**, which is precisely
what the backend is built to provide and what SkillsMP does not offer.

---

## SCREEN: Homepage

**Purpose:** Orient a first-time visitor and push them into search.

**URL/route:** `/`

**Desktop layout:** Two columns. Left is the hero: an eyebrow pill ("Connect
your agent to SkillsMP" with agent logos), a two-line headline, a paragraph of
positioning copy, a smaller paragraph of explanation, a corpus counter, then
the search field. Right is a bordered panel, "Explore what you know and what you
do not yet", containing three example keyword rows (Education, Marketing, Code
review), each a title plus one line of explanation plus a chevron. Below that
panel sit two split buttons: "Browse fields and occupations", "Browse creators".

**Navigation:** Single top bar, left wordmark, then Search, Skills, Creators,
Occupations, Docs, Partner, theme toggle, language selector, Sign In.

**Main components:** Wordmark, nav links, eyebrow pill, headline, corpus
counter (accent square plus monospace tabular figure plus label), search input
with inline submit button, keyword suggestion panel, two secondary browse
buttons.

**Interactions:** Search submits to results. Keyword rows are links, not
filters.

**Typography:** Large geometric sans headline, tight tracking. Body text at a
notably small size against a very large headline, so hierarchy is carried by
scale contrast rather than weight.

**Colors:** Near-black background. Warm peach/salmon accent used sparingly, on
the corpus square and the search submit button only.

**Spacing:** Generous vertical rhythm in the hero, dense inside the side panel.

**Important UX observations:**
- The corpus count is doing real work. It answers "is this worth my time" in
  one glance, before any navigation.
- The side panel solves the cold-start problem directly: a visitor who does not
  know what to search for is handed three concrete starting points.
- The accent appears exactly twice. Restraint is what makes it read as premium.

**What AppMD should reuse:** The corpus counter as an immediate credibility
signal. The cold-start suggestion panel. Accent restraint.

**What AppMD should improve:** Their counter is a single opaque number. AppMD
can be more honest and more informative by separating occurrences from
repositories, because our pipeline measures both and duplicate share is ~49.8%.

**What AppMD should NOT copy:** The exact number, the placeholder string, the
peach accent, the wordmark, the "Connect your agent" pill.

> **Correction already applied.** Our landing page had been built with
> SkillsMP's exact corpus figure (2,806,826), their placeholder copy and their
> peach accent. The figure and copy have been replaced with AppMD's own
> measurements from `R2-GITSKILLS-CORPUS.md` (3,797,117 occurrences across
> 282,200 repositories). The accent remains under an explicit product decision.

---

## SCREEN: Categories

**Purpose:** Taxonomy-led browsing for visitors without a query.

**URL/route:** `/categories`

**Desktop layout:** Heading "Browse by Category", a short explanatory note,
then 12 category groups. Each group shows a category name as a "Browse" link, a
total skill count, and a list of subcategory links each with its own count.

**Main components:** Category group cards. Count badges. Subcategory link lists.

**States:** No filters, no sorting, no pagination on this page.

**Observed taxonomy (name, count, subcategory count):**

| Category | Skills | Subcategories |
| --- | --- | --- |
| Tools | 644,311 | 7 |
| Business | 509,568 | 8 |
| Development | 370,266 | 11 |
| Testing & Security | 294,608 | 3 |
| Data & AI | 231,476 | 4 |
| DevOps | 216,041 | 5 |
| Documentation | 186,743 | 3 |
| Content & Media | 165,750 | 4 |
| Research | 108,144 | 6 |
| Lifestyle | 40,515 | 6 |
| Databases | 29,120 | 3 |
| Blockchain | 19,720 | 3 |

**Important UX observations:**
- Counts on every node let a user judge where the depth is before clicking.
- The category totals sum far above the stated corpus size, so a skill is
  evidently counted under more than one category, or counts include
  occurrences rather than deduplicated skills. Either way the number is not
  self-explanatory.
- Cards carry a count and nothing else. No icon, no description.

**What AppMD should reuse:** Counts at every level of the taxonomy.

**What AppMD should improve:** State plainly what a count counts. Given AppMD
separates a canonical skill from its occurrences, we can label the unit
precisely instead of leaving it ambiguous.

**What AppMD should NOT copy:** Their category names as a taxonomy. AppMD has
no category field in `API.md`. Adopting these names would mean inventing a
backend capability. See "Contract gaps" below.

---

## SCREEN: Skill detail

**Purpose:** Present one skill and let the user take it away.

**URL/route:** `/creators/:owner/skills/:skill`
Example: `/creators/anthropics/skills/skills-frontend-design`

**Breadcrumbs:** Home > Creators > anthropics > skills > Frontend Design

**Main components and fields observed:**

| Field | Example value |
| --- | --- |
| Title | `frontend-design` |
| Description | One-line purpose statement |
| Repository | `anthropics/skills` |
| Owner | `anthropics` |
| Last source activity | June 9, 2026 at 19:33 |
| Language detected | English |
| Stars | 171,485 |
| Forks | 20,378 |
| Licence | "Complete terms in LICENSE.txt" |
| Category / Subcategory | Business / Sales & Marketing |
| Related occupation | Web and Digital Interface Designers (SOC 15-1255) |

**Tabs:** Prompt (default), Command, Download.

**Actions:** Copy prompt, Show prompt details, Copy command, Download Zip, View
GitHub Repository, View Creator Repositories, plus a sponsored "Run on" button.

**Content display:** The raw `SKILL.md` is rendered in a read-only preview, with
a file explorer listing sibling files and their sizes (LICENSE.txt 9.9 KB,
SKILL.md 8.1 KB).

**Related content:** "More from this repository".

**Important UX observations:**
- The page is organised around *taking the skill away*. Three of the actions
  and both non-default tabs exist to move content to the user's machine.
- Licence is handled weakly. "Complete terms in LICENSE.txt" pushes the
  judgement onto the user and states no rights position at all.
- Stars and forks are borrowed GitHub credibility, not a property of the skill.
- Occupation mapping via the SOC taxonomy is a genuinely strong idea: it lets a
  non-developer arrive through their job rather than through a keyword.
- Sponsored placement sits inside the primary action area.

**What AppMD should reuse:** Breadcrumbs. "More from this repository" as a
related-items pattern, which maps cleanly onto our occurrences model. Clear
separation of source metadata from actions. Deep link out to the canonical
source.

**What AppMD should improve:** Rights. This is AppMD's strongest available
differentiator. `API.md` §3 puts `rights.state` on the wire as a first-class
structural field including an explicit `"unknown"`, and `DEC-018` requires that
clients can distinguish "we do not know" from "we know you may not". SkillsMP
offers neither. A rights badge with an explicit unknown state is a real product
advantage, not decoration.

**What AppMD should NOT copy:**
- The rendered `SKILL.md` body. Forbidden by `REQ-062` / `DEC-009`.
- The file explorer and file sizes. Implies content access we do not have.
- Copy prompt, Copy command, Download Zip. All are content delivery.
- Stars and forks. Not in our contract, and it is borrowed authority.
- Sponsored placements.

---

## Navigation and cross-cutting patterns

- One flat top bar, no mega menu. Seven destinations maximum.
- Three distinct entry taxonomies offered in parallel: **category** (domain),
  **occupation** (SOC, 23 major groups over 867 occupations), and **creator**
  (GitHub owner and repository). A visitor can arrive by what they are building,
  by what their job is, or by whom they trust.
- Theme toggle and language selector are given permanent top-level placement.

**What AppMD should reuse:** Multiple parallel entry taxonomies is the single
best structural idea on the site. AppMD can support **creator/source** directly
today, because `GET /api/v1/sources/:id` and mandatory `attribution` exist.

---

## Not yet audited

Recorded honestly rather than assumed. The following were not verified and no
claim is made about them:

- Pagination mechanism on results (numbered, load more, or infinite)
- Empty state and zero-result messaging
- Error states
- Loading and skeleton behaviour
- Authentication screens behind Sign In
- Any account or dashboard area
- Any submission or publishing flow
- Mobile navigation and responsive breakpoints
- Sorting controls and their exact option labels
- Result card anatomy on the listing page

The rendered pane would not reliably composite frames for narrow-viewport
capture during this pass, so mobile behaviour was deliberately left unrecorded
rather than guessed.

---

## Contract gaps discovered

Patterns worth having that `API.md` cannot currently serve. Recorded, not faked.

| Pattern | Status |
| --- | --- |
| Category / subcategory taxonomy | **TODO, BACKEND CONTRACT REQUIRED.** No category field exists. |
| Occupation (SOC) mapping | **TODO, BACKEND CONTRACT REQUIRED.** Not in the contract. |
| Corpus totals for the counter | **TODO, BACKEND CONTRACT REQUIRED.** No endpoint reports totals; the landing figure is a build-time constant sourced from `R2`. |
| Stars / forks | Out of scope. `REQ-093` and `DEC-020` restrict individual-author fields beyond attribution. |
| Popularity or trending sort | **TODO, BACKEND CONTRACT REQUIRED.** Cursors encode `(sort_key, id)`; available sort keys are not enumerated. |
| Occurrence **count** for a skill | **TODO, BACKEND CONTRACT REQUIRED.** Cursor pagination deliberately carries no total (`NFR-039`), so "seen N times" has no live source. Currently fixture-only. Deduplication is the product's strongest differentiator, so this is the highest-value addition to the contract. |
| Occurrence **record shape** | **TODO, BACKEND CONTRACT REQUIRED.** `GET /skills/:id/occurrences` is listed in `API.md` §1 but no fields are defined, so an occurrence can only be rendered as an opaque id. Repository and path are the fields the UI needs. |

## Blocking issue

`apps/api/src/router.js` is a pure routing function with **no HTTP server
bound**. It handles `/health`, `/skills` and `/search` only. Three of the five
endpoints in `API.md` §1 do not exist:

- `GET /api/v1/skills/:id`
- `GET /api/v1/skills/:id/occurrences`
- `GET /api/v1/sources/:id`

Skill detail and occurrences cannot be built against a live contract until
these exist and the router is bound to a server. Front-end work should proceed
against the documented contract with a typed client and fixture data, and
integrate when the endpoints land.

---

# Comparative: skills.sh

Added after the SkillsMP pass, at the user's request. `skill.sh` is a parked
domain with no product on it; the live site is **https://skills.sh**, "The Open
Agent Skills Ecosystem", built by Vercel.

A second reference point is useful because skills.sh solves the same discovery
problem with a very different posture: SkillsMP is a catalogue, skills.sh is a
package manager.

## What it is

**Nav:** Skills, Packs, Topics, Official, Audits, Docs.

**Hero:** A large pixelated SKILLS wordmark, one sentence of positioning, and a
copyable install command, `npx skills add <owner/repo>`, given more prominence
than the search field. Below it a row of agent logos under "AVAILABLE FOR THESE
AGENTS".

**Primary surface:** a **leaderboard**, not a card grid. A dense ranked table
with columns: rank, skill name plus `owner/repo`, an 8-week activity sparkline,
and an install count. Tabs switch the ranking window: All Time (1,289,001),
Trending (24h), Hot. Search sits above it with a `/` keyboard shortcut.

**Visual language:** pure black and white, monospace throughout, no rounded
cards, no colour accent. Terminal aesthetic, information dense.

## Audits, and where AppMD must diverge

skills.sh runs a security audit surface with three independent providers: Gen
Agent Trust Hub, Socket and Snyk. Results appear per skill as pass/fail
("Safe"), an alert count ("0 alerts"), and a risk severity (Low, Medium, High,
Critical), with "Pending" where an audit has not run.

**This is the sharpest contrast in the whole research effort.**

`SECURITY.md` §4 (`ETH-001`) sets six conditions before AppMD may publish any
score. Two of them are violated by the pattern above:

| Condition | skills.sh | AppMD |
| --- | --- | --- |
| 3. Absence of findings is not "safe" | Renders "Safe" and "0 alerts" | `findings: []` must render as "no findings from analyser X v0.1.0", never "safe" (`REQ-078`) |
| 1. A score always travels with its findings and evidence | A severity label stands alone in a table cell | A bare score is **not representable** (`REQ-077`); the score is a projection of a findings list, not a stored scalar |

`API.md` §5 already forbids emitting "a bare trust score" for exactly this
reason, and `SECURITY.md` §4 states plainly: **Phase 1 publishes no trust score
at all.**

So AppMD does not get an audits page in Phase 1, and when it does, a cell
reading "Safe" is not an option. This is an ethics constraint that was decided
before the feature, not a missing capability.

## What AppMD should reuse

- **The dense ranked table.** For an index of millions, a table scans far better
  than a card grid. Worth considering as an alternative density mode for
  `/skills`.
- **The `/` keyboard shortcut** to focus search. Cheap, and expected by the
  developer audience.
- **Agent compatibility shown up front.** AppMD already does this on the landing
  page via the hanging agent marks.

## What AppMD cannot reuse

- **The install command.** `npx skills add <owner/repo>` is content delivery.
  `API.md` §5 forbids serving skill content, so AppMD has no equivalent action
  and should not imply one.
- **Install counts and trending.** These require distribution telemetry. AppMD
  does not distribute, so it cannot count installs. Not a gap to fill, a
  different product shape.
- **Packs.** Composition is future work (`REQ-072`-`REQ-074`), not Phase 1.

## Contract gaps this adds

| Pattern | Status |
| --- | --- |
| Ranking or sort (trending, popularity, recency) | **TODO, BACKEND CONTRACT REQUIRED.** `API.md` §4 says cursors encode `(sort_key, id)` but never enumerates the available sort keys, so no sort control can be built. |
| Activity over time | **Not planned.** Requires per-skill time series the pipeline does not produce. |

## Positioning conclusion

Three products, three different answers to the same question:

- **skills.sh** optimises for *installing* a skill. Ranking and install counts.
- **SkillsMP** optimises for *reading* a skill. Content preview and download.
- **AppMD** can do neither, and should not try. What it has that neither offers
  is **provenance and an honest rights position**, including an explicit
  `unknown`, plus deduplication across a corpus where measured duplicate share
  is ~49.8%.

That is a narrower product. It is also the only one of the three that can tell
you whether you are allowed to use what you found.
