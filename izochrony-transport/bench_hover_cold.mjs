"use strict";
// Phase-1 diagnosing-bugs loop: p95 hover → paint on a COLD origin.
// Red when p95 exceeds BUDGET_MS (dijkstra-like feel). Agent-runnable.
//
//   node izochrony-transport/bench_hover_cold.mjs
//   node izochrony-transport/bench_hover_cold.mjs --ttfb=150
//
// --ttfb=N adds N ms before each first .pbf fetch (GitHub Pages TTFB replica).
import { spawn } from "child_process";
import os from "os";
import path from "path";
import { setTimeout as sleep } from "timers/promises";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PAGE = process.env.ISO_PAGE || "http://127.0.0.1:8765/izochrony-transport/";
const PORT = Number(process.env.ISO_CDP || 9333);
const BUDGET_MS = 50;
const args = process.argv.slice(2);
const ttfb = Number((args.find((a) => a.startsWith("--ttfb=")) || "--ttfb=0").slice(7));
const N = Number((args.find((a) => a.startsWith("--n=")) || "--n=16").slice(4));

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[i];
}

async function waitWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const tabs = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const t = tabs.find((x) => x.webSocketDebuggerUrl);
      if (t) return t.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error("no CDP websocket");
}

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.addEventListener("open", () =>
      resolve({
        send(method, params) {
          const i = ++id;
          return new Promise((res, rej) => {
            pending.set(i, { res, rej });
            ws.send(JSON.stringify({ id: i, method, params }));
          });
        },
      })
    );
    ws.addEventListener("error", reject);
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.rej(new Error(JSON.stringify(msg.error)));
        else p.res(msg.result);
      }
    });
  });
}

const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--disable-gpu",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--window-size=1400,900",
    `--user-data-dir=${path.join(os.tmpdir(), "iso-bench-cold-" + PORT)}`,
    PAGE,
  ],
  { stdio: "ignore" }
);

let exitCode = 1;
try {
  const client = await cdp(await waitWs());
  await client.send("Runtime.enable");
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  for (let i = 0; i < 50; i++) {
    const r = await client.send("Runtime.evaluate", {
      expression: "document.querySelectorAll('#citytabs button').length",
      returnByValue: true,
    });
    if (r.result.value >= 1) break;
    await sleep(200);
  }
  await sleep(1200);

  const proto = await client.send("Runtime.evaluate", { expression: "L.Layer.prototype" });
  const objs = await client.send("Runtime.queryObjects", { prototypeObjectId: proto.result.objectId });
  await client.send("Runtime.callFunctionOn", {
    objectId: objs.objects.objectId,
    functionDeclaration: `function () {
      for (let i = 0; i < this.length; i++) {
        if (this[i] && this[i]._map && this[i]._map.latLngToContainerPoint) {
          window.__isoBenchMap = this[i]._map;
          return true;
        }
      }
      return false;
    }`,
    returnByValue: true,
  });

  const result = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const TTFB = ${ttfb};
      const N = ${N};
      const el = document.getElementById("map");
      const map = window.__isoBenchMap;
      if (!map) return { error: "no map" };
      const manifest = await fetch("data/lodz/manifest.json").then((r) => r.json());
      const origins = manifest.origins.filter((_, i) => i % Math.floor(manifest.origins.length / (N + 4)) === 0).slice(0, N);

      const addMarks = [];
      const origAdd = L.GeoJSON.prototype.addData;
      L.GeoJSON.prototype.addData = function (d) {
        const t = performance.now();
        const out = origAdd.call(this, d);
        addMarks.push({ t, n: (d && d.features && d.features.length) || 0 });
        return out;
      };
      const origFetch = window.fetch;
      const fetchMarks = [];
      window.fetch = function () {
        const url = String(arguments[0]);
        const t0 = performance.now();
        const run = () => origFetch.apply(this, arguments).then((r) => {
          fetchMarks.push({ url, ms: performance.now() - t0, t: performance.now() });
          return r;
        });
        if (TTFB > 0 && url.includes(".pbf")) return new Promise((res) => setTimeout(res, TTFB)).then(run);
        return run();
      };

      const samples = [];
      const rect = el.getBoundingClientRect();
      for (const o of origins) {
        const pt = map.latLngToContainerPoint(L.latLng(o.lat, o.lon));
        const clientX = rect.left + pt.x;
        const clientY = rect.top + pt.y;
        if (pt.x < 8 || pt.y < 8 || pt.x > rect.width - 8 || pt.y > rect.height - 8) continue;
        const t0 = performance.now();
        const addBefore = addMarks.length;
        el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX, clientY, view: window }));
        let painted = false;
        let tPaint = null;
        for (let w = 0; w < 80; w++) {
          await new Promise((r) => requestAnimationFrame(r));
          if (addMarks.length > addBefore) {
            await new Promise((r) => requestAnimationFrame(r));
            tPaint = performance.now();
            painted = true;
            break;
          }
        }
        const related = fetchMarks.filter((f) => f.url.endsWith("/" + o.id + ".pbf") && f.t >= t0);
        samples.push({
          id: o.id,
          paintMs: painted ? +(tPaint - t0).toFixed(1) : null,
          fetchMs: related.length ? +related[0].ms.toFixed(1) : null,
          timeout: !painted,
        });
      }
      L.GeoJSON.prototype.addData = origAdd;
      window.fetch = origFetch;
      const paints = samples.map((s) => s.paintMs).filter((x) => x != null).sort((a, b) => a - b);
      const p50 = paints.length ? paints[Math.floor(paints.length * 0.5)] : null;
      const p95 = paints.length ? paints[Math.min(paints.length - 1, Math.ceil(paints.length * 0.95) - 1)] : null;
      return { n: samples.length, p50, p95, max: paints[paints.length - 1] || null, samples, ttfb: TTFB };
    })()`,
  });

  const v = result.result.value;
  if (!v || v.error) {
    console.log(JSON.stringify(v || result, null, 2));
    throw new Error("bench failed to run");
  }
  const red = v.p95 == null || v.p95 > BUDGET_MS;
  const out = {
    verdict: red ? "RED" : "GREEN",
    budgetMs: BUDGET_MS,
    ttfbInjectedMs: ttfb,
    p50: v.p50,
    p95: v.p95,
    max: v.max,
    n: v.n,
    timeouts: v.samples.filter((s) => s.timeout).length,
    samples: v.samples,
  };
  console.log(JSON.stringify(out, null, 2));
  exitCode = red ? 1 : 0;
} finally {
  chrome.kill();
}
process.exit(exitCode);
