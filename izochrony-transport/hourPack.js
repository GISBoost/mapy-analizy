"use strict";
(function (root) {
  function packUrl(city, variant, hour) {
    return "data/" + city + "/" + variant + "/hours/" + hour + ".pbf";
  }

  function indexHourPack(fc) {
    const byOrigin = new Map();
    const feats = fc && fc.features ? fc.features : [];
    for (let i = 0; i < feats.length; i++) {
      const f = feats[i];
      const id = String(f.properties.origin);
      let slot = byOrigin.get(id);
      if (!slot) {
        slot = { 15: null, 30: null, 45: null };
        byOrigin.set(id, slot);
      }
      slot[f.properties.cutoff_min] = f;
    }
    return byOrigin;
  }

  function lookupOrigin(index, originId) {
    return index.get(String(originId)) || null;
  }

  const api = { packUrl: packUrl, indexHourPack: indexHourPack, lookupOrigin: lookupOrigin };
  root.HourPack = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
