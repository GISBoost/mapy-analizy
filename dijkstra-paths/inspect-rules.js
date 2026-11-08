"use strict";
(function (root) {
  const PREVIEW = 30;
  const PIN_SPEED = 4;
  function nextInspectId(current, hitId) {
    if (hitId == null) return current;
    return current === hitId ? null : hitId;
  }
  function hoverCutoff(pinned, leavingMap, cutoff) {
    if (!pinned && leavingMap) return PREVIEW;
    return cutoff;
  }
  const api = {PREVIEW: PREVIEW, PIN_SPEED: PIN_SPEED, nextInspectId: nextInspectId, hoverCutoff: hoverCutoff};
  root.Odcinki = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
