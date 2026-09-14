# Snapshotting benchmark interpretation
Evidence label: `v041-optimized`.
Measured 7 planned fresh-process repetitions per throughput case.
Primary results are elapsed time, throughput, heap delta, and RSS delta from non-GC-observed timing workers.
Retained-heap diagnostics are recorded separately in `gc-diagnostics.json` after explicit GC opportunities.
| shape | live-hit ratio | seal ops/s | plain Zod ops/s | seal/Zod elapsed |
| --- | ---: | ---: | ---: | ---: |
| flat100 | 100% | 31528 | 10937516 | 346.91x |
| flat100 | 90% | 32121 | 9493472 | 295.55x |
| flat100 | 50% | 34668 | 6185074 | 178.41x |
| flat100 | 0% | 38612 | 4240279 | 109.82x |
| flat50 | 100% | 58223 | 11687210 | 200.73x |
| flat50 | 90% | 58950 | 9565524 | 162.27x |
| flat50 | 50% | 63845 | 6331718 | 99.17x |
| flat50 | 0% | 69829 | 4499104 | 64.43x |
| flat500 | 100% | 5013 | 9142354 | 1823.87x |
| flat500 | 90% | 5085 | 8092432 | 1591.40x |
| flat500 | 50% | 5447 | 4910151 | 901.47x |
| flat500 | 0% | 6160 | 3212237 | 521.44x |
| nested50x10 | 100% | 4526 | 9213327 | 2035.62x |
| nested50x10 | 90% | 4589 | 4550634 | 991.71x |
| nested50x10 | 50% | 5126 | 4010518 | 782.42x |
| nested50x10 | 0% | 3364 | 2670987 | 794.03x |
| string | 100% | 3836938 | 78767422 | 20.53x |
| string | 90% | 3204253 | 76815547 | 23.97x |
| string | 50% | 1535134 | 66203875 | 43.13x |
| string | 0% | 827311 | 50620132 | 61.19x |
Interpretation:
- Seal parsing includes Zod validation, snapshot allocation, key computation, interning, and live-hit collision comparison.
- Structured values cost more as descriptor access, property definition, allocation, and freezing increase with graph size.
- In the first 0.4.1 optimization, descriptor reads and per-property definition dominated sorting. After that change, comparator-based canonical sorting became the largest avoidable `snapshotData` cost for plain objects.
- The final 0.4.1 path partitions array-index keys from string keys before sorting, so array-index checks are computed once per key instead of once per comparison.
- No performance threshold is attached to 0.4.1.
