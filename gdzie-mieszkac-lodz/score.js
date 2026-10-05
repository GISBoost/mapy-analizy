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
  const freqScore = (f, c) => 1 - Math.exp(-f / c.scale_per_h);

  // ---- main ----
  // inputs: {
  //   n, curves, weights{tram_stop,bus_stop,frequency,green,noise_road,noise_rail,noise_industry,price},
  //   targets: [{times: Uint8Array|Array (minutes per hex, 255 = not reached), idealMin, maxMin, weight, hard}],
  //   layers: {tram_m, bus_m, green_m, freq, noise_road, noise_rail, noise_industry (soft share), hard_road, hard_rail,
  //            hard_industry (hard-limit share)}   // Float32Array each
  //   hardNoise: {road:bool, rail:bool, industry:bool}, minScore
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
      for (const k of ["road", "rail", "industry"]) add("noise_" + k, 1 - L["noise_" + k][i], w["noise_" + k]);
      if (c.price.enabled && L.price_score) add("price", L.price_score[i], w.price);
      inp.targets.forEach((tg, k) => {
        if (!tg.hard && tg.weight > 0) add("target" + k, travelScore(tg.times[i] === 255 ? Infinity : tg.times[i], tg.idealMin, tg.maxMin), tg.weight);
      });
      return out;
    };
    for (let i = 0; i < n; i++) {
      let fail = false;
      for (const tg of inp.targets) if (tg.hard && !(tg.times[i] <= tg.maxMin)) fail = true;
      for (const k of ["road", "rail", "industry"]) if (inp.hardNoise[k] && L["hard_" + k][i] > c.noise[k].hard_max_share) fail = true;
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

  const api = { travelScore, tramScore, busScore, greenScore, freqScore, compute };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Score = api;
})(typeof window !== "undefined" ? window : globalThis);
