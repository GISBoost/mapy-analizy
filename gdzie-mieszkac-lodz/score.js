// Scoring engine (PRD 5.5): hard requirements -> weighted soft criteria -> minimum score.
// Pure functions, no DOM, so the same file runs in the browser and in `node score.test.js`.
// Arrays are per-hex (index = hex_id); NaN means "no data" (neither far nor near: criterion skipped, O9).
(function (root) {
  "use strict";

  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lin = (v, full, zero) => clamp01((zero - v) / (zero - full)); // 1 at <= full, 0 at >= zero

  // ---- curves (config = web/config.json -> curves) ----
  function travelScore(t, idealMin, maxMin) {
    if (!(t <= maxMin)) return 0;              // unreached / above the limit
    return t <= idealMin ? 1 : lin(t, idealMin, maxMin);
  }
  function tramScore(d, c) {                   // d in metres; NaN (> 2 km) counts as "far"
    if (Number.isNaN(d)) return 0;
    const [lo, hi] = c.ideal_m;
    if (d < lo) return c.near_zero_score + (1 - c.near_zero_score) * (d / lo);
    if (d <= hi) return 1;
    return lin(d, hi, c.zero_at_m);
  }
  const busScore = (d, c) => (Number.isNaN(d) ? 0 : lin(d, c.full_m, c.zero_at_m));
  const greenScore = (d, c) => (Number.isNaN(d) ? 0 : lin(d, c.full_m, c.zero_at_m));
  const serviceScore = (n, x) => (Number.isNaN(n) ? NaN : x > 0 ? Math.min(1, n / x) : 1);   // NaN = no data (skipped)
  const freqScore = (f, c) => 1 - Math.exp(-f / c.scale_per_h);
  const canopyScore = (share, c) => (Number.isNaN(share) ? NaN : clamp01(share / c.full_share));   // rising, saturating at full_share; NaN = no data

  // Graded noise penalty (0..1) from the stored "share of hex area at/above step" columns. Input: shares at the
  // comfort limit L, L+5 and L+10 dB (NaN = step below the lowest level the noise map reports; a missing step
  // takes the next higher available share, i.e. a lower bound, and all NaN = no data). A cell in [L, L+5) costs
  // 1/3, in [L+5, L+10) 2/3 and at >= L+10 the full 1, so 80 dB is worse than 61 dB (a single threshold cannot say that).
  function noisePenalty(shares) {
    let next = NaN; const f = shares.slice();
    for (let k = f.length - 1; k >= 0; k--) { if (Number.isNaN(f[k])) f[k] = next; else next = f[k]; }
    if (Number.isNaN(f[0])) return NaN;
    for (let k = 1; k < f.length; k++) if (Number.isNaN(f[k])) f[k] = 0;   // above the highest reported level: nothing there
    return f.reduce((a, b) => a + b, 0) / f.length;
  }

  // ---- main ----
  // inputs: {
  //   n, curves, weights{tram_stop,bus_stop,frequency,green,noise_road,noise_rail,noise_industry,price},
  //   targets: [{times: Uint8Array|Array (minutes per hex, 255 = not reached), idealMin, maxMin, weight, hard}],
  //   layers: {tram_m, bus_m, green_m, freq, noise_road, noise_rail, noise_industry (soft share), hard_road, hard_rail,
  //            hard_industry (hard-limit share)}   // Float32Array each
  //   hardNoise: {road:bool, rail:bool, industry:bool}, canopyHard: {on:bool, min:0..1} (layers.canopy = share of hex area under canopy), minScore
  // }
  // returns {score: Float32Array (NaN = filtered out), status: Uint8Array (0 ok, 1 hard-fail, 2 below min, 3 no criteria),
  //          contrib(i) -> [{key, score, weight}] for the "why" card}
  function compute(inp) {
    const n = inp.n, c = inp.curves, w = inp.weights, L = inp.layers;
    const score = new Float32Array(n), status = new Uint8Array(n);
    const soft = (i) => {
      const out = [];
      const add = (key, s, wt) => { if (wt > 0 && !Number.isNaN(s)) out.push({ key, score: s, weight: wt }); };
      add("tram_stop", tramScore(L.tram_m[i], c.tram_stop), w.tram_stop);
      add("bus_stop", busScore(L.bus_m[i], c.bus_stop), w.bus_stop);
      add("frequency", freqScore(L.freq[i], c.frequency), w.frequency);
      add("green", greenScore(L.green_m[i], c.green), w.green);
      if (c.canopy && L.canopy) add("canopy", canopyScore(L.canopy[i], c.canopy), w.canopy);
      for (const k of ["road", "rail", "industry"]) add("noise_" + k, 1 - L["noise_" + k][i], w["noise_" + k]); // L.noise_* = penalty 0..1
      if (inp.svc) for (const k of Object.keys(inp.svc)) {   // daily services: at least X facilities within Y min (saturating)
        const sv = inp.svc[k]; add("svc_" + k, serviceScore(sv.count[i], sv.x), w["svc_" + k]);
      }
      if (c.price.enabled && L.price_score) add("price", L.price_score[i], w.price);
      inp.targets.forEach((tg, k) => {
        if (!tg.hard && tg.weight > 0) add("target" + k, travelScore(tg.times[i] === 255 ? Infinity : tg.times[i], tg.idealMin, tg.maxMin), tg.weight);
      });
      return out;
    };
    for (let i = 0; i < n; i++) {
      let fail = false;
      for (const tg of inp.targets) if (tg.hard && !(tg.times[i] <= tg.maxMin)) fail = true;
      for (const k of ["road", "rail", "industry"]) if (inp.hardNoise[k] && L["hard_" + k][i] > (inp.hardShare ? inp.hardShare[k] : c.noise[k].hard_max_share)) fail = true;
      if (inp.canopyHard && inp.canopyHard.on && L.canopy && L.canopy[i] < inp.canopyHard.min) fail = true;   // NaN (no data) passes
      if (inp.svc) for (const k of Object.keys(inp.svc)) { const sv = inp.svc[k]; if (sv.hard && !Number.isNaN(sv.count[i]) && !(sv.count[i] >= sv.x)) fail = true; }
      if (fail) { score[i] = NaN; status[i] = 1; continue; }
      let sw = 0, ss = 0;
      for (const o of soft(i)) { sw += o.weight; ss += o.weight * o.score; }
      if (sw === 0) { score[i] = NaN; status[i] = 3; continue; }
      const s = (100 * ss) / sw;
      if (s < inp.minScore) { score[i] = NaN; status[i] = 2; continue; }
      score[i] = s;
    }
    return { score, status, contrib: soft };
  }

  const api = { travelScore, tramScore, busScore, greenScore, freqScore, noisePenalty, serviceScore, canopyScore, compute };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Score = api;
})(typeof window !== "undefined" ? window : globalThis);
