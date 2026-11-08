import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require = createRequire(import.meta.url);
const R = require("./inspect-rules.js");

assert.equal(R.PREVIEW, 30);
assert.equal(R.PIN_SPEED, 4);
assert.equal(R.nextInspectId(null, 12), 12);
assert.equal(R.nextInspectId(12, 12), null);
assert.equal(R.nextInspectId(12, 9), 9);
assert.equal(R.nextInspectId(12, null), 12);
assert.equal(R.hoverCutoff(false, true, 15), 30);
assert.equal(R.hoverCutoff(false, false, 15), 15);
assert.equal(R.hoverCutoff(true, true, 15), 15);
assert.equal(R.hoverCutoff(true, false, 8), 8);
console.log("ok");
