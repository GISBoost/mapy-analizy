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
// noise penalty: shares at L, L+5, L+10. all 0 -> 0; 1,1,1 -> 1; 1,0,0 -> 1/3; NaN steps take the next higher share; all NaN -> NaN
assert.strictEqual(S.noisePenalty([0, 0, 0]), 0);
assert.strictEqual(S.noisePenalty([1, 1, 1]), 1);
assert.ok(Math.abs(S.noisePenalty([1, 0, 0]) - 1 / 3) < 1e-9);
assert.ok(Math.abs(S.noisePenalty([NaN, 0.6, 0.3]) - (0.6 + 0.6 + 0.3) / 3) < 1e-9);
assert.ok(Number.isNaN(S.noisePenalty([NaN, NaN, NaN])));
// custom hard share: 0.10 rejects a hex with 0.2 share that the config default (0.25) would keep
const rh = S.compute({ n: 1, curves, minScore: 0, weights: { tram_stop: 0, bus_stop: 1, frequency: 0, green: 0, noise_road: 0, noise_rail: 0, noise_industry: 0, price: 0 },
  targets: [], hardNoise: { road: true, rail: false, industry: false }, hardShare: { road: 0.1, rail: 0.25, industry: 0.25 },
  layers: { tram_m: L([0]), bus_m: L([100]), green_m: L([0]), freq: L([0]), noise_road: L([0]), noise_rail: L([0]), noise_industry: L([0]),
            hard_road: L([0.2]), hard_rail: L([0]), hard_industry: L([0]) } });
assert.ok(Number.isNaN(rh.score[0]) && rh.status[0] === 1);
// services: at least X within Y min -> min(1, n / X); NaN = no data; hard requirement count >= X
assert.strictEqual(S.serviceScore(0, 3), 0);
assert.ok(Math.abs(S.serviceScore(1, 3) - 1 / 3) < 1e-9);
assert.strictEqual(S.serviceScore(5, 3), 1);
assert.ok(Number.isNaN(S.serviceScore(NaN, 3)));
const rs = S.compute({ n: 3, curves, minScore: 0, weights: { tram_stop: 0, bus_stop: 0, frequency: 0, green: 0, noise_road: 0, noise_rail: 0, noise_industry: 0, price: 0, svc_pharmacy: 2 },
  targets: [], hardNoise: { road: false, rail: false, industry: false },
  svc: { pharmacy: { x: 2, hard: true, count: [0, 1, 4] } },
  layers: { tram_m: L([0, 0, 0]), bus_m: L([0, 0, 0]), green_m: L([0, 0, 0]), freq: L([0, 0, 0]), noise_road: L([0, 0, 0]), noise_rail: L([0, 0, 0]),
            noise_industry: L([0, 0, 0]), hard_road: L([0, 0, 0]), hard_rail: L([0, 0, 0]), hard_industry: L([0, 0, 0]) } });
assert.ok(Number.isNaN(rs.score[0]) && rs.status[0] === 1);            // 0 < X=2 fails the requirement
assert.ok(Number.isNaN(rs.score[1]) && rs.status[1] === 1);            // 1 < 2 fails too
assert.ok(Math.abs(rs.score[2] - 100) < 1e-6 && rs.status[2] === 0);   // 4 >= 2 passes, score 100
// hard requirement with no data (NaN) must not reject the hex
const rn = S.compute({ n: 1, curves, minScore: 0, weights: { tram_stop: 0, bus_stop: 1, frequency: 0, green: 0, noise_road: 0, noise_rail: 0, noise_industry: 0, price: 0 },
  targets: [], hardNoise: { road: false, rail: false, industry: false }, svc: { pharmacy: { x: 2, hard: true, count: [NaN] } },
  layers: { tram_m: L([0]), bus_m: L([100]), green_m: L([0]), freq: L([0]), noise_road: L([0]), noise_rail: L([0]), noise_industry: L([0]),
            hard_road: L([0]), hard_rail: L([0]), hard_industry: L([0]) } });
assert.strictEqual(rn.status[0], 0);
console.log("score.js OK");
