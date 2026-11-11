"use strict";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { nextHour } = require("./hourQueue.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
const at12 = 6;
const ready = (have) => (h) => have.has(h);
const skip = (skipped) => (h) => skipped.has(h);
const none = new Set();

assert(nextHour(hours, at12, ready(none), skip(none)) === 12, "missing slider hour comes first");
assert(nextHour(hours, at12, ready(new Set([12])), skip(none)) === 13, "later neighbor before earlier");
assert(nextHour(hours, at12, ready(new Set([12, 13])), skip(none)) === 11, "then the earlier neighbor");
assert(nextHour(hours, at12, ready(new Set([12, 13, 11])), skip(none)) === 14, "next ring starts with the later hour");
assert(nextHour(hours, at12, ready(new Set([12])), skip(new Set([13]))) === 11, "skipped later hour yields the earlier one");
assert(nextHour(hours, at12, ready(none), skip(new Set([12]))) === 13, "failed slider hour is skipped for the walk");
assert(nextHour(hours, 16, ready(new Set([22])), skip(none)) === 21, "last hour walks backward");
assert(nextHour(hours, at12, ready(new Set(hours)), skip(none)) === null, "full day has nothing to fetch");

console.log("PASS test_hour_queue.mjs");
