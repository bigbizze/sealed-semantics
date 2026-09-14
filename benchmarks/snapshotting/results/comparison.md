# Snapshotting benchmark comparison

- `v040`: 0.4.0 baseline rerun with the corrected field-level Zod full-profile harness.
- `v041-sort-only-partial`: preserved diagnostic sort-only midpoint from the earlier shape-check harness; not used for current seal/Zod comparison.
- `v041-pre-partition`: 0.4.1 PR state before partition-then-sort, rerun with the corrected field-level Zod full-profile harness.
- `v041-optimized`: final 0.4.1 full-profile run with descriptor/property-definition and partition-then-sort optimizations, using the corrected field-level Zod harness.

Median structured speedup, optimized 0.4.1 versus 0.4.0: 1.88x.
Median structured speedup, optimized 0.4.1 versus pre-partition 0.4.1: 1.08x.

The benchmark now compares seal parsing with field-level `z.object` schemas that match the generated flat and nested object layouts. The earlier preserved sort-only partial evidence used the previous shape-check baseline and remains only diagnostic.

The first 0.4.1 optimization removed the costs that dominated the 0.4.0 path: whole-object descriptor maps and per-property `Object.defineProperty` on ordinary snapshot properties. After that change, comparator-based canonical sorting became the largest avoidable `snapshotData` cost for plain objects. The final 0.4.1 path partitions array-index keys from string keys before sorting, so array-index checks run once per key instead of once per comparison.

Targeted local measurements on Node 22.23.2:

- `canonicalKeys`-style ordering, 50 keys: old comparator 11.76 us, new partition 3.31 us.
- `canonicalKeys`-style ordering, 500 keys: old comparator 69.47 us, new partition 22.32 us.
- `snapshotData`-style flat object, 50 properties: before 20.62 us, after 11.59 us.
- `snapshotData`-style flat object, 200 properties: before 61.79 us, after 40.43 us.

| shape | hit ratio | 0.4.0 seal ops/s | pre-partition seal ops/s | optimized seal ops/s | optimized us/op | plain Zod us/op | optimized vs 0.4.0 | optimized vs pre-partition |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| flat100 | 100% | 10009 | 18444 | 19604 | 51.01 | 7.17 | 1.96x | 1.06x |
| flat100 | 90% | 9883 | 18719 | 20070 | 49.83 | 7.05 | 2.03x | 1.07x |
| flat100 | 50% | 10697 | 21715 | 23605 | 42.36 | 7.42 | 2.21x | 1.09x |
| flat100 | 0% | 11765 | 27841 | 31634 | 31.61 | 8.17 | 2.69x | 1.14x |
| flat50 | 100% | 24603 | 47110 | 50775 | 19.69 | 2.39 | 2.06x | 1.08x |
| flat50 | 90% | 25184 | 47018 | 52547 | 19.03 | 2.48 | 2.09x | 1.12x |
| flat50 | 50% | 25840 | 54600 | 60770 | 16.46 | 2.63 | 2.35x | 1.11x |
| flat50 | 0% | 27335 | 64207 | 71883 | 13.91 | 2.96 | 2.63x | 1.12x |
| flat500 | 100% | 1314 | 2090 | 2163 | 462.23 | 145.53 | 1.65x | 1.04x |
| flat500 | 90% | 1290 | 2089 | 2125 | 470.50 | 155.95 | 1.65x | 1.02x |
| flat500 | 50% | 1225 | 2050 | 2107 | 474.56 | 184.57 | 1.72x | 1.03x |
| flat500 | 0% | 1197 | 2002 | 2168 | 461.29 | 205.58 | 1.81x | 1.08x |
| nested50x10 | 100% | 2413 | 3348 | 3615 | 276.59 | 35.77 | 1.50x | 1.08x |
| nested50x10 | 90% | 2409 | 3287 | 3740 | 267.40 | 36.17 | 1.55x | 1.14x |
| nested50x10 | 50% | 2451 | 3741 | 4096 | 244.11 | 38.34 | 1.67x | 1.10x |
| nested50x10 | 0% | 2550 | 2590 | 2744 | 364.37 | 42.47 | 1.08x | 1.06x |
| string | 100% | 3951017 | 3777712 | 3788635 | 0.26 | 0.01 | 0.96x | 1.00x |
| string | 90% | 3348686 | 3137832 | 3074847 | 0.33 | 0.01 | 0.92x | 0.98x |
| string | 50% | 1454094 | 1470025 | 1447211 | 0.69 | 0.02 | 1.00x | 0.98x |
| string | 0% | 783601 | 810723 | 840503 | 1.19 | 0.02 | 1.07x | 1.04x |

No performance threshold or guarantee is attached to these measurements.
