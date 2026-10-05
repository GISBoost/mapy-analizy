// node score.test.js -- hand-computed expectations (PRD 9: score reproducible by hand for a chosen hex).
const S = require("./score.js");
const assert = require("assert");
const curves = {
  tram_stop: { near_zero_score: 0.6, ideal_m: [150, 400], zero_at_m: 1200 },
  bus_stop: { full_m: 150, zero_at_m: 800 }, frequency: { scale_per_h: 12 }, green: { full_m: 200, zero_at_m: 1000 },
  noise: { road: { hard_max_share: 0.25 }, rail: { hard_max_share: 0.25 }, industry: { hard_max_share: 0.25 } },
  price: { enabled: false },
};
// travel: ideal 10, max 40; 25 min -> 0.5; 41 -> 0; 5 -> 1
assert.strictEqual(S.travelScore(25, 10, 40), 0.5);
assert.strictEqual(S.travelScore(41, 10, 40), 0);
assert.strictEqual(S.travelScore(5, 10, 40), 1);
// tram band: 0 m -> 0.6, 75 m -> 0.8, 300 m -> 1, 800 m -> 0.5, NaN -> 0
assert.strictEqual(S.tramScore(0, curves.tram_stop), 0.6);
assert.ok(Math.abs(S.tramScore(75, curves.tram_stop) - 0.8) < 1e-9);
assert.strictEqual(S.tramScore(300, curves.tram_stop), 1);
assert.strictEqual(S.tramScore(800, curves.tram_stop), 0.5);
assert.strictEqual(S.tramScore(NaN, curves.tram_stop), 0);
// full pipeline on 3 hexes: hex0 ok, hex1 fails hard target (60 min > 40), hex2 below min score
const L = (a) => Float32Array.from(a);
const r = S.compute({
  n: 3, curves, minScore: 50,
  weights: { tram_stop: 0, bus_stop: 2, frequency: 0, green: 2, noise_road: 0, noise_rail: 0, noise_industry: 0, price: 0 },
  targets: [{ times: [25, 60, 25], idealMin: 10, maxMin: 40, weight: 4, hard: false },
            { times: [10, 10, 10], idealMin: 10, maxMin: 40, weight: 0, hard: true }],
  hardNoise: { road: false, rail: false, industry: false },
  layers: { tram_m: L([0, 0, 0]), bus_m: L([150, 150, 800]), green_m: L([200, 200, 1000]), freq: L([0, 0, 0]),
            noise_road: L([0, 0, 0]), noise_rail: L([0, 0, 0]), noise_industry: L([0, 0, 0]),
            hard_road: L([0, 0, 0]), hard_rail: L([0, 0, 0]), hard_industry: L([0, 0, 0]) },
});
// hex0: target 0.5*w4 + bus 1*w2 + green 1*w2 = 6 / 8 = 75
assert.ok(Math.abs(r.score[0] - 75) < 1e-4, r.score[0]);
assert.ok(Number.isNaN(r.score[1]) && r.status[1] === 0 || r.status[1] === 0); // soft target 60>max -> score 0, not hard
// hex1: target score 0 (60 > 40) w4, bus 1 w2, green 1 w2 -> 4/8 = 50 -> kept (>= 50)
assert.ok(Math.abs(r.score[1] - 50) < 1e-4, r.score[1]);
// hex2: target 0.5*4 + bus 0 + green 0 = 2/8 = 25 < 50 -> filtered, status 2
assert.ok(Number.isNaN(r.score[2]) && r.status[2] === 2);
console.log("score.js OK");
