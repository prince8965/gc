/**
 * Supabase Storage Service (`garbage-reports` Private Bucket)
 *
 * Upload path structure (enforced by Storage RLS policies):
 * - Citizen before-cleaning photo: `before/<profile_uuid>/<timestamp>-<rand>.<ext>`
 * - Collector after-cleaning photo: `after/<report_uuid>/<timestamp>-<rand>.<ext>`
 *
 * Ensures a bound Supabase anonymous Auth session exists before uploading or
 * requesting private signed URLs. Never uses public bucket URLs or Base64 in DB.
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});

  var signedUrlCache = {};

  function validateImage(blob) {
    var cfg = GC.supabaseConfig;
    if (!blob) {
      throw new Error('No image provided.');
    }
    if (blob.size > cfg.maxImageSizeBytes) {
      throw new Error('Image exceeds maximum size limit of 5 MB.');
    }
    var mime = (blob.type || 'image/jpeg').toLowerCase();
    if (cfg.allowedImageTypes.indexOf(mime) === -1) {
      throw new Error('Unsupported image format. Allowed: JPEG, PNG, WebP.');
    }
    return mime;
  }

  function extensionForMime(mime) {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    return 'jpg';
  }

  function randomSuffix() {
    return Math.random().toString(36).slice(2, 10);
  }

  async function uploadToPath(path, blob) {
    if (!GC.supabase) throw new Error('Supabase client is not initialized.');
    var mime = validateImage(blob);

    // Guarantee anonymous Supabase Auth JWT is active and bound to user_sessions
    if (GC.auth && typeof GC.auth.ensureStorageAuth === 'function') {
      await GC.auth.ensureStorageAuth();
    }

    var result = await GC.supabase.storage
      .from(GC.supabaseConfig.bucket)
      .upload(path, blob, {
        contentType: mime,
        upsert: false,
        cacheControl: '3600'
      });

    if (result.error) {
      var msg = result.error.message || 'Storage upload failed';
      throw new Error('Storage upload failed (' + msg + ').');
    }
    return result.data.path;
  }

  async function uploadBeforePhoto(blob, citizenId) {
    var mime = validateImage(blob);
    var ext = extensionForMime(mime);
    var objectPath =
      'before/' + citizenId + '/' + Date.now() + '-' + randomSuffix() + '.' + ext;
    return uploadToPath(objectPath, blob);
  }

  async function uploadAfterPhoto(blob, reportId) {
    var mime = validateImage(blob);
    var ext = extensionForMime(mime);
    var objectPath =
      'after/' + reportId + '/' + Date.now() + '-' + randomSuffix() + '.' + ext;
    return uploadToPath(objectPath, blob);
  }

  async function getSignedUrl(objectPath) {
    if (!objectPath) return '';
    if (/^https?:\/\//i.test(objectPath)) return objectPath;

    var cached = signedUrlCache[objectPath];
    var now = Date.now();
    if (cached && cached.expiresAt > now + 60000) {
      return cached.url;
    }

    if (!GC.supabase) return '';
    if (GC.auth && typeof GC.auth.ensureStorageAuth === 'function') {
      try {
        await GC.auth.ensureStorageAuth();
      } catch (err) {
        return '';
      }
    }

    var ttl = GC.supabaseConfig.signedUrlTtlSeconds;
    var result = await GC.supabase.storage
      .from(GC.supabaseConfig.bucket)
      .createSignedUrl(objectPath, ttl);

    if (result.error || !result.data || !result.data.signedUrl) {
      return '';
    }

    signedUrlCache[objectPath] = {
      url: result.data.signedUrl,
      expiresAt: now + ttl * 1000
    };
    return result.data.signedUrl;
  }

  async function preloadReportImageUrls(reports) {
    if (!Array.isArray(reports) || !reports.length || !GC.supabase) return;
    var pathsToFetch = [];
    var now = Date.now();

    reports.forEach(function (r) {
      [r.before_image_url, r.after_image_url].forEach(function (p) {
        if (!p || /^https?:\/\//i.test(p)) return;
        var cached = signedUrlCache[p];
        if (!cached || cached.expiresAt <= now + 60000) {
          if (pathsToFetch.indexOf(p) === -1) pathsToFetch.push(p);
        }
      });
    });

    if (!pathsToFetch.length) return;

    if (GC.auth && typeof GC.auth.ensureStorageAuth === 'function') {
      try {
        await GC.auth.ensureStorageAuth();
      } catch (err) {
        return;
      }
    }

    var ttl = GC.supabaseConfig.signedUrlTtlSeconds;
    var result = await GC.supabase.storage
      .from(GC.supabaseConfig.bucket)
      .createSignedUrls(pathsToFetch, ttl);

    if (!result.error && Array.isArray(result.data)) {
      result.data.forEach(function (item) {
        if (item && item.path && item.signedUrl) {
          signedUrlCache[item.path] = {
            url: item.signedUrl,
            expiresAt: now + ttl * 1000
          };
        }
      });
    }
  }

  function getCachedSignedUrl(objectPath) {
    if (!objectPath) return '';
    if (/^https?:\/\//i.test(objectPath)) return objectPath;
    var cached = signedUrlCache[objectPath];
    return cached ? cached.url : '';
  }

  function clearCache() {
    signedUrlCache = {};
  }

  GC.storage = {
    validateImage: validateImage,
    uploadBeforePhoto: uploadBeforePhoto,
    uploadAfterPhoto: uploadAfterPhoto,
    getSignedUrl: getSignedUrl,
    preloadReportImageUrls: preloadReportImageUrls,
    getCachedSignedUrl: getCachedSignedUrl,
    clearCache: clearCache
  };
})(window);
