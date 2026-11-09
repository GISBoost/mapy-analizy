"use strict";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { indexHourPack, lookupOrigin, packUrl } = require("./hourPack.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(packUrl("lodz", "rt", 12) === "data/lodz/rt/hours/12.pbf", "pack url");

const empty = indexHourPack({ type: "FeatureCollection", features: [] });
assert(lookupOrigin(empty, "0") === null, "missing origin");

const f15 = { type: "Feature", properties: { origin: "7", cutoff_min: 15 }, geometry: { type: "Polygon", coordinates: [] } };
const f30 = { type: "Feature", properties: { origin: "7", cutoff_min: 30 }, geometry: { type: "Polygon", coordinates: [] } };
const f45 = { type: "Feature", properties: { origin: "7", cutoff_min: 45 }, geometry: { type: "Polygon", coordinates: [] } };
const idx = indexHourPack({ type: "FeatureCollection", features: [f15, f30, f45] });
const slot = lookupOrigin(idx, 7);
assert(slot[15] === f15, "cutoff 15");
assert(slot[30] === f30, "cutoff 30");
assert(slot[45] === f45, "cutoff 45");
assert(lookupOrigin(idx, "7") === slot, "id coerced to string");

console.log("PASS test_hour_pack.mjs");
