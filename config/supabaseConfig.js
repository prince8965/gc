/**
 * Supabase Client Configuration
 *
 * Uses a SINGLE persistent @supabase/supabase-js v2 client instance so the
 * GoTrue anonymous JWT session is never dropped or raced when updating the
 * custom `x-gc-session` header.
 *
 * Only the public Project URL and Publishable Key are used in frontend code;
 * all access control is enforced server-side via Row Level Security.
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});

  var env = global.__ENV__ || {};
  var SUPABASE_URL =
    env.SUPABASE_URL || 'https://rkfeyocckbkqzwdjxtek.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY =
    env.SUPABASE_PUBLISHABLE_KEY ||
    'sb_publishable_wsJrejo2NoMFncRJUwfOfA_jjMO75gu';

  var SESSION_STORAGE_KEY = 'gc_session_token';
  var STORAGE_BUCKET = 'garbage-reports';
  var MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
  var ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  var SIGNED_URL_TTL_SECONDS = 3600; // 1 hour

  var memorySessionToken = '';

  function getSessionToken() {
    if (memorySessionToken) return memorySessionToken;
    try {
      memorySessionToken =
        localStorage.getItem(SESSION_STORAGE_KEY) ||
        sessionStorage.getItem(SESSION_STORAGE_KEY) ||
        '';
      return memorySessionToken;
    } catch (err) {
      return '';
    }
  }

  function setSessionToken(token) {
    var clean = String(token || '').trim();
    memorySessionToken = clean;
    try {
      if (clean) {
        localStorage.setItem(SESSION_STORAGE_KEY, clean);
        sessionStorage.setItem(SESSION_STORAGE_KEY, clean);
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (err) {
      // Storage unavailable; keep in-memory token
    }
    return GC.supabase;
  }

  function clearSessionToken() {
    return setSessionToken('');
  }

  // Dynamically inject current `x-gc-session` token on every outgoing request
  // without ever recreating the Supabase client or disturbing the Auth JWT.
  function sessionAwareFetch(input, init) {
    var opts = Object.assign({}, init || {});
    var baseHeaders =
      opts.headers ||
      (input && typeof input === 'object' && input.headers ? input.headers : undefined);
    var headers = new Headers(baseHeaders || {});
    var token = getSessionToken();
    if (token) {
      headers.set('x-gc-session', token);
    }
    opts.headers = headers;
    return global.fetch(input, opts);
  }

  function createSingleClient() {
    if (!global.supabase || typeof global.supabase.createClient !== 'function') {
      return null;
    }
    var clientOptions = {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    };
    if (typeof global.fetch === 'function' && typeof Headers === 'function') {
      clientOptions.global = { fetch: sessionAwareFetch };
    }
    return global.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      clientOptions
    );
  }

  GC.supabaseConfig = {
    projectName: 'Garbage Collector',
    projectId: 'rkfeyocckbkqzwdjxtek',
    url: SUPABASE_URL,
    publishableKey: SUPABASE_PUBLISHABLE_KEY,
    bucket: STORAGE_BUCKET,
    maxImageSizeBytes: MAX_IMAGE_SIZE_BYTES,
    allowedImageTypes: ALLOWED_IMAGE_TYPES,
    signedUrlTtlSeconds: SIGNED_URL_TTL_SECONDS,
    getSessionToken: getSessionToken,
    setSessionToken: setSessionToken,
    clearSessionToken: clearSessionToken
  };

  GC.supabase = createSingleClient();
})(window);
