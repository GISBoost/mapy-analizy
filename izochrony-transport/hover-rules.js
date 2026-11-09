"use strict";
(function (root) {
  function shouldArmHoverFrame(framePending) {
    return !framePending;
  }

  function applyHover(pinned, displayId, nearestId, distSq, maxDistSq) {
    if (pinned) return { action: "skip", displayId: displayId, outside: false };
    if (distSq > maxDistSq) {
      if (displayId == null) return { action: "skip", displayId: null, outside: true };
      return { action: "outside", displayId: null, outside: true };
    }
    if (nearestId === displayId) return { action: "skip", displayId: displayId, outside: false };
    return { action: "render", displayId: nearestId, outside: false };
  }

  const api = { shouldArmHoverFrame: shouldArmHoverFrame, applyHover: applyHover };
  root.IsoHover = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
