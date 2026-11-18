/**
 * Citizen Waste Reporting Page (GeoCamera + Interactive Google Maps Location Picker)
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.pages = GC.pages || {};

  function renderReportPage() {
    var esc = GC.utils.dom.esc;
    var draft = GC.state.draft;
    var pos = GC.state.pos;
    var busy = GC.state.busy;
    var categories = GC.config.categories;
    var severities = GC.config.severities;

    var cameraBlock = draft.previewUrl
      ? '<div class="captured-preview">' +
        '<img class="report-photo" src="' +
        esc(draft.previewUrl) +
        '" alt="Captured waste evidence preview">' +
        '<button type="button" class="btn btn-alt" ' +
        (busy ? 'disabled' : '') +
        ' onclick="GC.reports.retakePhoto()">↻ Retake photo</button>' +
        '</div>'
      : '<div class="camera-stage">' +
        '<video id="v" class="cam-video" playsinline muted></video>' +
        '<div class="action-stack">' +
        '<button type="button" class="btn" onclick="GC.reports.snapPhoto(\'v\')">📷 Capture geo-photo</button>' +
        GC.utils.camera.fileCameraButton('before') +
        '</div>' +
        '</div>';

    var categoryOptions = categories
      .map(function (cat) {
        var selected = draft.cat === cat ? ' selected' : '';
        return '<option value="' + esc(cat) + '"' + selected + '>' + esc(cat) + '</option>';
      })
      .join('');

    var severityButtons = Object.keys(severities)
      .map(function (key) {
        var s = severities[key];
        var isOn = draft.sev === key ? ' on' : '';
        return (
          '<button type="button" id="sv' +
          key +
          '" class="sev-btn' +
          isOn +
          '" style="background:' +
          s.bg +
          ';color:' +
          s.text +
          ';border-color:' +
          s.border +
          '" onclick="GC.reports.setSeverity(\'' +
          key +
          '\')">' +
          key +
          '</button>'
        );
      })
      .join('');

    var hasCoords = draft.lat != null && draft.lng != null;
    var gpsDisplay = hasCoords
      ? (draft.ver ? '🛰️ GPS: ' : '📌 Map pin: ') +
        Number(draft.lat).toFixed(5) +
        ', ' +
        Number(draft.lng).toFixed(5)
      : pos
      ? '📍 ' + GC.utils.geo.formatCoords(pos)
      : '📍 Click on the map or tap My GPS';

    return (
      '<div class="report-layout">' +
      '<section class="card report-camera-card">' +
      '<div class="card-header-row">' +
      '<div>' +
      '<h3>📸 Photo evidence</h3>' +
      '<p class="mut">Photos are uploaded to private cloud storage with supporting GPS &amp; timestamp metadata.</p>' +
      '</div>' +
      '</div>' +
      cameraBlock +
      '</section>' +
      '<section class="card report-form-card">' +
      '<h3>📍 Location &amp; report details</h3>' +
      '<div class="form-field">' +
      '<label>Select waste location on Google Maps</label>' +
      '<p class="mut picker-hint">Tap anywhere on the map or drag the green marker to pinpoint the garbage spot. Use My GPS to jump to your current position.</p>' +
      '<div id="report-location-map" class="gmap-canvas gmap-picker-canvas" role="region" aria-label="Interactive report location picker map"></div>' +
      '<div class="gps-box picker-status-bar">' +
      '<span id="gps" class="gps-readout">' +
      esc(gpsDisplay) +
      '</span>' +
      '<div class="picker-bar-actions">' +
      '<button type="button" class="btn btn-alt btn-sm" onclick="GC.reports.refreshPosition()">🎯 My GPS</button>' +
      '<button type="button" id="confirm-loc-btn" class="btn btn-sm' +
      (draft.locationConfirmed && hasCoords ? ' is-confirmed' : '') +
      '" onclick="GC.reports.confirmLocation()">' +
      (draft.locationConfirmed && hasCoords
        ? '✅ Location confirmed'
        : '✓ Confirm selected location') +
      '</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div id="man" class="manual-gps-box">' +
      '<label>Manual coordinates fallback (if GPS/Map unavailable)</label>' +
      '<div class="input-pair">' +
      '<input id="mla" placeholder="Latitude (e.g. 19.4300)" inputmode="decimal" value="' +
      (hasCoords ? esc(Number(draft.lat).toFixed(6)) : '') +
      '">' +
      '<input id="mlo" placeholder="Longitude (e.g. 72.8257)" inputmode="decimal" value="' +
      (hasCoords ? esc(Number(draft.lng).toFixed(6)) : '') +
      '">' +
      '</div>' +
      '</div>' +
      '<div class="form-field">' +
      '<label for="cat">Category</label>' +
      '<select id="cat">' +
      categoryOptions +
      '</select>' +
      '</div>' +
      '<div class="form-field">' +
      '<span class="field-label">Severity</span>' +
      '<div class="sev-grid">' +
      severityButtons +
      '</div>' +
      '</div>' +
      '<div class="form-field">' +
      '<label for="ds">Description</label>' +
      '<textarea id="ds" rows="3" placeholder="Optional details (e.g., landmark, blockage, odor)">' +
      esc(draft.desc || '') +
      '</textarea>' +
      '</div>' +
      '<button type="button" class="btn" ' +
      (busy ? 'disabled' : '') +
      ' onclick="GC.reports.submitReport()">' +
      (busy ? '⬆️ Uploading & submitting…' : 'Submit report') +
      '</button>' +
      '</section>' +
      '</div>'
    );
  }

  GC.pages.renderReportPage = renderReportPage;
})(window);
