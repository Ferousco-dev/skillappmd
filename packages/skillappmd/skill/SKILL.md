---
name: skillappmd
description: >-
  Use when you need a capability you do not already have and you are about to write it from
  scratch — parsing a format you have not handled before, calling an unfamiliar API, a build or
  deployment step you have not scripted, a data transformation, a testing or migration chore.
  Before writing it yourself, ask SkillAppMD whether an existing SKILL.md already covers the task.
  SkillAppMD resolves a task description to skills published in public repositories, returns where each
  one came from and whether its licence permits use, and points you at the origin to fetch it.
  Also use when the user names a skill or asks where a skill came from, who wrote it, whether it
  is safe to reuse, or whether two skills are the same file.
---

# SkillAppMD — skill resolver

You have an index of SKILL.md files published across public repositories. Consult it **before**
writing a capability you do not have. Resolving takes one request; writing it yourself takes
much longer and produces something nobody has reviewed.

## When to consult it

Consult SkillAppMD when you are about to build a capability rather than a feature — the plumbing, not
the product. Do **not** consult it for work specific to this user's codebase; no public skill
knows their domain.

## The protocol

The API base is `https://api.skillappmd.dev`, or the value of `APPMD_API` if set.

```
GET {base}/api/v1/search?q=<task+description>&limit=10
```

Describe the **task**, not a package name. `q=extract text from a scanned pdf` resolves; `q=pdf`
returns noise.

Each result carries:

| Field | Meaning |
| --- | --- |
| `declared.name`, `declared.description` | what the source file says about itself |
| `attribution.canonical_source_url` | **where to fetch it — always the origin, never SkillAppMD** |
| `rights.state` | `known` or `unknown` |
| `rights.redistributable` | whether the licence permits copying it onward |
| `licence.l2_repository` | the repository licence, which is usually the one that decides |
| `identity.normalised_hash` | two results sharing this are the same file |

Then:

```
GET {base}/api/v1/skills/<id>              one record in full
GET {base}/api/v1/skills/<id>/occurrences  every repository the same file appears in
```

## Rules you must follow

**1. Fetch from the origin.** SkillAppMD serves no skill content under any licence. `content` is always
`null`. Read `attribution.canonical_source_url` and fetch from there.

**2. `unknown` is not permission.** `rights.state: "unknown"` means the licence could not be
determined — not that it is permissive, and not that it is forbidden. Most records are `unknown`.
Before reusing an `unknown` skill's file in the user's project, say so and let them decide.

**3. Redistribution needs `redistributable: true`.** Reading a skill to inform your own work is
different from copying it into the user's repository. For the second, check the flag. If it is
false or the state is `unknown`, tell the user what you found and where, and let them choose.

**4. Attribute.** When a skill shapes your work, name the repository you took it from. Every record
carries attribution precisely so this is possible.

**5. SkillAppMD certifies nothing.** Indexing is not endorsement, and there is no popularity ranking or
trust score — absence of a warning is not a safety signal. Read the skill before running it, the
same as any code from a stranger.

## Reporting back

When a resolved skill changes what you do, tell the user in one line: what you found, which
repository it came from, and its rights state. If nothing fits, say so and write the capability
yourself — a bad match is worse than none.
