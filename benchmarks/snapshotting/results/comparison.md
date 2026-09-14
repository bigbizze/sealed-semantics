# Snapshotting benchmark comparison

- `v040`: 0.4.0 baseline rerun with the final full-profile harness.
- `v041-sort-only-partial`: diagnostic sort-only midpoint. It is partial evidence: one complete repetition plus part of a second, with no retained-heap diagnostics.
- `v041-optimized`: final 0.4.1 full-profile run with descriptor/property-definition and partition-then-sort optimizations.

Median structured speedup, optimized 0.4.1 versus 0.4.0: 2.53x.
Median structured speedup, optimized 0.4.1 versus sort-only partial: 2.85x.

The first 0.4.1 optimization removed the costs that dominated the 0.4.0 path: whole-object descriptor maps and per-property `Object.defineProperty` on ordinary snapshot properties. After that change, comparator-based canonical sorting became the largest avoidable `snapshotData` cost for plain objects. The final 0.4.1 path partitions array-index keys from string keys before sorting, so array-index checks run once per key instead of once per comparison.

Targeted local measurements on Node 22.23.2:

- `canonicalKeys`-style ordering, 50 keys: old comparator 11.76 us, new partition 3.31 us.
- `canonicalKeys`-style ordering, 500 keys: old comparator 69.47 us, new partition 22.32 us.
- `snapshotData`-style flat object, 50 properties: before 20.62 us, after 11.59 us.
- `snapshotData`-style flat object, 200 properties: before 61.79 us, after 40.43 us.

| shape | hit ratio | 0.4.0 seal ops/s | sort-only partial seal ops/s | optimized 0.4.1 seal ops/s | optimized vs 0.4.0 | optimized vs sort-only |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| flat100 | 100% | 11308 | 10193 | 31528 | 2.79x | 3.09x |
| flat100 | 90% | 11297 | 10197 | 32121 | 2.84x | 3.15x |
| flat100 | 50% | 12467 | 11538 | 34668 | 2.78x | 3.00x |
| flat100 | 0% | 13777 | 12443 | 38612 | 2.80x | 3.10x |
| flat50 | 100% | 27273 | 23431 | 58223 | 2.13x | 2.48x |
| flat50 | 90% | 27882 | 23949 | 58950 | 2.11x | 2.46x |
| flat50 | 50% | 28090 | 23662 | 63845 | 2.27x | 2.70x |
| flat50 | 0% | 30964 | 26320 | 69829 | 2.26x | 2.65x |
| flat500 | 100% | 1704 | 1675 | 5013 | 2.94x | 2.99x |
| flat500 | 90% | 1729 | 1673 | 5085 | 2.94x | 3.04x |
| flat500 | 50% | 1750 | 1652 | 5447 | 3.11x | 3.30x |
| flat500 | 0% | 1846 | 1655 | 6160 | 3.34x | 3.72x |
| nested50x10 | 100% | 2696 | 2069 | 4526 | 1.68x | 2.19x |
| nested50x10 | 90% | 2735 | 2048 | 4589 | 1.68x | 2.24x |
| nested50x10 | 50% | 2764 | 2055 | 5126 | 1.85x | 2.49x |
| nested50x10 | 0% | 2967 | 1662 | 3364 | 1.13x | 2.02x |
| string | 100% | 4170749 | 3028901 | 3836938 | 0.92x | 1.27x |
| string | 90% | 3249719 | 2687593 | 3204253 | 0.99x | 1.19x |
| string | 50% | 1475467 | 1321383 | 1535134 | 1.04x | 1.16x |
| string | 0% | 815931 | 703160 | 827311 | 1.01x | 1.18x |

No performance threshold or guarantee is attached to these measurements.
