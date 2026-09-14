# Snapshotting benchmark interpretation
Evidence label: `v041-sort-only-partial`.
Measured 7 planned fresh-process repetitions per throughput case.
This run is partial. Completed case repetitions range from 1 to 2.
Primary results are elapsed time, throughput, heap delta, and RSS delta from non-GC-observed timing workers.
Retained-heap diagnostics are recorded separately in `gc-diagnostics.json` after explicit GC opportunities.
| shape | live-hit ratio | seal ops/s | seal us/op | plain Zod ops/s | plain Zod us/op |
| --- | ---: | ---: | ---: | ---: | ---: |
| flat100 | 100% | 10193 | 98.10 | 10426335 | 0.10 |
| flat100 | 90% | 10197 | 98.07 | 8739219 | 0.11 |
| flat100 | 50% | 11538 | 86.67 | 5643464 | 0.18 |
| flat100 | 0% | 12443 | 80.36 | 3419062 | 0.29 |
| flat50 | 100% | 23431 | 42.68 | 11573252 | 0.09 |
| flat50 | 90% | 23949 | 41.76 | 8906097 | 0.11 |
| flat50 | 50% | 23662 | 42.26 | 5460568 | 0.18 |
| flat50 | 0% | 26320 | 37.99 | 3890838 | 0.26 |
| flat500 | 100% | 1675 | 597.06 | 9552100 | 0.10 |
| flat500 | 90% | 1673 | 597.60 | 8278413 | 0.12 |
| flat500 | 50% | 1652 | 605.37 | 4977013 | 0.20 |
| flat500 | 0% | 1655 | 604.21 | 3354572 | 0.30 |
| nested50x10 | 100% | 2069 | 483.31 | 8692985 | 0.12 |
| nested50x10 | 90% | 2048 | 488.20 | 7021504 | 0.14 |
| nested50x10 | 50% | 2055 | 486.73 | 3888308 | 0.26 |
| nested50x10 | 0% | 1662 | 601.83 | 2595523 | 0.39 |
| string | 100% | 3028901 | 0.33 | 71211336 | 0.01 |
| string | 90% | 2687593 | 0.37 | 49109068 | 0.02 |
| string | 50% | 1321383 | 0.76 | 54210215 | 0.02 |
| string | 0% | 703160 | 1.42 | 48843558 | 0.02 |
Interpretation:
- Seal parsing includes Zod validation, snapshot allocation, key computation, interning, and live-hit collision comparison.
- Structured values cost more as descriptor access, property definition, allocation, and freezing increase with graph size.
- This preserved partial run used the earlier plain Zod shape-check baseline. Its Zod timings are not comparable with the corrected field-level Zod evidence.
- In the first 0.4.1 optimization, descriptor reads and per-property definition dominated sorting. After that change, comparator-based canonical sorting became the largest avoidable `snapshotData` cost for plain objects.
- The final 0.4.1 path partitions array-index keys from string keys before sorting, so array-index checks are computed once per key instead of once per comparison.
- No performance threshold is attached to 0.4.1.
