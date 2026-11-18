/**
 * Waste Reporting, GeoCamera Storage Upload & Collection Workflow Controller
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});

  function syncDraftFields() {
    var $ = GC.utils.dom.$;
    var catEl = $('#cat');
    var descEl = $('#ds');
    if (catEl) GC.state.draft.cat = catEl.value;
    if (descEl) GC.state.draft.desc = descEl.value;
  }

  function setSeverity(severityKey) {
    GC.state.draft.sev = severityKey;
    Object.keys(GC.config.severities).forEach(function (key) {
      var btn = GC.utils.dom.$('#sv' + key);
      if (btn) btn.classList.toggle('on', key === severityKey);
    });
  }

  function showManualLocation() {
    var manualEl = GC.utils.dom.$('#man');
    if (manualEl) manualEl.classList.add('is-visible');
  }

  function updateLocationReadout() {
    var $ = GC.utils.dom.$;
    var draft = GC.state.draft;
    var gpsEl = $('#gps');
    var confirmBtn = $('#confirm-loc-btn');
    var mla = $('#mla');
    var mlo = $('#mlo');

    if (gpsEl) {
      if (draft.lat != null && draft.lng != null) {
        gpsEl.textContent =
          (draft.ver ? '🛰️ GPS: ' : '📌 Map pin: ') +
          Number(draft.lat).toFixed(5) +
          ', ' +
          Number(draft.lng).toFixed(5) +
          (draft.ver && draft.acc ? ' (±' + Math.round(draft.acc) + 'm)' : '');
      } else {
        gpsEl.textContent = '📍 Click on the map or tap My GPS';
      }
    }

    if (mla && draft.lat != null) mla.value = Number(draft.lat).toFixed(6);
    if (mlo && draft.lng != null) mlo.value = Number(draft.lng).toFixed(6);

    if (confirmBtn) {
      if (draft.locationConfirmed && draft.lat != null && draft.lng != null) {
        confirmBtn.textContent = '✅ Location confirmed';
        confirmBtn.classList.add('is-confirmed');
      } else {
        confirmBtn.textContent = '✓ Confirm selected location';
        confirmBtn.classList.remove('is-confirmed');
      }
    }
  }

  function selectMapLocation(lat, lng, isGps, accuracy) {
    GC.state.draft.lat = Number(lat);
    GC.state.draft.lng = Number(lng);
    GC.state.draft.ver = !!isGps;
    GC.state.draft.acc = isGps && accuracy ? Number(accuracy) : null;
    GC.state.draft.locationConfirmed = false;
    updateLocationReadout();
  }

  function confirmLocation() {
    var $ = GC.utils.dom.$;
    var draft = GC.state.draft;
    if (draft.lat == null || draft.lng == null) {
      var mla = $('#mla');
      var mlo = $('#mlo');
      var lat = parseFloat(mla ? mla.value : '');
      var lng = parseFloat(mlo ? mlo.value : '');
      if (GC.components.googleMap.isValidCoord(lat, lng)) {
        draft.lat = lat;
        draft.lng = lng;
        draft.ver = false;
        var inst = GC.components.googleMap.getInstance('report-location-map');
        if (inst) inst.placeSelectionMarker(lat, lng, true);
      }
    }

    if (!GC.components.googleMap.isValidCoord(draft.lat, draft.lng)) {
      showManualLocation();
      return GC.utils.dom.toast(
        'Select a spot on the Google Map, allow GPS, or enter coordinates first.',
        4000
      );
    }

    draft.locationConfirmed = true;
    updateLocationReadout();
    GC.utils.dom.toast(
      '✅ Location confirmed: ' +
        Number(draft.lat).toFixed(5) +
        ', ' +
        Number(draft.lng).toFixed(5),
      3000
    );
  }

  async function refreshPosition() {
    var gpsEl = GC.utils.dom.$('#gps');
    if (gpsEl) gpsEl.textContent = '📍 Locating via GPS…';
    try {
      GC.state.pos = await GC.utils.geo.getPos();
      selectMapLocation(
        GC.state.pos.latitude,
        GC.state.pos.longitude,
        true,
        GC.state.pos.accuracy
      );
      var inst = GC.components.googleMap.getInstance('report-location-map');
      if (inst) {
        inst.setGpsIndicator(
          GC.state.pos.latitude,
          GC.state.pos.longitude,
          GC.state.pos.accuracy
        );
        inst.placeSelectionMarker(
          GC.state.pos.latitude,
          GC.state.pos.longitude,
          true
        );
      }
    } catch (err) {
      GC.state.pos = null;
      var reason = GC.utils.geo.getGpsErrorMessage(err);
      if (gpsEl) {
        gpsEl.textContent =
          '⚠️ GPS ' + reason + ' — click on the map to select location';
      }
      showManualLocation();
    }
  }

  function bindReportView() {
    if (!GC.state.draft.previewUrl) {
      GC.utils.camera.startCam('v');
    }
    if (GC.maps && typeof GC.maps.mountReportFormMap === 'function') {
      GC.maps.mountReportFormMap();
    }
    if (!GC.state.pos && GC.state.draft.lat == null) {
      refreshPosition();
    } else {
      updateLocationReadout();
    }
  }

  function retakePhoto() {
    syncDraftFields();
    if (GC.state.draft.previewUrl && GC.state.draft.previewUrl.indexOf('blob:') === 0) {
      try {
        URL.revokeObjectURL(GC.state.draft.previewUrl);
      } catch (e) {}
    }
    GC.state.draft.blob = null;
    GC.state.draft.previewUrl = null;
    GC.app.render();
  }

  async function completeCapture(kind, captureResult) {
    if (kind === 'after') {
      await uploadAfterAndResolve(captureResult.blob);
      return;
    }

    syncDraftFields();
    GC.state.draft.blob = captureResult.blob;
    GC.state.draft.previewUrl = captureResult.previewUrl;
    GC.state.draft.ver = !!GC.state.pos;
    if (GC.state.pos) {
      GC.state.draft.lat = GC.state.pos.latitude;
      GC.state.draft.lng = GC.state.pos.longitude;
      GC.state.draft.acc = GC.state.pos.accuracy;
    }
    GC.app.render();
  }

  async function snapPhoto(videoId) {
    var video = document.getElementById(videoId);
    if (!video || !video.videoWidth) {
      return GC.utils.dom.toast(
        'Live camera not ready – use the phone camera button below.'
      );
    }
    try {
      GC.state.pos = await GC.utils.geo.getPos();
    } catch (err) {
      GC.state.pos = null;
    }

    try {
      var result = await GC.utils.camera.stampCanvasToBlob(
        video,
        video.videoWidth,
        video.videoHeight,
        GC.utils.geo.gpsLine(GC.state.pos)
      );
      GC.utils.camera.stopCam();
      await completeCapture(videoId === 'afterV' ? 'after' : 'before', result);
    } catch (err) {
      GC.utils.dom.toast('⚠️ Photo capture failed: ' + (err.message || err), 4000);
    }
  }

  async function handleFilePhoto(input, kind) {
    var file = input.files && input.files[0];
    if (!file) return;

    try {
      GC.storage.validateImage(file);
    } catch (err) {
      return GC.utils.dom.toast('⚠️ ' + err.message, 4000);
    }

    try {
      GC.state.pos = await GC.utils.geo.getPos();
    } catch (err) {
      GC.state.pos = null;
    }

    var img = new Image();
    var objectUrl = URL.createObjectURL(file);
    img.onload = async function () {
      try {
        var result = await GC.utils.camera.stampCanvasToBlob(
          img,
          img.width,
          img.height,
          GC.utils.geo.gpsLine(GC.state.pos)
        );
        URL.revokeObjectURL(objectUrl);
        await completeCapture(kind, result);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        GC.utils.dom.toast('⚠️ Failed to process photo: ' + err.message, 4000);
      }
    };
    img.onerror = function () {
      URL.revokeObjectURL(objectUrl);
      GC.utils.dom.toast('⚠️ Could not decode image file.', 3500);
    };
    img.src = objectUrl;
  }

  async function submitReport() {
    if (GC.state.busy) return;
    var $ = GC.utils.dom.$;
    var draft = GC.state.draft;
    if (!draft.blob) {
      return GC.utils.dom.toast('Capture a geo-photo first.', 3000);
    }

    var lat = draft.lat;
    var lng = draft.lng;
    if (lat == null || lng == null) {
      var mla = $('#mla');
      var mlo = $('#mlo');
      lat = parseFloat(mla ? mla.value : '');
      lng = parseFloat(mlo ? mlo.value : '');
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        showManualLocation();
        return GC.utils.dom.toast(
          'Location needed: select a location on the map, allow GPS, or enter coordinates.',
          5000
        );
      }
      draft.lat = lat;
      draft.lng = lng;
    }

    if (!draft.locationConfirmed) {
      return GC.utils.dom.toast(
        'Please tap "Confirm selected location" before submitting your report.',
        4500
      );
    }

    syncDraftFields();
    GC.state.busy = true;
    GC.app.render();

    try {
      GC.utils.dom.toast('⬆️ Uploading photo to Supabase Storage…', 4000);
      var storagePath = await GC.storage.uploadBeforePhoto(
        draft.blob,
        GC.state.me.id
      );

      // Send ONLY permitted citizen submission fields; server sets citizen_id,
      // initial status (PENDING), report_number, area_id, and priority securely.
      var created = await GC.db.createReport({
        category: draft.cat || GC.config.categories[0],
        severity: draft.sev || 'Medium',
        description: (draft.desc || '').trim(),
        latitude: lat,
        longitude: lng,
        location_accuracy: draft.acc || null,
        location_verified: !!draft.ver,
        before_image_url: storagePath
      });

      GC.state.resetDraft();
      GC.state.busy = false;
      await GC.state.refreshReportsAndNotes();
      GC.utils.dom.toast('✅ Submitted: ' + created.report_number, 5000);
      GC.state.tab = 'mine';
      GC.app.render();
    } catch (err) {
      GC.state.busy = false;
      GC.utils.dom.toast('⚠️ Submission failed: ' + (err.message || err), 5500);
      GC.app.render();
    }
  }

  async function startCleaning(reportId) {
    if (GC.state.busy) return;
    GC.state.busy = true;
    try {
      // Server trigger assigns the logged-in collector if unassigned
      var updated = await GC.db.updateReportStatus(reportId, {
        status: 'IN_PROGRESS'
      });
      await GC.state.refreshReportsAndNotes();
      GC.utils.dom.toast('▶ Cleaning started for ' + updated.report_number, 3500);
    } catch (err) {
      GC.utils.dom.toast('⚠️ ' + (err.message || 'Could not start cleaning'), 4500);
    } finally {
      GC.state.busy = false;
      GC.app.render();
    }
  }

  function openAfterCapture(reportId) {
    GC.state.target = GC.state.findReport(reportId) || null;
    GC.app.render();
  }

  function cancelAfterCapture() {
    GC.utils.camera.stopCam();
    GC.state.target = null;
    GC.app.render();
  }

  async function uploadAfterAndResolve(blob) {
    var target = GC.state.target;
    if (!target || GC.state.busy) return;

    GC.state.busy = true;
    GC.app.render();
    try {
      GC.utils.dom.toast('⬆️ Uploading after-cleaning photo…', 4000);
      var afterPath = await GC.storage.uploadAfterPhoto(blob, target.id);
      // Server trigger stamps resolved_at automatically upon resolution
      var resolved = await GC.db.updateReportStatus(target.id, {
        after_image_url: afterPath,
        status: 'RESOLVED'
      });

      GC.state.target = null;
      await GC.state.refreshReportsAndNotes();
      GC.utils.dom.toast(
        '✅ ' + resolved.report_number + ' resolved – citizen notified!',
        4500
      );
    } catch (err) {
      GC.utils.dom.toast('⚠️ Resolve failed: ' + (err.message || err), 5500);
    } finally {
      GC.state.busy = false;
      GC.app.render();
    }
  }

  async function adminSaveAssignment(reportId) {
    var $ = GC.utils.dom.$;
    var areaEl = $('#assign-area-' + reportId);
    var colEl = $('#assign-col-' + reportId);
    var prioEl = $('#assign-prio-' + reportId);

    var areaId = areaEl ? areaEl.value || null : null;
    var collectorId = colEl ? colEl.value || null : null;
    var priority = prioEl ? prioEl.value || null : null;

    try {
      await GC.db.adminUpdateReportAssignment(reportId, areaId, collectorId, priority);
      await GC.state.refreshReportsAndNotes();
      GC.utils.dom.toast('✅ Report assignment & priority updated', 3000);
      GC.app.render();
    } catch (err) {
      GC.utils.dom.toast('⚠️ ' + (err.message || 'Update failed'), 4500);
    }
  }

  async function toggleHistory(reportId) {
    if (GC.state.expandedHistoryId === reportId) {
      GC.state.expandedHistoryId = null;
      GC.app.render();
      return;
    }
    GC.state.expandedHistoryId = reportId;
    try {
      GC.state.historyByReportId[reportId] = await GC.db.fetchReportHistory(reportId);
    } catch (err) {
      GC.utils.dom.toast('⚠️ Could not load status history: ' + err.message, 4000);
    }
    GC.app.render();
  }

  GC.reports = {
    setSeverity: setSeverity,
    selectMapLocation: selectMapLocation,
    confirmLocation: confirmLocation,
    refreshPosition: refreshPosition,
    bindReportView: bindReportView,
    retakePhoto: retakePhoto,
    snapPhoto: snapPhoto,
    handleFilePhoto: handleFilePhoto,
    submitReport: submitReport,
    startCleaning: startCleaning,
    openAfterCapture: openAfterCapture,
    cancelAfterCapture: cancelAfterCapture,
    adminSaveAssignment: adminSaveAssignment,
    toggleHistory: toggleHistory
  };
})(window);
