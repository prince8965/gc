/**
 * Geolocation & Distance Utility Helpers
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.utils = GC.utils || {};

  function getPos() {
    var geoCfg = GC.config.geo;
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        return reject(new Error('Geolocation not supported'));
      }
      navigator.geolocation.getCurrentPosition(
        function (position) {
          resolve(position.coords);
        },
        reject,
        {
          enableHighAccuracy: geoCfg.enableHighAccuracy,
          timeout: geoCfg.timeoutMs
        }
      );
    });
  }

  function km(lat1, lng1, lat2, lng2) {
    return Math.hypot(
      (lat2 - lat1) * 111,
      (lng2 - lng1) * 111 * Math.cos((lat1 * Math.PI) / 180)
    );
  }

  function gpsLine(coords) {
    if (!coords) return 'GPS unavailable';
    return (
      'GPS ' +
      coords.latitude.toFixed(6) +
      ', ' +
      coords.longitude.toFixed(6) +
      ' (±' +
      Math.round(coords.accuracy) +
      'm)'
    );
  }

  function formatCoords(coords) {
    if (!coords) return '';
    return coords.latitude.toFixed(5) + ', ' + coords.longitude.toFixed(5);
  }

  function getGpsErrorMessage(err) {
    if (err && err.code === 1) return 'permission denied';
    if (err && err.code === 3) return 'timed out';
    return 'not available here';
  }

  GC.utils.geo = {
    getPos: getPos,
    km: km,
    gpsLine: gpsLine,
    formatCoords: formatCoords,
    getGpsErrorMessage: getGpsErrorMessage
  };
})(window);
