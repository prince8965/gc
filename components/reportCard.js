/**
 * Report Card Component (Supabase-Connected)
 * Renders report details, signed before/after Storage photographs, GPS supporting
 * metadata, Google Maps location link, status history timeline, Admin controls
 * (area, collector, priority), and Collector workflow actions.
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.components = GC.components || {};

  function renderHistorySection(report) {
    var esc = GC.utils.dom.esc;
    if (GC.state.expandedHistoryId !== report.id) return '';
    var items = GC.state.historyByReportId[report.id] || [];
    if (!items.length) {
      return '<div class="history-box mut">No status history recorded yet.</div>';
    }
    return (
      '<div class="history-box">' +
      '<div class="history-title">📜 Status History</div>' +
      items
        .map(function (h) {
          var actorName =
            h.actor && h.actor.full_name ? h.actor.full_name : 'System';
          return (
            '<div class="history-item">' +
            '<div class="history-line">' +
            '<strong>' +
            esc(h.old_status ? h.old_status + ' → ' + h.new_status : h.new_status) +
            '</strong>' +
            '<span class="mut">' +
            GC.utils.dom.formatDateTime(h.created_at) +
            '</span>' +
            '</div>' +
            '<div class="mut">' +
            esc(h.remarks || '') +
            ' · by ' +
            esc(actorName) +
            '</div>' +
            '</div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderAdminManageControls(report) {
    var esc = GC.utils.dom.esc;
    var collectors = GC.state.profiles.filter(function (p) {
      return p.role === 'collector';
    });

    var areaOpts =
      '<option value="">Area: Unassigned</option>' +
      GC.state.areas
        .map(function (a) {
          var sel = report.area_id === a.id ? ' selected' : '';
          return '<option value="' + esc(a.id) + '"' + sel + '>' + esc(a.area_name) + '</option>';
        })
        .join('');

    var colOpts =
      '<option value="">Collector: Auto/Unassigned</option>' +
      collectors
        .map(function (c) {
          var sel = report.assigned_collector_id === c.id ? ' selected' : '';
          return '<option value="' + esc(c.id) + '"' + sel + '>' + esc(c.full_name) + '</option>';
        })
        .join('');

    var prioOpts = ['Low', 'Medium', 'High']
      .map(function (p) {
        var sel = report.priority === p ? ' selected' : '';
        return '<option value="' + p + '"' + sel + '>Priority: ' + p + '</option>';
      })
      .join('');

    return (
      '<div class="admin-report-controls">' +
      '<div class="admin-controls-grid">' +
      '<select id="assign-area-' + esc(report.id) + '" aria-label="Service area">' + areaOpts + '</select>' +
      '<select id="assign-col-' + esc(report.id) + '" aria-label="Assigned collector">' + colOpts + '</select>' +
      '<select id="assign-prio-' + esc(report.id) + '" aria-label="Report priority">' + prioOpts + '</select>' +
      '</div>' +
      '<button type="button" class="btn btn-alt btn-sm" onclick="GC.reports.adminSaveAssignment(\'' +
      esc(report.id) +
      '\')">Save assignment &amp; priority</button>' +
      '</div>'
    );
  }

  function renderReportCard(report) {
    var esc = GC.utils.dom.esc;
    var score = GC.utils.priority.prio(report);
    var prioLbl = GC.utils.priority.pl(report);
    var hoursAgo = GC.utils.priority.hrs(report).toFixed(1);
    var submittedAt = GC.utils.dom.formatDateTime(report.created_at);
    var me = GC.state.me;
    var isCollector = me && me.role === 'collector';
    var isAdmin = me && me.role === 'admin';
    var target = GC.state.target;
    var isCapturingAfter = target && target.id === report.id;

    var citizenName =
      (report.citizen && report.citizen.full_name) ||
      (me && report.citizen_id === me.id ? me.full_name : 'Citizen');
    var areaLabel =
      (report.area && report.area.area_name) || GC.state.areaName(report.area_id);
    var collectorName =
      report.collector && report.collector.full_name
        ? ' · Collector: ' + report.collector.full_name
        : '';

    var beforeUrl = GC.storage.getCachedSignedUrl(report.before_image_url);
    var afterUrl = GC.storage.getCachedSignedUrl(report.after_image_url);

    var photosHtml =
      '<div class="photo-compare ' +
      (report.after_image_url ? 'has-after' : 'before-only') +
      '">' +
      '<figure class="photo-frame">' +
      '<span class="photo-tag">Before</span>' +
      (beforeUrl
        ? '<img class="report-photo" src="' +
          esc(beforeUrl) +
          '" alt="Before cleaning waste photo for ' +
          esc(report.report_number) +
          '" loading="lazy">'
        : '<div class="photo-placeholder mut">Loading private image…</div>') +
      '</figure>' +
      (report.after_image_url
        ? '<figure class="photo-frame">' +
          '<span class="photo-tag photo-tag-after">After</span>' +
          (afterUrl
            ? '<img class="report-photo" src="' +
              esc(afterUrl) +
              '" alt="After cleaning verification photo for ' +
              esc(report.report_number) +
              '" loading="lazy">'
            : '<div class="photo-placeholder mut">Loading private image…</div>') +
          '</figure>'
        : '') +
      '</div>';

    var mapsLinkHtml =
      '<a class="maps-link" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&destination=' +
      encodeURIComponent(report.latitude) +
      ',' +
      encodeURIComponent(report.longitude) +
      '">🧭 View on Google Maps (' +
      Number(report.latitude).toFixed(4) +
      ', ' +
      Number(report.longitude).toFixed(4) +
      ')</a>';

    var historyBtnHtml =
      '<button type="button" class="link-btn" onclick="GC.reports.toggleHistory(\'' +
      esc(report.id) +
      '\')">' +
      (GC.state.expandedHistoryId === report.id ? '▲ Hide history' : '📜 Status history') +
      '</button>';

    var collectorActionsHtml = '';
    if (isCollector && (report.status === 'PENDING' || report.status === 'OPEN')) {
      collectorActionsHtml =
        '<button type="button" class="btn btn-collector" ' +
        (GC.state.busy ? 'disabled' : '') +
        ' onclick="GC.reports.startCleaning(\'' +
        esc(report.id) +
        '\')">▶ Start cleaning</button>';
    } else if (isCollector && report.status === 'IN_PROGRESS') {
      if (isCapturingAfter) {
        collectorActionsHtml =
          '<div class="after-capture-box">' +
          '<video id="afterV" class="cam-video" playsinline muted></video>' +
          '<div class="action-stack">' +
          '<button type="button" class="btn btn-collector" ' +
          (GC.state.busy ? 'disabled' : '') +
          ' onclick="GC.reports.snapPhoto(\'afterV\')">' +
          (GC.state.busy ? 'Uploading…' : '📷 Capture after-cleaning photo & resolve') +
          '</button>' +
          GC.utils.camera.fileCameraButton('after') +
          '<button type="button" class="btn btn-alt" onclick="GC.reports.cancelAfterCapture()">Cancel</button>' +
          '</div>' +
          '</div>';
      } else {
        collectorActionsHtml =
          '<button type="button" class="btn btn-collector" onclick="GC.reports.openAfterCapture(\'' +
          esc(report.id) +
          '\')">✅ Upload after photo &amp; resolve</button>';
      }
    }

    var resolvedHtml =
      report.status === 'RESOLVED' && report.resolved_at
        ? '<p class="resolved-meta">✅ Resolved in ' +
          Math.max(
            0,
            (Date.parse(report.resolved_at) - Date.parse(report.created_at)) / 36e5
          ).toFixed(1) +
          ' h (' +
          GC.utils.dom.formatDateTime(report.resolved_at) +
          ')</p>'
        : '';

    return (
      '<article class="card report-card">' +
      '<div class="report-card-head">' +
      '<strong class="report-id">' +
      esc(report.report_number) +
      '</strong>' +
      '<div class="badge-group">' +
      '<span class="badge ' +
      prioLbl +
      '">' +
      prioLbl +
      ' · ' +
      score +
      '</span>' +
      '<span class="badge ' +
      esc(report.status) +
      '">' +
      esc(report.status.replace('_', ' ')) +
      '</span>' +
      '</div>' +
      '</div>' +
      '<div class="report-meta mut">' +
      esc(report.category) +
      ' · ' +
      esc(report.severity) +
      ' · ' +
      esc(citizenName) +
      ' · ' +
      esc(areaLabel) +
      esc(collectorName) +
      '</div>' +
      '<div class="report-gps-status mut">' +
      (report.location_verified
        ? '🛰️ GPS metadata attached' +
          (report.location_accuracy
            ? ' (±' + Math.round(report.location_accuracy) + 'm)'
            : '')
        : '⚠️ Manual coordinates (GPS unverified)') +
      ' · ' +
      esc(submittedAt) +
      ' (' +
      hoursAgo +
      'h ago)' +
      '</div>' +
      photosHtml +
      (report.description
        ? '<p class="report-desc">' + esc(report.description) + '</p>'
        : '') +
      '<div class="report-card-footer">' +
      '<div class="report-links-bar">' +
      mapsLinkHtml +
      historyBtnHtml +
      '</div>' +
      renderHistorySection(report) +
      (isAdmin ? renderAdminManageControls(report) : '') +
      collectorActionsHtml +
      resolvedHtml +
      '</div>' +
      '</article>'
    );
  }

  GC.components.renderReportCard = renderReportCard;
})(window);
