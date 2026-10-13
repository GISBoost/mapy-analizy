// Short share links: the filter state as a positional JSON array (no key names), deflated and base64url-encoded,
// in the hash as #z=... . pack/unpack convert between that array and the keyed object app.js has always written to
// #s= (so loadHash validates both formats the same way). New fields are only ever appended to the end of the array;
// a reader treats missing trailing items as "not set". Pure functions + Web Streams, so it runs in node for tests.
(function (root) {
  "use strict";
  const VERSION = 1;

  // ctx = { wkeys: weight keys in a fixed order, svc: service criteria, noise: noise sources, modes: target modes }
  function pack(s, ctx) {
    const bit = (v) => (v ? 1 : 0);
    return [VERSION, s.w, s.t, s.r, bit(s.l), s.d, bit(s.b),
      ctx.wkeys.map((k) => (s.wt && s.wt[k] != null ? +s.wt[k] : null)),
      ctx.noise.map((k) => bit(s.hn && s.hn[k])),
      ctx.noise.map((k) => { const c = s.nc && s.nc[k]; return c ? [c.soft, c.hard, c.share] : null; }),
      [bit(s.cn && s.cn.h), s.cn ? s.cn.m : null], bit(s.co),
      [bit(s.pr && s.pr.h), s.pr ? s.pr.m : null], bit(s.po),
      ctx.svc.map((k) => { const c = s.sv && s.sv[k]; return c ? [c.m, c.y, c.x, bit(c.h)] : null; }),
      s.ms, bit(s.sr),
      (s.tg || []).map((x) => [x.h, x.n, String(x.m || "").split(",").reduce((m, q) => m | (ctx.modes.includes(q) ? 1 << ctx.modes.indexOf(q) : 0), 0), x.x, x.i, x.w, bit(x.k)])];
  }

  function unpack(a, ctx) {
    if (!Array.isArray(a) || a[0] !== VERSION) throw new Error("unknown share link version");
    const arr = (v) => (Array.isArray(v) ? v : []);
    const obj = (keys, vals, f) => { const o = {}; keys.forEach((k, i) => { if (vals[i] != null) o[k] = f(vals[i]); }); return o; };
    const [, w, t, r, l, d, b, wt, hn, nc, cn, co, pr, po, sv, ms, sr, tg] = a;
    return {
      w, t, r, l, d, b, wt: obj(ctx.wkeys, arr(wt), (v) => v),
      hn: obj(ctx.noise, arr(hn), (v) => !!v),
      nc: obj(ctx.noise, arr(nc), (c) => ({ soft: arr(c)[0], hard: arr(c)[1], share: arr(c)[2] })),
      cn: cn ? { h: arr(cn)[0], m: arr(cn)[1] } : undefined, co,
      pr: pr ? { h: arr(pr)[0], m: arr(pr)[1] } : undefined, po,
      sv: obj(ctx.svc, arr(sv), (c) => ({ m: arr(c)[0], y: arr(c)[1], x: arr(c)[2], h: arr(c)[3] })),
      ms, sr,
      tg: arr(tg).map((x) => { x = arr(x); return { h: x[0], n: x[1], m: ctx.modes.filter((q, i) => x[2] & (1 << i)).join(","), x: x[3], i: x[4], w: x[5], k: x[6] }; }),
    };
  }

  // bytes <-> base64url (no padding); btoa/atob exist in browsers and node >= 16
  function toB64url(bytes) {
    let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromB64url(str) {
    const s = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  async function pipe(bytes, stream) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  }

  async function encode(s, ctx) {
    const json = new TextEncoder().encode(JSON.stringify(pack(s, ctx)));
    return toB64url(await pipe(json, new CompressionStream("deflate-raw")));
  }
  async function decode(str, ctx) {
    const json = await pipe(fromB64url(str), new DecompressionStream("deflate-raw"));
    return unpack(JSON.parse(new TextDecoder().decode(json)), ctx);
  }

  const api = { VERSION, pack, unpack, encode, decode };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Share = api;
})(typeof self !== "undefined" ? self : this);
