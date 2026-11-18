/**
 * GeoCamera & Canvas Stamping Utilities
 * Captures live video or native phone camera photos, stamps supporting GPS/timestamp
 * metadata onto a canvas, and produces validated binary JPEG Blobs for Supabase Storage.
 * Note: GPS coordinates and photo timestamps serve as supporting evidence only.
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.utils = GC.utils || {};

  var activeStream = null;
  var lastCamError = '';

  function buildStampedCanvas(source, srcWidth, srcHeight, gpsText) {
    var cfg = GC.config.camera;
    var canvas = document.createElement('canvas');
    var width = cfg.canvasWidth;
    var height = Math.round((width * srcHeight) / (srcWidth || 1));
    canvas.width = width;
    canvas.height = height + cfg.footerHeight;

    var ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0, width, height);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, height, width, cfg.footerHeight);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.fillText(gpsText, 10, height + 17);
    ctx.fillText(
      new Date().toLocaleString() + ' · Supporting GeoCamera metadata',
      10,
      height + 35
    );

    return canvas;
  }

  function stampCanvasToBlob(source, srcWidth, srcHeight, gpsText) {
    var cfg = GC.config.camera;
    var canvas = buildStampedCanvas(source, srcWidth, srcHeight, gpsText);
    return new Promise(function (resolve, reject) {
      if (canvas.toBlob) {
        canvas.toBlob(
          function (blob) {
            if (!blob) return reject(new Error('Failed to encode photo'));
            var previewUrl = URL.createObjectURL(blob);
            resolve({ blob: blob, previewUrl: previewUrl });
          },
          'image/jpeg',
          cfg.jpegQuality
        );
      } else {
        try {
          var dataUrl = canvas.toDataURL('image/jpeg', cfg.jpegQuality);
          var blob = dataUrlToBlob(dataUrl);
          resolve({ blob: blob, previewUrl: dataUrl });
        } catch (err) {
          reject(err);
        }
      }
    });
  }

  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl).split(',');
    var mimeMatch = parts[0].match(/:(.*?);/);
    var mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    var binary = atob(parts[1] || '');
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  function stopCam() {
    if (activeStream) {
      activeStream.getTracks().forEach(function (track) {
        track.stop();
      });
      activeStream = null;
    }
  }

  function renderCamFallback(videoId) {
    var esc = GC.utils.dom.esc;
    var video = document.getElementById(videoId);
    if (video) {
      video.outerHTML =
        '<div class="cam-fallback mut" role="status">' +
        '📵 Live camera unavailable (' +
        esc(lastCamError) +
        '). Use the phone camera button below.' +
        '</div>';
    }
  }

  async function startCam(videoId) {
    stopCam();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      lastCamError = 'not supported here';
      renderCamFallback(videoId);
      return;
    }
    try {
      activeStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      var video = document.getElementById(videoId);
      if (video) {
        video.srcObject = activeStream;
        video.play();
      }
    } catch (err) {
      lastCamError = (err && err.name) || 'permission blocked';
      renderCamFallback(videoId);
    }
  }

  function fileCameraButton(kind) {
    return (
      '<label class="btn btn-alt btn-file-camera">' +
      '<input type="file" accept="image/jpeg,image/png,image/webp,image/*" capture="environment" hidden onchange="GC.reports.handleFilePhoto(this,\'' +
      kind +
      '\')">' +
      '📱 Open phone camera app' +
      '</label>'
    );
  }

  GC.utils.camera = {
    stampCanvasToBlob: stampCanvasToBlob,
    dataUrlToBlob: dataUrlToBlob,
    startCam: startCam,
    stopCam: stopCam,
    fileCameraButton: fileCameraButton
  };
})(window);
