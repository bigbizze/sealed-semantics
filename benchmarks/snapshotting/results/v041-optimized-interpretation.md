# Snapshotting benchmark interpretation
Evidence label: `v041-optimized`.
Measured 7 planned fresh-process repetitions per throughput case.
Primary results are elapsed time, throughput, heap delta, and RSS delta from non-GC-observed timing workers.
Retained-heap diagnostics are recorded separately in `gc-diagnostics.json` after explicit GC opportunities.
| shape | live-hit ratio | seal ops/s | plain Zod ops/s | seal/Zod elapsed |
| --- | ---: | ---: | ---: | ---: |
| flat100 | 100% | 27717 | 10517970 | 379.48x |
| flat100 | 90% | 27342 | 8904750 | 325.69x |
| flat100 | 50% | 29910 | 5753921 | 192.37x |
| flat100 | 0% | 32483 | 4119036 | 126.80x |
| flat50 | 100% | 50309 | 11212454 | 222.87x |
| flat50 | 90% | 51806 | 8780015 | 169.48x |
| flat50 | 50% | 55379 | 5722794 | 103.34x |
| flat50 | 0% | 60560 | 4182328 | 69.06x |
| flat500 | 100% | 4488 | 9584815 | 2135.84x |
| flat500 | 90% | 4624 | 7118163 | 1539.31x |
| flat500 | 50% | 5005 | 4623245 | 923.77x |
| flat500 | 0% | 5616 | 3064042 | 545.55x |
| nested50x10 | 100% | 3931 | 8652613 | 2200.90x |
| nested50x10 | 90% | 3977 | 4291766 | 1079.18x |
| nested50x10 | 50% | 4327 | 3815709 | 881.74x |
| nested50x10 | 0% | 2836 | 2580346 | 909.77x |
| string | 100% | 3612750 | 74492412 | 20.62x |
| string | 90% | 2636044 | 70766120 | 26.85x |
| string | 50% | 1259503 | 56056596 | 44.51x |
| string | 0% | 793985 | 47482416 | 59.80x |
Interpretation:
- Seal parsing includes Zod validation, snapshot allocation, key computation, interning, and live-hit collision comparison.
- Structured values cost more as descriptor access, property definition, allocation, and freezing increase with graph size.
- 0.4.1 includes a measured snapshot hot-path optimization. Sorting alone was not the main cost; descriptor reads and per-property definition were the larger avoidable costs.
- No performance threshold is attached to 0.4.1.
