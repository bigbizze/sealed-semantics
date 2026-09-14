# Snapshotting benchmark interpretation
Evidence label: `v040`.
Measured 7 planned fresh-process repetitions per throughput case.
Primary results are elapsed time, throughput, heap delta, and RSS delta from non-GC-observed timing workers.
Retained-heap diagnostics are recorded separately in `gc-diagnostics.json` after explicit GC opportunities.
| shape | live-hit ratio | seal ops/s | seal us/op | plain Zod ops/s | plain Zod us/op |
| --- | ---: | ---: | ---: | ---: | ---: |
| flat100 | 100% | 10009 | 99.91 | 136322 | 7.34 |
| flat100 | 90% | 9883 | 101.18 | 145428 | 6.88 |
| flat100 | 50% | 10697 | 93.49 | 135685 | 7.37 |
| flat100 | 0% | 11765 | 85.00 | 127776 | 7.83 |
| flat50 | 100% | 24603 | 40.65 | 413856 | 2.42 |
| flat50 | 90% | 25184 | 39.71 | 434101 | 2.30 |
| flat50 | 50% | 25840 | 38.70 | 387150 | 2.58 |
| flat50 | 0% | 27335 | 36.58 | 344059 | 2.91 |
| flat500 | 100% | 1314 | 760.92 | 7028 | 142.29 |
| flat500 | 90% | 1290 | 775.05 | 6685 | 149.60 |
| flat500 | 50% | 1225 | 816.02 | 5824 | 171.71 |
| flat500 | 0% | 1197 | 835.51 | 5059 | 197.68 |
| nested50x10 | 100% | 2413 | 414.36 | 28241 | 35.41 |
| nested50x10 | 90% | 2409 | 415.13 | 27810 | 35.96 |
| nested50x10 | 50% | 2451 | 407.97 | 26188 | 38.19 |
| nested50x10 | 0% | 2550 | 392.16 | 23431 | 42.68 |
| string | 100% | 3951017 | 0.25 | 77430041 | 0.01 |
| string | 90% | 3348686 | 0.30 | 77559783 | 0.01 |
| string | 50% | 1454094 | 0.69 | 63643871 | 0.02 |
| string | 0% | 783601 | 1.28 | 49369882 | 0.02 |
Interpretation:
- Seal parsing includes Zod validation, snapshot allocation, key computation, interning, and live-hit collision comparison.
- Structured values cost more as descriptor access, property definition, allocation, and freezing increase with graph size.
- Plain Zod structured cases use field-level `z.object` schemas that match the generated benchmark object layouts.
- In the first 0.4.1 optimization, descriptor reads and per-property definition dominated sorting. After that change, comparator-based canonical sorting became the largest avoidable `snapshotData` cost for plain objects.
- The final 0.4.1 path partitions array-index keys from string keys before sorting, so array-index checks are computed once per key instead of once per comparison.
- No performance threshold is attached to 0.4.1.
