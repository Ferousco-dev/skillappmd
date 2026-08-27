#!/usr/bin/env python3
"""AppMD storage + cost model. Inputs are MEASURED, not assumed.
Measurements: docs/research/R3-CORPUS-MEASUREMENTS.md (stratified sample, n=1200, 2026-08-27).
Prices: Cloudflare public pricing fetched 2026-08-27 (see DATABASE.md sources)."""

# ---- MEASURED corpus characteristics -------------------------------------
MEAN_BODY      = 4425      # bytes, stratified mean over 3.8M rows
MEDIAN_BODY    = 2512
P90_BODY       = 11581
PRIMARY_SHARE  = 0.502     # measured; paper reports 50.5% verbatim copies
MEAN_PATH      = 50
MEAN_REPO      = 26
SIBLINGS       = 4.47
SCRIPTS_SHARE  = 0.046

# ---- Row-size model (uncompressed, incl. typical index overhead) ----------
# occurrence row: ids(16+16) repo(26) path(50) 2 hashes(64) 6 timestamps(~120)
#                 flags/ints(~40) source ref(~24) = ~356B; +~60% for indexes
OCC_ROW   = 356 * 1.6
# canonical row: id, hashes, name, description(~200), licence x3, rights, temporal
CANON_ROW = 700 * 1.6
# provenance: per-field origin rows, ~10 fields per canonical skill
PROV_FIELDS_PER_SKILL = 10
PROV_ROW  = 110 * 1.6

CF = dict(  # Cloudflare, Workers Paid
    d1_write_per_m=1.00, d1_read_per_m=0.001, d1_storage_gb_mo=0.75, d1_storage_free=5,
    d1_write_free_m=50, d1_read_free_b=25,
    q_ops_per_m=0.40, q_free_m=1,
    r2_storage_gb_mo=0.015, r2_class_a_per_m=4.50, r2_class_b_per_m=0.36,
    r2_storage_free=10, r2_a_free_m=1,
)
STAGES = 9          # brief's pipeline stages -> queue messages per occurrence
STAGES_COLLAPSED = 4  # deterministic adjacent stages merged (see DATABASE.md)

def model(occ):
    canon = occ * PRIMARY_SHARE
    content_gb = canon * MEAN_BODY / 1e9          # only primaries carry content
    occ_gb     = occ   * OCC_ROW   / 1e9
    canon_gb   = canon * CANON_ROW / 1e9
    prov_gb    = canon * PROV_FIELDS_PER_SKILL * PROV_ROW / 1e9
    rel_gb     = occ_gb + canon_gb + prov_gb
    return dict(occ=occ, canon=canon, content_gb=content_gb, occ_gb=occ_gb,
                canon_gb=canon_gb, prov_gb=prov_gb, rel_gb=rel_gb)

def d1_ingest_cost(m):
    writes = (m["occ"] + m["canon"] + m["canon"]*PROV_FIELDS_PER_SKILL) / 1e6
    billable = max(0, writes - CF["d1_write_free_m"])
    store = max(0, m["rel_gb"] - CF["d1_storage_free"]) * CF["d1_storage_gb_mo"]
    return billable * CF["d1_write_per_m"], store

def queue_cost(occ, stages):
    ops = occ * stages / 1e6
    return max(0, ops - CF["q_free_m"]) * CF["q_ops_per_m"]

def r2_cost(m):
    puts = max(0, m["canon"]/1e6 - CF["r2_a_free_m"]) * CF["r2_class_a_per_m"]
    store = max(0, m["content_gb"] - CF["r2_storage_free"]) * CF["r2_storage_gb_mo"]
    return puts, store

print("="*104)
print("STORAGE MODEL  (uncompressed, relational, indexes included)")
print("="*104)
print(f"{'occurrences':>13} {'canonical':>12} {'content GB':>11} {'occ GB':>9} {'canon GB':>9} "
      f"{'prov GB':>9} {'RELATIONAL':>11} {'D1 limit?':>12}")
rows=[]
for occ in (10_000, 100_000, 1_000_000, 3_797_117, 10_000_000, 100_000_000, 1_000_000_000):
    m = model(occ); rows.append(m)
    verdict = "OK" if m["rel_gb"] <= 10 else f"EXCEEDS x{m['rel_gb']/10:.0f}"
    tag = " (full corpus)" if occ==3_797_117 else ""
    print(f"{occ:>13,} {m['canon']:>12,.0f} {m['content_gb']:>11.2f} {m['occ_gb']:>9.2f} "
          f"{m['canon_gb']:>9.2f} {m['prov_gb']:>9.2f} {m['rel_gb']:>11.2f} {verdict:>12}{tag}")

print()
print("="*104)
print("ONE-TIME INGESTION COST + MONTHLY STORAGE  (Cloudflare Workers Paid, USD)")
print("="*104)
print(f"{'occurrences':>13} {'D1 writes':>11} {'D1 store/mo':>12} {'Q x9':>10} {'Q x4':>10} "
      f"{'R2 puts':>10} {'R2 store/mo':>12} {'INGEST':>10} {'MONTHLY':>10}")
for occ,m in zip((10_000,100_000,1_000_000,3_797_117,10_000_000,100_000_000,1_000_000_000), rows):
    dw, ds = d1_ingest_cost(m); q9 = queue_cost(occ,STAGES); q4 = queue_cost(occ,STAGES_COLLAPSED)
    rp, rs = r2_cost(m)
    ingest = dw + q9 + rp; monthly = ds + rs
    print(f"{occ:>13,} {dw:>11,.2f} {ds:>12,.2f} {q9:>10,.2f} {q4:>10,.2f} "
          f"{rp:>10,.2f} {rs:>12,.2f} {ingest:>10,.2f} {monthly:>10,.2f}")

print()
print("Queue saving from collapsing 9 deterministic stages to 4, at 100M occurrences: "
      f"${queue_cost(100_000_000,9)-queue_cost(100_000_000,4):,.2f} per full ingest")
print(f"D1 10 GB ceiling is crossed at approximately "
      f"{10/ (model(1_000_000)['rel_gb']/1_000_000):,.0f} occurrences in ONE database.")
