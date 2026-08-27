# INTERFACE SPECIFICATION

| | |
| --- | --- |
| Document | `INTERFACE.md` v1.0 · Phase 03 · `[interaction-designer]` · 2026-08-27 |
| Satisfies | `REQ-088`–`REQ-090`, `REQ-064`–`REQ-071`, `REQ-085`, `REQ-097` |
| Scope | Operator **CLI** and the HTTP **API surface**. No GUI (`DEC-008`) |

---

## 1. Interface type and justification (`UI-001`)

**Text-based CLI plus a read-only HTTP API. No graphical interface.**

| Consideration | Finding |
| --- | --- |
| Who operates it | One developer running batch ingestion (intake Q7) |
| What they do | Trigger runs, inspect records, diagnose failures, rebuild, back up |
| Frequency | Occasional, deliberate, non-interactive-friendly |
| Environment | Terminal, scriptable, CI-able |

A GUI would serve no operator need Phase 1 has, and BRIEF §4 explicitly excludes dashboards. The
API is machine-facing; its "users" are the CLI, future agents, and a front-end in a separate repo.

**Ìlànà's warning applies and is accepted:** a CLI is *harder* than a GUI because it demands recall
rather than recognition. The principles below are applied more strictly, not less.

## 2. Command surface

```
appmd source list                                   # what sources exist, and their access policy
appmd discover  --source <id> --limit <n> [--dry-run]
appmd ingest    --source <id> --limit <n> [--resume]
appmd skill get <id>
appmd skill list [--cursor <c>] [--limit <n>]
appmd occurrence list --skill <id> [--cursor <c>]
appmd job get <job-id> | appmd job list --skill-ref <ref>
appmd dlq list | appmd dlq inspect <id> | appmd dlq resubmit <id>
appmd index rebuild [--confirm]
appmd backup create | appmd backup restore <path> --confirm | appmd backup verify <path>
appmd removal request --skill <id> --reason <text>
appmd reanalyse --analyser <id> --since-version <v> [--dry-run]
appmd doctor                                        # config, adapters, DLQ presence, corpus path
```

**Structure:** `appmd <noun> <verb>`. Nouns are domain objects the operator already knows from the
SRS (`source`, `skill`, `occurrence`, `job`, `dlq`, `index`, `backup`). No command mixes nouns.

## 3. The five principles, as tests

**Structure.** One consistent grammar, `noun verb`, across every command. Read operations
(`get`, `list`, `inspect`) never mutate. Mutating operations (`ingest`, `rebuild`, `restore`,
`removal`) are separate nouns and cannot be reached by adding a flag to a read command.

**Simplicity.** The most common task — ingest a bounded batch — is one line with two flags:
`appmd ingest --source gitskills --limit 100`. No config file is required to run it; every other
flag has a default. `appmd doctor` answers "is my setup right?" without reading documentation.

**Visibility.** `appmd source list` shows each source *with its declared access policy*, so rate
limits are visible before a run rather than discovered during one. `appmd --help` lists nouns only;
verbs appear under `appmd <noun> --help`, so the top level stays readable.

**Feedback.** Every run reports progress to the terminal, not only to the log — Ìlànà names
"feedback that exists in the log but not on the screen" as a standard failure. Every run ends with
the run report (`REQ-085`) including **sampling bias**, because a run that silently sampled
head-of-shard would otherwise look identical to one that sampled correctly (R3 Finding 2).

**Tolerance.** `--dry-run` on every command that writes. `--confirm` required on the three
destructive operations. Unrecognised flags suggest the nearest valid one rather than only failing.
Interrupted runs resume from cursor (`REQ-010`) rather than restarting.

## 4. Destructive actions (`UI-002`, criterion 5)

| Action | Guard | Reversible? |
| --- | --- | --- |
| `backup restore` | `--confirm` + prints target and record counts first | Overwrites canonical — **take a backup first**, and the command says so |
| `index rebuild` | `--confirm` | Yes — derived data, rebuildable (`REQ-052`) |
| `removal request` | `--confirm` + prints what will be tombstoned | **Bytes: no. Provenance envelope: preserved** (`DEC-015`) |
| `ingest` | idempotent (`REQ-016`) | Re-running is safe by construction |

No destructive action proceeds on an unattended default. `removal` states plainly that byte
deletion is permanent while the provenance envelope survives, so the operator knows exactly what
they are and are not destroying.

## 5. Error catalogue (criterion 4)

