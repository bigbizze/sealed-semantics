# Snapshotting benchmark interpretation
Evidence label: `v041-optimized`.
Measured 7 planned fresh-process repetitions per throughput case.
Primary results are elapsed time, throughput, heap delta, and RSS delta from non-GC-observed timing workers.
Retained-heap diagnostics are recorded separately in `gc-diagnostics.json` after explicit GC opportunities.
| shape | live-hit ratio | seal ops/s | seal us/op | plain Zod ops/s | plain Zod us/op |
| --- | ---: | ---: | ---: | ---: | ---: |
| flat100 | 100% | 19604 | 51.01 | 139491 | 7.17 |
| flat100 | 90% | 20070 | 49.83 | 141874 | 7.05 |
| flat100 | 50% | 23605 | 42.36 | 134704 | 7.42 |
| flat100 | 0% | 31634 | 31.61 | 122365 | 8.17 |
| flat50 | 100% | 50775 | 19.69 | 418496 | 2.39 |
| flat50 | 90% | 52547 | 19.03 | 402678 | 2.48 |
| flat50 | 50% | 60770 | 16.46 | 380401 | 2.63 |
| flat50 | 0% | 71883 | 13.91 | 337803 | 2.96 |
| flat500 | 100% | 2163 | 462.23 | 6871 | 145.53 |
| flat500 | 90% | 2125 | 470.50 | 6412 | 155.95 |
| flat500 | 50% | 2107 | 474.56 | 5418 | 184.57 |
| flat500 | 0% | 2168 | 461.29 | 4864 | 205.58 |
| nested50x10 | 100% | 3615 | 276.59 | 27960 | 35.77 |
| nested50x10 | 90% | 3740 | 267.40 | 27648 | 36.17 |
| nested50x10 | 50% | 4096 | 244.11 | 26081 | 38.34 |
| nested50x10 | 0% | 2744 | 364.37 | 23544 | 42.47 |
| string | 100% | 3788635 | 0.26 | 78049451 | 0.01 |
| string | 90% | 3074847 | 0.33 | 77440079 | 0.01 |
| string | 50% | 1447211 | 0.69 | 66100240 | 0.02 |
| string | 0% | 840503 | 1.19 | 49820139 | 0.02 |
Interpretation:
- Seal parsing includes Zod validation, snapshot allocation, key computation, interning, and live-hit collision comparison.
- Structured values cost more as descriptor access, property definition, allocation, and freezing increase with graph size.
- Plain Zod structured cases use field-level `z.object` schemas that match the generated benchmark object layouts.
- In the first 0.4.1 optimization, descriptor reads and per-property definition dominated sorting. After that change, comparator-based canonical sorting became the largest avoidable `snapshotData` cost for plain objects.
- The final 0.4.1 path partitions array-index keys from string keys before sorting, so array-index checks are computed once per key instead of once per comparison.
- No performance threshold is attached to 0.4.1.
