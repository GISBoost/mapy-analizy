// Regression: after the pin has had a moment, the next hour is already
// decoded, so settling the slider on it does not block the main thread.
// A cold decode on every notch is why the slider stayed slow forever.
// Run: node izochrony-transport/test_slider_longtask.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const port = 8791;
const debugPort = 9335;
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = mkdtempSync(join(tmpdir(), "izochrony-slow-"));
const pageUrl = `http://127.0.0.1:${port}/izochrony-transport/`;
const PAINT_BUDGET_MS = 400;
const WARM_LONG_BUDGET_MS = 50;

const py = spawn("py", ["-m", "http.server", String(port)], { cwd: root, stdio: "ignore" });
const browser = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function waitFor(fn, ms, label) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = await fn();
    if (value) return value;
    await sleep(40);
  }
  throw new Error("timeout: " + label);
}

let ws;
try {
  await waitFor(async () => {
    try { return await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((r) => r.json()); }
    catch { return null; }
  }, 10000, "devtools");
  const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  let nextId = 0;
  const pending = new Map();
  const started = [];
  function send(method, params) {
    const id = ++nextId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === "Network.requestWillBeSent") {
      const match = String(msg.params.request.url).match(/\/hours\/(\d+)\.pbf/);
      if (match) started.push(match[1] + ".pbf");
    }
    if (msg.id && pending.has(msg.id)) {
      const waiter = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
      else waiter.resolve(msg.result);
    }
  });
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__longMs = 0; window.__longN = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) { window.__longMs += e.duration; window.__longN += 1; }
      }).observe({ entryTypes: ["longtask"] });`,
  });
  await send("Page.navigate", { url: pageUrl });
  const evalJson = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await waitFor(async () => started.includes("12.pbf"), 20000, "hour 12");
  await waitFor(async () => {
    const stat = await evalJson("document.getElementById('statline').textContent");
    return stat && !stat.includes("Wczytuję");
  }, 20000, "first bytes");
  await evalJson(`(() => {
    const el = document.getElementById('map');
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    return true;
  })()`);
  await waitFor(async () => (await evalJson("document.querySelectorAll('#map path').length")) > 0, 8000, "hover paths");
  const sig = "(() => { let n = 0; document.querySelectorAll('#map path').forEach((p) => { n += (p.getAttribute('d') || '').length; }); return n; })()";

  await evalJson(`(() => {
    const el = document.getElementById('map');
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    window.__longMs = 0; window.__longN = 0;
    return true;
  })()`);
  await waitFor(async () => started.includes("13.pbf"), 8000, "neighbor 13 downloaded");
  await sleep(2500);
  const packsWhilePinned = started.filter((name) => name !== "12.pbf");
  const beforeSig = await evalJson(sig);

  await evalJson("window.__longMs = 0; window.__longN = 0;");
  const t0 = await evalJson(`(() => {
    const s = document.getElementById('hourslider');
    s.value = '7';
    const t = performance.now();
    s.dispatchEvent(new Event('input', { bubbles: true }));
    return t;
  })()`);
  let paintMs = null;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const nowSig = await evalJson(sig);
    if (nowSig !== beforeSig) {
      paintMs = await evalJson(`performance.now() - ${t0}`);
      break;
    }
    await sleep(30);
  }
  const jumpLong = await evalJson("window.__longMs");
  const report = {
    packsWhilePinned,
    paintMs: paintMs == null ? null : Math.round(paintMs),
    jumpLongMs: Math.round(jumpLong),
  };
  console.log(JSON.stringify(report, null, 2));
  const errors = [];
  if (packsWhilePinned.length < 2) errors.push("queue did not download the next hour, got " + packsWhilePinned.join(","));
  if (paintMs == null) errors.push("polygons did not change within 8s of slider step 12:00 -> 13:00");
  else if (paintMs < 120) errors.push(`polygons changed in ${Math.round(paintMs)}ms, before the slider settled`);
  else if (paintMs > PAINT_BUDGET_MS) errors.push(`slider paint ${Math.round(paintMs)}ms > ${PAINT_BUDGET_MS}ms`);
  if (jumpLong > WARM_LONG_BUDGET_MS) errors.push(`warmed hour 13 still decoded on the slider (${Math.round(jumpLong)}ms long task)`);
  if (errors.length) {
    console.error("RED " + errors.join(" | "));
    process.exitCode = 1;
  } else {
    console.log("GREEN test_slider_longtask.mjs");
  }
} catch (err) {
  console.error("RED", err);
  process.exitCode = 1;
} finally {
  if (ws) ws.close();
  browser.kill();
  py.kill();
}