Every error states **what happened**, **why**, and **what to do next**.

| Code | Message | Recovery |
| --- | --- | --- |
| `NO_DLQ_CONFIGURED` | Consumer refuses to start: no dead letter queue configured | Set `dead_letter_queue`. Without it Cloudflare deletes exhausted messages permanently (`DEC-025`) |
| `CORPUS_NOT_FOUND` | Corpus not found at `data/corpus/` | Run `appmd corpus fetch`, or set `--corpus-path` |
| `SAMPLING_NOT_STRATIFIED` | Refusing to validate against head-of-shard data | Use `--stratified` (`DEC-024`); shards are size-ordered |
| `SOURCE_RATE_LIMITED` | Source returned 429; honouring `Retry-After: Ns` | Automatic. Reduce `--concurrency` if persistent |
| `PARSE_FAILED` | Not an error: recorded per-record with a reason | `appmd job list --status parse_failed` |
| `ATTRIBUTION_MISSING` | Write rejected: record lacks repository or source URL | Defect in the connector — report with `skill_ref` |
| `RIGHTS_UNKNOWN` | Not an error: `redistributable=false` on absent evidence | Informational (`DEC-018`) |
| `INVALID_CURSOR` | Cursor malformed or expired | Restart pagination without `--cursor` |
| `RESTORE_VERIFY_FAILED` | Restored record count or digest mismatch | **Do not use this backup.** Retain it and investigate |

`SAMPLING_NOT_STRATIFIED` exists because R3 proved the failure is silent otherwise: a run over
offset-0 data yields "mean skill size 10 bytes" and looks like a success.

## 6. Primary flows (criterion 6)

**Flow A — first ingestion**
1. `appmd doctor` → config, adapters, DLQ, corpus path
2. `appmd source list` → confirm access policy
3. `appmd discover --source gitskills --limit 100 --dry-run` → see what would be discovered
4. `appmd ingest --source gitskills --limit 100` → progress, then run report with bias disclosure
5. `appmd skill list --limit 10` → inspect
6. `appmd backup create` → before scaling the batch

**Flow B — diagnose a failure**
1. Run report names counts and failures
2. `appmd job list --status failed` → what failed
3. `appmd job get <job-id>` → attempts, error, timestamps
4. `appmd dlq list` → exhausted jobs
5. `appmd dlq inspect <id>` → payload and error history
6. Fix cause → `appmd dlq resubmit <id>`

**Flow C — recover**
1. `appmd backup verify <path>` → **verify before restoring, never after**
2. `appmd backup restore <path> --confirm`
3. `appmd index rebuild --confirm`
4. `appmd doctor`

## 7. Feedback latency (criterion 8)

| Duration | Behaviour |
| --- | --- |
| <1 s | Result only |
| 1–10 s | Spinner with the current stage named |
| >10 s | Progress line: `stage · n/total · elapsed · eta`, updated ≥1/s |
| Long runs | Per-stage counters stream; **`Ctrl-C` is safe** — cursor persists, resume with `--resume` |

Because ingestion is minutes-to-hours (`NFR-011`, provisional), the operator must be able to tell
*working* from *hung* at a glance. A progress line that names the current stage does that; a
spinner alone does not.

## 8. Accessibility (criterion 7)

| Check | Result |
| --- | --- |
| Colour | Never the sole carrier of meaning. Status is always a word (`ok`, `failed`, `skipped`) |
| `NO_COLOR` / non-TTY | Honoured; plain output when piped |
| Screen reader | Plain-text, left-to-right; no ASCII art conveying meaning; tables degrade to labelled lines |
| Keyboard | Entirely keyboard-driven by nature. No mouse, no TTY-only interaction |
| Machine readable | `--json` on every read command, so output is parseable rather than scraped |
| Contrast | Default terminal colours only; no custom palette to misjudge |

## 9. API as interface

`docs/API.md` is normative. Interface-level obligations restated:

- The `notice` field appears on every response: skills are indexed from public repositories, each
  under its own licence, and **AppMD does not certify or verify any skill**. This is `ETH-001`
  condition 2 rendered where a human actually reads it.
- `rights.state: "unknown"` is on the wire (`DEC-018`) so a consumer can distinguish *"we know you
  may not"* from *"we don't know"*.
- Errors carry a stable `code`, a human `message`, and a `request_id`.
- 429 carries `Retry-After` — the same courtesy outward that we require inward (`NFR-023`).
