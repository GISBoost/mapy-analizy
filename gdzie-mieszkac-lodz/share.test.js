// node share.test.js -- share links (#z=): round trip, length, old #s= links, broken links.
const S = require("./share.js");
const assert = require("assert");

const ctx = {
  wkeys: ["tram_stop", "bus_stop", "frequency", "green", "canopy", "price", "noise_road", "noise_rail", "noise_industry",
          "svc_edukacja", "svc_zdrowie", "svc_handel_uslugi", "svc_kultura_rekreacja", "offer"],
  svc: ["edukacja", "zdrowie", "handel_uslugi", "kultura_rekreacja"], noise: ["road", "rail", "industry"],
  modes: ["transit", "walk", "bike", "car"],
};
const BASE = "https://gisboost.github.io/mapy-analizy/gdzie-mieszkac-lodz/";

// what app.js snapshot() writes; hn holds booleans, everything else 0/1
const heavy = {
  w: "evening", t: "p85", r: "max1transfer", l: 1, d: "from", b: 1,
  wt: { tram_stop: 3, bus_stop: 1, frequency: 4, green: 5, canopy: 3, price: 4, noise_road: 4, noise_rail: 1, noise_industry: 2,
        svc_edukacja: 3, svc_zdrowie: 2, svc_handel_uslugi: 4, svc_kultura_rekreacja: 1, offer: 2 },
  hn: { road: true, rail: false, industry: true },
  nc: { road: { soft: 55, hard: 70, share: 10 }, rail: { soft: 65, hard: 70, share: 40 }, industry: { soft: 60, hard: 65, share: 5 } },
  cn: { h: 1, m: 25 }, co: 1, pr: { h: 1, m: 9500 }, po: 1,
  sv: { edukacja: { m: "bike", y: 10, x: 3, h: 1 }, zdrowie: { m: "transit", y: 20, x: 1, h: 0 },
        handel_uslugi: { m: "walk", y: 10, x: 5, h: 0 }, kultura_rekreacja: { m: "transit", y: 30, x: 2, h: 0 } },
  ms: 40, sr: 1,
  tg: [{ h: 2345, n: "Praca", m: "transit,bike", x: 45, i: 10, w: 3, k: 0 },
       { h: 1234, n: "Uczelnia PŁ — Żeromskiego", m: "transit", x: 40, i: 15, w: 4, k: 1 },
       { h: 4321, n: "Rodzice", m: "car", x: 30, i: 10, w: 2, k: 0 },
       { h: 0, n: "Szkoła \"Ósemka\" & co.", m: "walk,bike", x: 20, i: 10, w: 0, k: 0 },
       { h: 5661, n: "", m: "transit,walk,bike,car", x: 90, i: 5, w: 5, k: 1 }],
  of: { h: 1, m: 11000 }, oo: 1, op: 1,
};

(async () => {
  // 1. pack/unpack is lossless for a full state
  assert.deepStrictEqual(S.unpack(JSON.parse(JSON.stringify(S.pack(heavy, ctx))), ctx), heavy);

  // 2. encode/decode round trip; the code uses only URL-safe characters
  const z = await S.encode(heavy, ctx);
  assert.match(z, /^[A-Za-z0-9_-]+$/);
  assert.deepStrictEqual(await S.decode(z, ctx), heavy);

  // 3. random states (incl. Polish letters and emoji in target names) survive the round trip
  let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const pick = (a) => a[rnd(a.length)];
  for (let it = 0; it < 300; it++) {
    const s = JSON.parse(JSON.stringify(heavy));
    ctx.wkeys.forEach((k) => { s.wt[k] = rnd(6); });
    ctx.noise.forEach((k) => { s.hn[k] = !!rnd(2); s.nc[k] = { soft: pick([55, 60, 65]), hard: pick([60, 65, 70, 75]), share: rnd(101) }; });
    s.w = pick(["morning", "evening", "weekend"]); s.ms = 5 * rnd(20); s.sr = rnd(2); s.l = rnd(2);
    s.tg = Array.from({ length: rnd(6) }, () => ({ h: rnd(5662), n: pick(["Łódź Kaliska", "Ąę ółż", "x", "", "🏠 dom", "a/b?c#d=e&f"]),
      m: ctx.modes.filter(() => rnd(2)).join(","), x: 5 + rnd(86), i: rnd(30), w: rnd(6), k: rnd(2) }));
    assert.deepStrictEqual(await S.decode(await S.encode(s, ctx), ctx), s);
  }

  // 4. length: the full link with 5 targets is far shorter than the old #s= link
  const oldUrl = BASE + "#s=" + encodeURIComponent(JSON.stringify(heavy));
  const newUrl = BASE + "#z=" + z;
  assert.ok(newUrl.length < 450 && newUrl.length < oldUrl.length / 4, newUrl.length + " vs " + oldUrl.length);
  const none = BASE + "#z=" + await S.encode(Object.assign({}, heavy, { tg: [] }), ctx);

  // 5. an older link that has fewer fields (array cut after the weights) still decodes; missing parts are undefined
  const short = S.unpack(S.pack(heavy, ctx).slice(0, 8), ctx);
  assert.strictEqual(short.w, "evening"); assert.strictEqual(short.wt.green, 5);
  assert.deepStrictEqual(short.tg, []); assert.strictEqual(short.cn, undefined); assert.strictEqual(short.ms, undefined);
  // a link from before the asking-price fields (array ends with the targets, weights without "offer") keeps them unset
  const pre = S.pack(heavy, ctx).slice(0, 18); pre[7] = pre[7].slice(0, -1);
  const old = S.unpack(pre, ctx);
  assert.strictEqual(old.of, undefined); assert.strictEqual(old.oo, undefined); assert.ok(!("offer" in old.wt)); assert.strictEqual(old.tg.length, 5);

  // 6. a weight key added later (not in the link) is simply absent, so app.js keeps its default
  const ctx2 = Object.assign({}, ctx, { wkeys: ctx.wkeys.concat(["new_criterion"]) });
  assert.ok(!("new_criterion" in (await S.decode(z, ctx2)).wt));

  // 7. broken links reject (app.js catches and ignores them): cut, garbage, wrong version, not JSON
  for (const bad of [z.slice(0, 20), "abc", "!!!!", ""]) await assert.rejects(S.decode(bad, ctx));
  assert.throws(() => S.unpack([2, "morning"], ctx));
  assert.throws(() => S.unpack({ w: "morning" }, ctx));

  console.log("share.test.js: ok; link with 5 targets " + newUrl.length + " chars (old format " + oldUrl.length +
    "), without targets " + none.length);
})().catch((e) => { console.error(e); process.exit(1); });
