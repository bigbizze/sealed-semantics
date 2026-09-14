# Snapshotting benchmark interpretation
Evidence label: `v040`.
Measured 7 planned fresh-process repetitions per throughput case.
Primary results are elapsed time, throughput, heap delta, and RSS delta from non-GC-observed timing workers.
Retained-heap diagnostics are recorded separately in `gc-diagnostics.json` after explicit GC opportunities.
| shape | live-hit ratio | seal ops/s | plain Zod ops/s | seal/Zod elapsed |
| --- | ---: | ---: | ---: | ---: |
| flat100 | 100% | 11308 | 11142429 | 985.37x |
| flat100 | 90% | 11297 | 9027295 | 799.11x |
| flat100 | 50% | 12467 | 6098893 | 489.20x |
| flat100 | 0% | 13777 | 4342068 | 315.18x |
| flat50 | 100% | 27273 | 11574511 | 424.40x |
| flat50 | 90% | 27882 | 9394244 | 336.92x |
| flat50 | 50% | 28090 | 6366441 | 226.65x |
| flat50 | 0% | 30964 | 4666515 | 150.71x |
| flat500 | 100% | 1704 | 9713751 | 5701.27x |
| flat500 | 90% | 1729 | 7968512 | 4608.45x |
| flat500 | 50% | 1750 | 4994133 | 2853.42x |
| flat500 | 0% | 1846 | 3349939 | 1815.15x |
| nested50x10 | 100% | 2696 | 9306420 | 3452.01x |
| nested50x10 | 90% | 2735 | 6952270 | 2542.02x |
| nested50x10 | 50% | 2764 | 4054275 | 1466.92x |
| nested50x10 | 0% | 2967 | 2726792 | 919.08x |
| string | 100% | 4170749 | 78512693 | 18.82x |
| string | 90% | 3249719 | 77243268 | 23.77x |
| string | 50% | 1475467 | 65953429 | 44.70x |
| string | 0% | 815931 | 51649627 | 63.30x |
Interpretation:
- Seal parsing includes Zod validation, snapshot allocation, key computation, interning, and live-hit collision comparison.
- Structured values cost more as descriptor access, property definition, allocation, and freezing increase with graph size.
- In the first 0.4.1 optimization, descriptor reads and per-property definition dominated sorting. After that change, comparator-based canonical sorting became the largest avoidable `snapshotData` cost for plain objects.
- The final 0.4.1 path partitions array-index keys from string keys before sorting, so array-index checks are computed once per key instead of once per comparison.
- No performance threshold is attached to 0.4.1.
