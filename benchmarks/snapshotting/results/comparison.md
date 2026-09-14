# Snapshotting benchmark comparison

- `v040`: 0.4.0 baseline rerun with the final full-profile harness.
- `v041-sort-only-partial`: diagnostic sort-only midpoint. It is partial evidence: one complete repetition plus part of a second, with no retained-heap diagnostics.
- `v041-optimized`: final 0.4.1 full-profile run with the snapshot hot-path optimization.

Median structured speedup, optimized 0.4.1 versus 0.4.0: 2.16x.
Median structured speedup, optimized 0.4.1 versus sort-only partial: 2.47x.

Sorting is not the main cost. The final improvement comes from avoiding whole-object descriptor maps and avoiding per-property `Object.defineProperty` on ordinary snapshot properties. Descriptor reads and per-property definition were the larger avoidable costs.

| shape | hit ratio | 0.4.0 seal ops/s | sort-only partial seal ops/s | optimized 0.4.1 seal ops/s | optimized vs 0.4.0 | optimized vs sort-only |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| flat100 | 100% | 11308 | 10193 | 27717 | 2.45x | 2.72x |
| flat100 | 90% | 11297 | 10197 | 27342 | 2.42x | 2.68x |
| flat100 | 50% | 12467 | 11538 | 29910 | 2.40x | 2.59x |
| flat100 | 0% | 13777 | 12443 | 32483 | 2.36x | 2.61x |
| flat50 | 100% | 27273 | 23431 | 50309 | 1.84x | 2.15x |
| flat50 | 90% | 27882 | 23949 | 51806 | 1.86x | 2.16x |
| flat50 | 50% | 28090 | 23662 | 55379 | 1.97x | 2.35x |
| flat50 | 0% | 30964 | 26320 | 60560 | 1.96x | 2.31x |
| flat500 | 100% | 1704 | 1675 | 4488 | 2.63x | 2.68x |
| flat500 | 90% | 1729 | 1673 | 4624 | 2.67x | 2.76x |
| flat500 | 50% | 1750 | 1652 | 5005 | 2.86x | 3.03x |
| flat500 | 0% | 1846 | 1655 | 5616 | 3.04x | 3.39x |
| nested50x10 | 100% | 2696 | 2069 | 3931 | 1.46x | 1.90x |
| nested50x10 | 90% | 2735 | 2048 | 3977 | 1.45x | 1.94x |
| nested50x10 | 50% | 2764 | 2055 | 4327 | 1.57x | 2.11x |
| nested50x10 | 0% | 2967 | 1662 | 2836 | 0.96x | 1.71x |
| string | 100% | 4170749 | 3028901 | 3612750 | 0.87x | 1.19x |
| string | 90% | 3249719 | 2687593 | 2636044 | 0.81x | 0.98x |
| string | 50% | 1475467 | 1321383 | 1259503 | 0.85x | 0.95x |
| string | 0% | 815931 | 703160 | 793985 | 0.97x | 1.13x |

No performance threshold or guarantee is attached to these measurements.
