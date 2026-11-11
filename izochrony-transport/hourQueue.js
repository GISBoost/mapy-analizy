"use strict";
(function (root) {
  // One missing hour: the slider hour first, then outward. A tie goes to the
  // later clock hour. Ready and skipped hours are the caller's.
  function nextHour(hours, currentIndex, isReady, isSkipped) {
    if (!hours || !hours.length) return null;
    const current = hours[currentIndex];
    if (current != null && !isReady(current) && !isSkipped(current)) return current;
    const n = hours.length;
    for (let dist = 1; dist < n; dist++) {
      const later = currentIndex + dist;
      if (later < n && !isReady(hours[later]) && !isSkipped(hours[later])) return hours[later];
      const earlier = currentIndex - dist;
      if (earlier >= 0 && !isReady(hours[earlier]) && !isSkipped(hours[earlier])) return hours[earlier];
    }
    return null;
  }

  const api = { nextHour: nextHour };
  root.HourQueue = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
