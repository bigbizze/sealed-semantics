# Snapshotting benchmark interpretation
Evidence label: `v041-pre-partition`.
Measured 7 planned fresh-process repetitions per throughput case.
Primary results are elapsed time, throughput, heap delta, and RSS delta from non-GC-observed timing workers.
Retained-heap diagnostics are recorded separately in `gc-diagnostics.json` after explicit GC opportunities.
| shape | live-hit ratio | seal ops/s | seal us/op | plain Zod ops/s | plain Zod us/op |
| --- | ---: | ---: | ---: | ---: | ---: |
| flat100 | 100% | 18444 | 54.22 | 140468 | 7.12 |
| flat100 | 90% | 18719 | 53.42 | 137549 | 7.27 |
| flat100 | 50% | 21715 | 46.05 | 131014 | 7.63 |
| flat100 | 0% | 27841 | 35.92 | 120405 | 8.31 |
| flat50 | 100% | 47110 | 21.23 | 396124 | 2.52 |
| flat50 | 90% | 47018 | 21.27 | 398214 | 2.51 |
| flat50 | 50% | 54600 | 18.31 | 380255 | 2.63 |
| flat50 | 0% | 64207 | 15.57 | 348496 | 2.87 |
| flat500 | 100% | 2090 | 478.51 | 6888 | 145.17 |
| flat500 | 90% | 2089 | 478.66 | 6686 | 149.57 |
| flat500 | 50% | 2050 | 487.88 | 5667 | 176.47 |
| flat500 | 0% | 2002 | 499.56 | 4497 | 222.38 |
| nested50x10 | 100% | 3348 | 298.66 | 27113 | 36.88 |
| nested50x10 | 90% | 3287 | 304.26 | 26820 | 37.29 |
| nested50x10 | 50% | 3741 | 267.30 | 25055 | 39.91 |
| nested50x10 | 0% | 2590 | 386.13 | 23435 | 42.67 |
| string | 100% | 3777712 | 0.26 | 78624932 | 0.01 |
| string | 90% | 3137832 | 0.32 | 75208915 | 0.01 |
| string | 50% | 1470025 | 0.68 | 63128380 | 0.02 |
| string | 0% | 810723 | 1.23 | 50921651 | 0.02 |
Interpretation:
- Seal parsing includes Zod validation, snapshot allocation, key computation, interning, and live-hit collision comparison.
- Structured values cost more as descriptor access, property definition, allocation, and freezing increase with graph size.
- Plain Zod structured cases use field-level `z.object` schemas that match the generated benchmark object layouts.
- In the first 0.4.1 optimization, descriptor reads and per-property definition dominated sorting. After that change, comparator-based canonical sorting became the largest avoidable `snapshotData` cost for plain objects.
- The final 0.4.1 path partitions array-index keys from string keys before sorting, so array-index checks are computed once per key instead of once per comparison.
- No performance threshold is attached to 0.4.1.
