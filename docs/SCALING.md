# SCALING

| | |
| --- | --- |
| Document | `SCALING.md` v1.0 · Phase 02 · `[architect]` · 2026-08-27 |
| Satisfies | `NFR-031`–`NFR-034` |
| Governing | `DEC-021` — **design for 1B+, do not build 1B+** |

---

## 1. What "designed for scale" means here

It does **not** mean built for scale. It means four properties hold now, so that scaling later is
work rather than a rewrite:

| Property | Mechanism | Cost in Phase 1 |
| --- | --- | --- |
| Nothing assumes the dataset fits in memory | row-group streaming (`DEC-016`), cursors | none — the 128 MB Workers ceiling forced it anyway |
| All traversal is cursor-based | `NFR-032`, `NFR-039` | none |
| Identity is partitionable | `content_hash` prefix (`NFR-033`) | none — hashes are uniformly distributed |
| Every component is replaceable | ports + lint (`NFR-027`, `NFR-028`) | small, and it is what makes `DEC-027` a plan rather than a trap |

**Every one of these is free or nearly free at 10,000 records.** That is the test for whether a
scaling provision belongs in Phase 1: if it costs real complexity today, it is *building* future
scale and `DEC-021` excludes it.

## 2. Milestones and the next binding constraint (`NFR-034`)

| Scale | Storage | Cost/mo | **Next binding constraint** | Response |
| ---: | ---: | ---: | --- | --- |
| 10k | 0.02 GB | $0 | none | — |
| 100k | 0.20 GB | $0 | none | — |
| 1M | 2.02 GB | $0 | none | — |
| **3.8M** *(full corpus)* | **7.65 GB** | **$1.99** | **D1 7 GB migration trigger** | `DEC-026` JSON provenance → 4.3 GB |
| ~5.0M (8.8M with `DEC-026`) | 10 GB | — | **D1 hard ceiling** | migrate to PostgreSQL (`DEC-027`) |
| 10M | 20.15 GB | $11.55 | full index rebuild becomes hours | incremental rebuild |
| 10M | — | — | keyword search outgrows SQLite FTS | Postgres tsvector or dedicated index |
| ~20M | — | — | Vectorize 20M/index | index sharding + routing (**future**) |
| 100M | 201.54 GB | $150.58 | single-writer canonical path | partition by hash prefix (`NFR-033`) |
| 1B | 2,015 GB | $1,540.94 | **operational complexity, not cost** | partitioned Postgres or distributed store |

All figures computed by `docs/models/sizing.py` from measured corpus data (R3).

## 3. The finding worth repeating

**Cost is not the barrier.** Ingesting the entire known skill ecosystem costs ~$17 once and ~$2/month.
Even 1B occurrences is ~$1,541/month — a real number, not a prohibitive one.

**The barrier at every milestone is a structural limit, not a price:** D1's 10 GB, Vectorize's 20M,
the single-writer path, rebuild time. Those are the things to design around, and §2 names each with
the evidence that produced it.

## 4. What we are explicitly not building

| Not built | Why | When it would be |
| --- | --- | --- |
| Sharded canonical store | `DEC-027` — migrate once instead of routing forever | past Postgres partitioning |
| Distributed queue | Cloudflare Queues does 5,000 msg/s × 10,000 queues | not foreseeable |
| Read replicas | read volume is one operator | when API traffic is real |
| Microservices | modular monolith; boundaries drawn, network not crossed | 100M+, if ever |
| Multi-region | no latency requirement | when there is one |
| Incremental index rebuild | full rebuild is seconds at 10k | ~10M |

Each line is a **deliberate deferral with a trigger**, not an oversight. That distinction is the
whole content of `DEC-021`.

## 5. The 1B question

At 1B occurrences: 2 TB canonical, 502M canonical skills, ~$1,541/month. Reachable with partitioned
PostgreSQL, hash-prefix sharding, and a routing layer.

**Nothing in Phase 1 forecloses it**, and nothing in Phase 1 is built for it. The honest position is
that a 1B-scale architecture would be designed against operational evidence we will not have until
we are three orders of magnitude further along — and designing it now would mean guessing, then
defending the guess. `NFR-034` is satisfied by naming the constraints, not by pre-solving them.
