# OPERATIONAL RUNBOOK

| | |
| --- | --- |
| Document | `runbook.md` v1.0 · Phase 06 · `[release-manager]` · 2026-08-27 |
| Gate | G6 criterion 10 — what is watched, by whom, at what threshold |

---

## 1. What is running

**Nothing, continuously.** Phase 1 is operator-invoked batch work plus a local read API. There is no
deployment, no scheduler, no traffic (`DEC-010`).

This section will be wrong the moment anything is deployed, and that is the point of writing it now:
the monitoring below is defined **before** there is something to monitor, so the first incident is
not also the first time anyone asks what to watch.

## 2. What is watched, and the threshold that means "act"

| Signal | Source | Threshold | Why this number |
| --- | --- | ---: | --- |
| Dead-letter depth | `appmd dlq list` | **> 0** | A DLQ entry is a job that exhausted its retries. One is a question; a rising count is an incident |
| Parse failure rate | run report | **> 5%** | Measured baseline is **0.46%** (2 of 438). 5% is ~10× the observed rate — a real regression, not noise |
| Rights `unknown` share | run report | **swing > 15 points** | Measured 68.7%. A sudden move means the licence lookup broke, not that the world changed |
| Dedup collapse rate | run report | **falls below 20%** | Measured ~50% corpus-wide. A collapse to near zero means fingerprinting is broken and the index is inflating |
| Raw retention backlog | `appmd raw status` | **expired > 1,000** | Bytes we hold past their retention window are a licence exposure (`DEC-019`), not just untidiness |
| Pipeline memory | ladder harness | **delta > 128 MB** | `NFR-014`. This has already caught one regression (`DEF-007`) |
| Source error rate | connector stats | **> 10% over 100 requests** | Trips the circuit breaker (`REQ-025`) and protects the source as much as us |
| CI status | GitHub Actions | **any red** | `main` is always green; a red build blocks merge |

**Who:** the operator — a single person in Phase 1 (intake Q7). No on-call rotation exists and
pretending otherwise would be fiction.

## 3. Routine operations

```bash
appmd doctor                                  # config, schema version, counts
appmd raw status                              # retention state
appmd backup create && appmd backup verify …  # before ANY migration or bulk run
appmd raw retention --confirm                 # expire raw past its window
appmd index rebuild --confirm                 # after restore, or on index suspicion
appmd dlq list                                # what failed and why
```

### 3.1 Author removal — the cache purge obligation (`NFR-040`, `CR-007`)

`REQ-063` removal tombstones the record and deletes the bytes **at the origin, immediately**. It
does **not** reach copies already held in an edge cache. Until deployment there is no edge, so this
step is currently a no-op — but it is written down now, because the moment a cache exists this
becomes the difference between "removed" and "removed everywhere".

```bash
appmd removal request --skill <id> --repo <r> --reason <text> --by <who>
appmd removal list
appmd removal action <request-id> --confirm        # deletes bytes; envelope survives
# THEN, once deployed: purge the CDN entry for /api/v1/skills/<id> and any page containing it.
```

**The window is bounded, not eliminated.** `max-age` is 300 s for a record and 60 s for a
collection, so an unpurged copy expires within five minutes. Records whose rights are `unknown` are
`no-store` and were never cached in the first place — which is most of them.

**If you raise the TTL, you have made removal slower.** `TC-329` fails if the bound moves, so the
decision cannot be made silently.

## 4. Incident responses

| Symptom | First move | Then |
| --- | --- | --- |
| DLQ growing | `appmd dlq inspect <id>` — read the actual error | fix the cause, `appmd dlq resubmit <id>`. **Never** resubmit blind: retries are billable and a poison message will simply return |
| Search returns nothing | `appmd doctor` → is the index populated? | `appmd index rebuild --confirm`. Canonical is untouched; the index is derived and disposable |
| Parse failures spike | Check whether the sample is **stratified** | Head-of-file sampling reports nonsense (`DEC-024`). This has produced a false alarm twice — rule it out first |
| Source returning 4xx | Read the body, not just the status | 429/5xx retry automatically; 4xx do **not**, and retrying them burns someone else's quota for nothing |
| Rights suddenly all `unknown` | Is the licence lookup running? | The ladder passes `repoLicence: null` deliberately and reports 100% unknown **by construction**. Confirm which path produced the number before treating it as a finding |
| Memory over budget | Re-run the 10,000 ladder | Compare against the 119 MB baseline; `DEF-007` is the worked example |

Two of those rows exist because the symptom **looked like a defect and was not**. Recording them
here is cheaper than rediscovering them at 2am.

## 5. What would need to exist before deployment

Honest list, not a plan:

- `wrangler.toml`, D1 and R2 bindings, a Cloudflare account — none exist (`DEC-010`)
- A queue consumer that refuses to start without a DLQ — the guard exists (`DEC-025`); nothing runs it
- Log aggregation — currently stdout
- Alerting on the thresholds in §2 — currently a human running `appmd doctor`
- An on-call rotation — currently one person

None of this blocks Phase 1, which is local by design. All of it blocks Phase 2, and it is written
down so Phase 2 starts from a list rather than from memory.
