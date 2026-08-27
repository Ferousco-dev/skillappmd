# PROCESS MATURITY ASSESSMENT

| | |
| --- | --- |
| Document | `maturity-assessment.md` v1.0 · Phase 08 · `[metrologist]` · 2026-08-27 |
| Gate | G8 criterion 7 |
| Model | CMMI staged representation, assessed **indicatively** |

**A caveat that governs everything below.** CMMI assesses an *organisation*, over multiple projects,
by appraisers who did not do the work. This is one project, one run, one person. What follows is an
**indicative positioning with evidence**, not an appraisal, and calling it one would be exactly the
overclaiming Article 2 forbids.

---

## Indicative level: **3 (Defined), with Level 4 practices present and Level 4 status unearned**

| Level | Verdict | Evidence |
| --- | --- | --- |
| **1 Initial** | passed | Work is not ad hoc; nothing was built without a requirement |
| **2 Managed** | **met** | Requirements managed (98 REQ / 39 NFR / 13 DOM, baselined, `CR`-controlled) · planning (`ROADMAP.md`, 12 increments) · monitoring (8 gates with evidence) · **configuration management** (`scm-plan.md`, tagged release) · **quality assurance** (`quality-plan.md`, audit) · measurement (30 metrics) |
| **3 Defined** | **met** | The process is **written, tailored and enforced**, not remembered: Ìlànà's 11 phases tailored to Rigour 3; `coding-standard.md` with every deviation measured and reasoned; verification strategy at four levels; decision register of 39 entries; **three automated checkers enforcing the process itself** |
| **4 Quantitatively Managed** | **NOT met** — practices present, status unearned | *Present:* 30 metrics; defect density 1.99/KLOC; defect cause analysis with 5 categories; gate first-pass rate 60%; mean defect escape 2.9 increments. *Missing:* **a baseline to compare against.** One run produces numbers, not statistical control. Nothing here has a control limit because nothing has a second data point |
| **5 Optimizing** | **NOT met** — one instance of the behaviour | *Present:* a defect-cause analysis that produced a concrete process change, implemented and CI-enforced (`subsystem-coverage.js`). *Missing:* this is one improvement cycle. Level 5 is a *habit* of causal analysis and deployed improvement across many runs |

**Level 3 is claimed. Level 4 is deliberately not**, and the distinction matters: having metrics is
not the same as managing quantitatively. `MET-001`'s 1.99 defects/KLOC is a number with nothing to
compare it to — that is what the baseline in `.ilana/metrics.csv` is for next time.

---

## ISO/IEC 12207 process coverage

| Process | Evidence | Coverage |
| --- | --- | --- |
| Acquisition | `R1`–`R4` source access research; licence and ToS analysis before any code | **Full** |
| Supply | `CHANGELOG.md`, tagged `v0.1.0`, handover documentation | Full |
| Development — requirements | SRS v1.1, IEEE 830 shape, baselined at G1 | Full |
| Development — architecture | 20 documents, 102 design elements, G2/G3 | Full |
| Development — construction | Coding standard, 3-mode dependency lint | Full |
| Development — integration | Cross-adapter contract suites across 5 ports | Full |
| Development — qualification | 4 test levels, 318 tests, IEEE 829 plan | Full |
| Operation | `runbook.md` — 8 signals with measured thresholds | **Partial** — nothing is running |
| Maintenance | `REQ-095` re-analysis, `REQ-094` migrations, rollback rehearsed | Full |
| Configuration management | `scm-plan.md`, baselines, 6 CRs dispositioned | Full |
| Quality assurance | `quality-plan.md`, `audit-report.md`, 30 metrics | **Partial** — no independent auditor |
| Verification / validation | G5 passed; acceptance signed by the user | Full |

Two partials, both from the same root: **nothing is deployed, and there is one person.**

---

## The honest ceiling

Three gate criteria were waived across three gates for the same reason — no independent reviewer,
tester or auditor (`audit-report.md` §0, finding A2).

**That is a structural ceiling on maturity, not a gap to be closed by more effort.** No quantity of
additional automation reaches Level 4's independence requirements, and the project's own evidence
shows why: the single independent review in this run — the G1 stakeholder review — reversed
`DEC-018` and `DEC-019`, **two decisions no test could have caught**, because both were consistent
implementations of a wrong idea.

One independent review outperformed every automated check on exactly the class of problem automation
cannot see. That is the strongest argument in this document for a second person, and it is an
argument made from measurement rather than from principle.
