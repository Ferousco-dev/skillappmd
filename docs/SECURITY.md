# SECURITY AND TRUST

| | |
| --- | --- |
| Document | `SECURITY.md` v1.0 · Phase 02 · `[architect]` + `[ethics-officer]` · 2026-08-27 |
| Satisfies | `REQ-075`–`REQ-081`, `REQ-086`, `NFR-019`–`NFR-022`, `NFR-024` |
| Resolves | **`ETH-001`** (G2 blocker), addresses `RSK-007` |

---

## 1. Two different security problems

| | Protecting **AppMD** from corpus content | Publishing judgements **about** corpus content |
| --- | --- | --- |
| Risk | malicious input compromises our pipeline | we defame an author, or vouch for malware |
| Phase 1 | **fully in scope** | **deterministic signals only** |

They are routinely conflated. They have different failure modes and different victims.

## 2. Protecting AppMD (`NFR-021`, `NFR-022`, `REQ-080`)

**Content is never executed. At any stage. For any purpose.** (`REQ-080`) Not in a sandbox, not
"just to check". A skill is instructions for an agent; executing it is the attack.

| Threat | Control |
| --- | --- |
| YAML bomb / billion laughs | Safe-load parser, depth + expansion limits, size cap |
| Oversized file | Hard byte cap before parse (`NFR-022`) |
| Invalid UTF-8 | Clean fail with recorded reason (`REQ-037`) |
| Path traversal in `path` | Treated as opaque data; never used to build a filesystem path |
| **Prompt injection in content** | Content is **data**. No pipeline stage passes it to a model in Phase 1 (`NFR-015` — zero AI spend). When AI is added, content is untrusted input inside a fenced boundary |
| Zip/archive bombs in siblings | `artifact_siblings` not ingested in Phase 1 |

### 2.1 Identifiers from sources are untrusted input too (`DEF-004`)

A repository name is third-party content. At the 1,000 rung, the real repository
`Michaelunkai/study--AI_ML-...-openclaw` broke a query expression because **`--` is a SQL comment
marker** and GitHub permits repeated hyphens.

We were lucky in the failure mode: the remote parser was strict and returned 422. **A permissive
parser would have silently returned the wrong rows** — licences attributed to the wrong
repositories, no error raised, `RSK-004` realised without a trace.

**Rule.** Any identifier arriving from a source and composed into a query, path, or command is an
injection surface, regardless of how innocuous it looks. Where a parameterised form exists, use it.
Where none exists — as with the datasets-server `where` parameter — **refuse to build the
expression** rather than sanitise it, record the refusal, and let the record fall to the
conservative default.

**Secrets** (`NFR-019`, `NFR-020`, `REQ-086`, `REQ-071`): environment/secret store only, never
literals; never in source control, logs, raw records, canonical records or API responses. Verified
by CI secret-scan **plus** assertion tests over log and API output — scanning the tree catches
committed secrets, only output assertions catch leaked ones.

## 3. Deterministic signals (`REQ-075`, priority S)

Available in Phase 1 **without executing anything**:

| Signal | Source | Note |
| --- | --- | --- |
| `has_scripts` | corpus column | **measured 4.6%** (R3) |
| `allowed-tools` | frontmatter | first-class security input, parsed not merely stored |
| Credential-like patterns | regex over body | high false-positive rate — a *lead*, never a verdict |
| Network/shell patterns | regex over body | same |
| Obfuscation indicators | entropy, base64 blocks | same |

**The real attack surface is the sibling scripts, not the `SKILL.md` body.** `artifact_siblings`
holds 7,264,865 rows and is **not ingested in Phase 1** (`DEC-011`). Any Phase 1 security signal is
therefore a signal about the *documentation*, not about the *executable code beside it* — and
`REQ-078` requires saying so rather than letting silence imply coverage.

## 4. `ETH-001` — conditions for publishing any score

`ETH-001` was raised at G0 as **blocking at G2**. The six conditions, now architecture:

| # | Condition | Mechanism |
| --- | --- | --- |
| 1 | Score always accompanied by findings and evidence | Score is a **computed projection of a findings list**, not a stored scalar. A bare score is **not representable** (`REQ-077`) |
| 2 | Framed as a signal for review, never certification | API field naming + response envelope; `REQ-079` |
| 3 | Absence of findings ≠ "safe" | `findings: []` renders as **"no findings from analyser X v0.1.0"**, never "safe" (`REQ-078`) |
| 4 | Stated appeal/correction route before public exposure | `REQ-063` correction path — **mandatory in Phase 1** |
| 5 | Analyser id + version + timestamp travel with every score | Required fields; a score without them is **not storable** (`REQ-076`) |
| 6 | Findings are AppMD inference, machine-readably | `inferred` compartment, `field_origins` (`PROVENANCE.md` §1) |

**Condition 1 is the load-bearing one.** Making the score a *projection* rather than a *column*
means "publish a number without its evidence" is not a policy someone can violate — it is a state
the type system cannot express.

**Phase 1 publishes no trust score at all** (`REQ-062`: nothing served; §3: signals only). The
conditions are built before the feature, not after, because retrofitting condition 1 would mean
touching every read path.

## 5. False positives and negatives (`RSK-007`)

| | Harm | Mitigation |
| --- | --- | --- |
| **False positive** | Reputational harm to an author with no relationship to AppMD, no notice, no appeal | Findings + evidence shown (cond. 1); appeal route (cond. 4); patterns are leads not verdicts |
| **False negative** | A developer relies on our score and ships the compromise | Never "safe" (cond. 3); never certification (cond. 2); analyser version visible so staleness is detectable |

The false negative is the graver one, and it is worth being precise about why: **AppMD's score
*causes* reliance the author's own README never would.** A developer who reads a repo and decides to
trust it has made their own judgement. A developer who reads `Trust: 94/100` has borrowed ours.

SkillsMP's posture — *"does not endorse or verify the quality, safety, or functionality of any
skill"* — is the **floor**, not the ceiling.

## 6. Untrusted-by-default

Third-party content is untrusted at every stage (`NFR-021`). **No circumvention capability exists
anywhere in this system** (`REQ-027`, `NFR-024`) — not as a flag, not as config, not commented out.

## 7. Open

| Item | Status |
| --- | --- |
| `ETH-001` | **CONDITIONS MET IN DESIGN.** Verified at G4 against implementation, not merely asserted here |
| `RSK-007` | **OPEN** — reduced by §4/§5; cannot close while any score is published |
| Sibling-script analysis | **Deferred.** Phase 1 signals describe documentation, not code |
| Prompt-injection defence | **Deferred with the AI subsystem.** Boundary noted so it is designed, not discovered |
