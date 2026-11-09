"use strict";
// Packs per-origin .pbf into data/<city>/<variant>/hours/<hour>.pbf
import { createRequire } from "module";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const geobuf = require("./vendor/geobuf.js");
const Pbf = require("./vendor/pbf.js");

const DATA = path.join(__dirname, "data");
const only = process.argv.slice(2); // optional city ids
const top = JSON.parse(readFileSync(path.join(DATA, "manifest.json"), "utf8"));
const cities = top.cities.map((c) => c.id).filter((id) => !only.length || only.includes(id));

for (const city of cities) {
  const manifest = JSON.parse(readFileSync(path.join(DATA, city, "manifest.json"), "utf8"));
  for (const variant of manifest.variants) {
    const srcDir = path.join(DATA, city, variant);
    if (!existsSync(srcDir)) {
      console.log("skip missing", city, variant);
      continue;
    }
    const files = readdirSync(srcDir).filter((f) => f.endsWith(".pbf") && /^\d+\.pbf$/.test(f));
    const byHour = new Map();
    for (const h of manifest.hours) byHour.set(h, []);
    const t0 = Date.now();
    for (let i = 0; i < files.length; i++) {
      const originId = files[i].replace(/\.pbf$/, "");
      const fc = geobuf.decode(new Pbf(readFileSync(path.join(srcDir, files[i]))));
      for (const f of fc.features) {
        if (!f.geometry || !f.geometry.coordinates) continue;
        const hour = f.properties.hour;
        const bucket = byHour.get(hour);
        if (!bucket) continue;
        bucket.push({
          type: "Feature",
          properties: { origin: originId, cutoff_min: f.properties.cutoff_min, hour },
          geometry: f.geometry,
        });
      }
      if ((i + 1) % 400 === 0) console.log(city, variant, i + 1, "/", files.length);
    }
    const outDir = path.join(srcDir, "hours");
    mkdirSync(outDir, { recursive: true });
    for (const h of manifest.hours) {
      const packed = { type: "FeatureCollection", features: byHour.get(h) };
      const buf = Buffer.from(geobuf.encode(packed, new Pbf()));
      writeFileSync(path.join(outDir, h + ".pbf"), buf);
      console.log(city, variant, "h" + h, (buf.length / 1e6).toFixed(2) + "MB", packed.features.length, "feats");
    }
    console.log(city, variant, "done in", Date.now() - t0, "ms");
  }
}
