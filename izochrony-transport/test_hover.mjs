"use strict";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { shouldArmHoverFrame, applyHover } = require("./hover-rules.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(shouldArmHoverFrame(false) === true, "idle frame arms");
assert(shouldArmHoverFrame(true) === false, "pending frame does not arm again");

assert(applyHover(true, 10, 11, 0, 1).action === "skip", "pinned ignores hover");
assert(applyHover(false, 10, 10, 0, 1).action === "skip", "same origin skips render");
assert(applyHover(false, 10, 11, 0, 1).action === "render", "new origin renders");
assert(applyHover(false, 10, 11, 0, 1).displayId === 11, "new origin becomes display");
assert(applyHover(false, 10, 99, 2, 1).action === "outside", "far cursor leaves coverage");
assert(applyHover(false, null, 99, 2, 1).action === "skip", "already outside stays skip");
assert(applyHover(false, 10, 11, 1, 1).action === "render", "on the coverage edge still renders");

console.log("PASS test_hover.mjs");
