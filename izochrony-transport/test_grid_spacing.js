// Self-check for app.js's estimateGridSpacingM() (per-city hover-coverage
// threshold, see app.js comment above HOVER_COVERAGE_RATIO). Not a test
// framework -- just asserts the median nearest-neighbor spacing computed
// from each city's real manifest.json matches its known grid resolution,
// since a silent regression here reproduces the exact bug this was written
// to fix (GZM hover flickering to "outside coverage" across most of a hex).
//
// Usage: node test_grid_spacing.js
"use strict";
const fs = require("fs");
const path = require("path");

// Same algorithm as app.js's estimateGridSpacingM() -- duplicated here
// rather than imported, since app.js is a browser IIFE with no exports.
function estimateGridSpacingM(origins) {
  const sampleSize = Math.min(origins.length, 40);
  const step = Math.max(1, Math.floor(origins.length / sampleSize));
  const dists = [];
  for (let i = 0; i < origins.length; i += step) {
    const o = origins[i];
    const cosLat = Math.cos((o.lat * Math.PI) / 180);
    let minDistSq = Infinity;
    for (const other of origins) {
      if (other === o) continue;
      const dLat = other.lat - o.lat;
      const dLng = (other.lon - o.lon) * cosLat;
      const distSq = dLat * dLat + dLng * dLng;
      if (distSq < minDistSq) minDistSq = distSq;
    }
    dists.push(Math.sqrt(minDistSq) * 111320);
  }
  dists.sort((a, b) => a - b);
  return dists[Math.floor(dists.length / 2)];
}

const DATA_DIR = path.join(__dirname, "data");
const EXPECTED_M = { gzm: 2000, warszawa: 1000, kielce: 500, lodz: 500 };

let failed = false;
for (const [city, expected] of Object.entries(EXPECTED_M)) {
  const manifestPath = path.join(DATA_DIR, city, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.log(`SKIP ${city}: no manifest.json at ${manifestPath}`);
    continue;
  }
  const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const got = estimateGridSpacingM(m.origins);
  const tolerance = expected * 0.05; // 5% -- grid isn't perfectly regular at city edges
  const ok = Math.abs(got - expected) <= tolerance;
  console.log(`${ok ? "PASS" : "FAIL"} ${city}: expected ~${expected}m, got ${got.toFixed(1)}m`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
