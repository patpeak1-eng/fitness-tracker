// 7-day exponential moving average for nutrition/weight trend smoothing.
// Spec: docs/nutrition_spec_s18.md Section 5 — deliberately this simple.
//
// Pure function, no React/context/date dependencies: callers collapse their
// data to one number per calendar day (null for days with no data) and get
// back a same-length smoothed series.

export const EMA_ALPHA = 2 / (7 + 1); // 0.25, standard 7-day EMA

// series: Array<number | null | undefined> — one slot per day, in order.
// Returns Array<number | null> of the same length:
//   - first real value seeds the EMA (ema[0] = series[0])
//   - ema[i] = alpha * x + (1 - alpha) * ema[i-1]
//   - gap days (null/undefined/NaN) carry the previous EMA forward
//   - leading gaps (before any real value) stay null
export function ema(series, alpha = EMA_ALPHA) {
    const out = new Array(series.length).fill(null);
    let prev = null;
    for (let i = 0; i < series.length; i++) {
        const x = series[i];
        if (x === null || x === undefined || Number.isNaN(x)) {
            out[i] = prev; // gap: carry forward, never reset
        } else if (prev === null) {
            prev = x;      // seed on the first real value
            out[i] = x;
        } else {
            prev = alpha * x + (1 - alpha) * prev;
            out[i] = prev;
        }
    }
    return out;
}
