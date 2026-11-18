/**
 * Google Maps Configuration & Dynamic Script Loader
 *
 * Reads the Google Maps JavaScript API key strictly from runtime environment
 * configuration (`window.__ENV__.GOOGLE_MAPS_API_KEY` via gitignored `config/env.js`
 * or hosting env injection). Never hardcodes an API key in source code.
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});

  var loadPromise = null;
  var authError = null;

  function getApiKey() {
    var env = global.__ENV__ || {};
    var meta =
      typeof document !== 'undefined' && document.querySelector
        ? document.querySelector('meta[name="gc-google-maps-key"]')
        : null;
    var raw =
      env.GOOGLE_MAPS_API_KEY ||
      global.GOOGLE_MAPS_API_KEY ||
      (meta ? meta.getAttribute('content') : '') ||
      '';
    var key = String(raw).trim();
    if (!key || key === 'your_restricted_google_maps_api_key_here') {
      return '';
    }
    return key;
  }

  GC.mapsConfig = {
    getApiKey: getApiKey,
    // Fallback initial viewport only when no GPS or report markers exist yet (not a marker)
    defaultCenter: { lat: 20.5937, lng: 78.9629 },
    defaultZoom: 5,
    focusedZoom: 16,
    hotspotRadiusMeters: 220,
    clusterGridDegrees: 0.0025, // ~275m visual grouping for nearby markers
    priorityColors: {
      High: '#ef4444',   // Red
      Medium: '#f59e0b', // Orange
      Low: '#10b981',    // Green
      RESOLVED: '#0f766e'
    },
    getAuthError: function () {
      return authError;
    }
  };

  // Official Google Maps callback triggered if key is invalid, restricted, or billing is disabled
  global.gm_authFailure = function () {
    authError =
      'Google Maps authentication failed. Verify your API key, HTTP referrer restrictions, enabled Maps JavaScript API, and Google Cloud billing.';
    if (GC.utils && GC.utils.dom) {
      GC.utils.dom.toast('⚠️ ' + authError, 7000);
    }
    if (GC.maps && typeof GC.maps.handleAuthFailure === 'function') {
      GC.maps.handleAuthFailure(authError);
    }
  };

  function loadGoogleMapsApi() {
    if (authError) {
      return Promise.reject(new Error(authError));
    }
    if (global.google && global.google.maps && global.google.maps.Map) {
      return Promise.resolve(global.google.maps);
    }
    if (loadPromise) {
      return loadPromise;
    }

    var apiKey = getApiKey();
    if (!apiKey) {
      return Promise.reject(
        new Error(
          'Google Maps API key is not configured. Copy config/env.example.js to config/env.js and set GOOGLE_MAPS_API_KEY.'
        )
      );
    }

    loadPromise = new Promise(function (resolve, reject) {
      var callbackName = '__gcGoogleMapsInit';
      var settled = false;
      var timeoutId = setTimeout(function () {
        if (!settled) {
          settled = true;
          loadPromise = null;
          reject(new Error('Google Maps timed out while loading. Check your network connection.'));
        }
      }, 15000);

      global[callbackName] = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        delete global[callbackName];
        if (authError) {
          loadPromise = null;
          reject(new Error(authError));
        } else if (global.google && global.google.maps) {
          resolve(global.google.maps);
        } else {
          loadPromise = null;
          reject(new Error('Google Maps loaded without google.maps object.'));
        }
      };

      var script = document.createElement('script');
      script.async = true;
      script.defer = true;
      script.src =
        'https://maps.googleapis.com/maps/api/js?key=' +
        encodeURIComponent(apiKey) +
        '&libraries=visualization&v=weekly&callback=' +
        callbackName;
      script.onerror = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        delete global[callbackName];
        loadPromise = null;
        reject(new Error('Failed to load Google Maps JavaScript API script.'));
      };
      document.head.appendChild(script);
    });

    return loadPromise;
  }

  GC.mapsConfig.load = loadGoogleMapsApi;
})(window);
