# Front-End Design Rules

## Scope

These rules apply to all future front-end design and implementation work in this project.

## Collaboration boundary

- Claude owns backend work.
- I own front-end design and implementation when front-end work is explicitly requested.
- Front-end work must not modify backend behavior, contracts, or files unless the user explicitly asks for coordinated changes.

## Instruction order

- Follow the user's instructions and the agreed build order exactly.
- Do not start a later task before the user gives that task.
- Do not invent features, pages, components, flows, or polish work that has not been requested.
- Before making a change, confirm that it belongs to the current requested front-end task.
- When requirements are unclear, ask before implementing instead of choosing an unrequested direction.

## Technology constraint

- Use the technology explicitly provided for the project or task.
- Do not switch frameworks, languages, libraries, or tooling without explicit approval.
- Prefer the project's existing patterns and dependencies.
- Do not add a new dependency when the requested result can be achieved with the given technology and existing dependencies.

## Writing style

- Do not use em dashes in front-end code, copy, documentation, comments, commit messages, or responses about this work.
- Use commas, parentheses, colons, semicolons, or separate sentences instead.

## Current status

No front-end task has been authorized yet. Wait for the user's first explicit front-end instruction before designing or implementing anything.

---

# Front-End Information Architecture

| | |
| --- | --- |
| Added | Phase 1 · 2026-08-27 |
| Basis | `API.md` v1.0 and `docs/research/SKILLSMP-FRONTEND-AUDIT.md` |
| Rule | A route exists only if the backend can serve it. Nothing is invented. |

The collaboration rules above are unchanged and still apply. This section is
appended, not a replacement.

## 1. What the backend actually supports

`API.md` §1 defines five read-only endpoints and states **"No writes."**

| Method | Path |
| --- | --- |
| GET | `/api/v1/skills/:id` |
| GET | `/api/v1/skills` |
| GET | `/api/v1/skills/:id/occurrences` |
| GET | `/api/v1/sources/:id` |
| GET | `/api/v1/search?q=` |

Three consequences that shape the whole front end:

1. **There is no authentication surface.** No login, no registration, no
   session, no user record.
2. **There is no write surface.** Nothing can be submitted, published, saved,
   favourited or configured.
3. **There is no skill content.** `API.md` §5 forbids emitting it.

## 2. Routes AppMD builds now

| Route | Purpose | Data source |
| --- | --- | --- |
| `/` | Home. Positioning plus entry to search. | Static plus build-time corpus constants |
| `/skills` | Browse the index, cursor paginated. | `GET /skills` |
| `/skills/:id` | One skill: provenance, rights, attribution. | `GET /skills/:id` |
| `/skills/:id/occurrences` | Where else this skill appears. Rendered as a section of the detail route, not a separate page. | `GET /skills/:id/occurrences` |
| `/search?q=` | Keyword results. | `GET /search?q=` |
| `/sources/:id` | One repository and what came from it. | `GET /sources/:id` |
| `404` | Already implemented at `app/not-found.tsx`. | None |

## 3. Routes deliberately NOT built, and why

Recorded rather than built, per RULE 16. Each would require inventing backend
behaviour that does not exist.

| Route | Why not |
| --- | --- |
| `/auth/login`, `/auth/register` | No auth surface exists. `API.md` §1: "No writes." Building a login form implies a session the backend cannot issue. |
| `/dashboard`, `/dashboard/*` | A private area requires identity and persistence. Neither exists. |
| `/categories` | No category field in the contract. SkillsMP has a 12-category taxonomy; adopting it would mean fabricating classification the backend never produced. **TODO, BACKEND CONTRACT REQUIRED.** |
| Occupation browse | SkillsMP maps skills to SOC occupations. Not in our contract. **TODO, BACKEND CONTRACT REQUIRED.** |
| `/sources` index | Only `GET /sources/:id` exists. There is no endpoint listing sources. **TODO, BACKEND CONTRACT REQUIRED.** |
| Submission or publishing flow | No write surface. Ingestion is CLI and batch (`REQ-088`). |

This is a smaller surface than a typical marketplace. That is correct for
Phase 1 and is a consequence of the architecture, not an omission.

## 4. What the product leads with

SkillsMP leads with content delivery, which AppMD cannot do. AppMD leads with
the things the backend is unusually strict about:

- **Attribution.** `attribution` is non-optional on every record (`REQ-061`,
  `NFR-004`). Every surface that shows a skill shows where it came from.
- **Rights.** `rights.state` is structural and includes an explicit `unknown`
  (`DEC-018`). The UI must render three distinct states, never collapsing
  "unknown" into "not permitted".
- **Facts versus inferences.** `declared` and `inferred` are separate objects
  on the wire (`REQ-070`). The UI must never present an inference with the same
  visual weight as a source fact.
- **Deduplication.** Measured duplicate share is ~49.8% (R3). One canonical
  skill with N occurrences is a genuinely useful view that SkillsMP lacks.

## 5. Required states

Every data-backed route implements all of these. They are product, not polish.

| State | Requirement |
| --- | --- |
| Loading | Skeleton matching the final layout, no spinner-only screens |
| Empty | Explains what happened and offers a next action |
| Error | Plain message plus retry. Surfaces `meta.request_id` for support. |
| Success | The normal case |
| Pagination | Cursor based. `cursor.next` null means end. **No page numbers**, since `NFR-032` forbids offset pagination. |
| Rate limited | HTTP 429 has a distinct treatment honouring `Retry-After` (`REQ-097`) |

## 6. API client layer

Raw `fetch` must not appear in components.

```
lib/api/
  client.ts     transport, envelope unwrapping, error normalisation, 429 handling
  types.ts      types generated from the API.md envelope
  skills.ts     getSkill, listSkills, listOccurrences
  sources.ts    getSource
  search.ts     search
```

The client always returns the envelope's `data`, `meta`, `cursor` and
`attribution` together, because attribution is mandatory and must never be
separable from the record it describes.

## 7. Theming

Light is the existing landing palette. Dark is added as a peer, not an
afterthought. Both are driven from the same custom properties so a component is
never written twice.

## 8. Blocking issue

`apps/api/src/router.js` is a pure function with **no HTTP server bound**, and
handles only `/health`, `/skills` and `/search`. `/skills/:id`,
`/skills/:id/occurrences` and `/sources/:id` do not exist yet.

Front-end work proceeds against the documented contract with a typed client and
fixtures, and switches to live endpoints when they land. No UI will assume a
field the contract does not define.
