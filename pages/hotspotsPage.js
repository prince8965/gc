/**
 * Interactive Google Maps & Hotspot Management Page
 * Adapts to the logged-in user's role (strictly backed by Supabase RLS):
 * - Citizen: Report Location Map (GPS + manual click picker + own submitted reports)
 * - Collector: Assigned Reports Map (Red/Orange/Green priority pins + Directions + Details)
 * - Admin: All Reports Map & Hotspot Management (Status/Priority/Category/Area filters,
 *          marker clustering, hotspot concentration visualization, unresolved area counts)
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.pages = GC.pages || {};

  function renderSelectedReportCard(reportId) {
    var esc = GC.utils.dom.esc;
    if (!reportId) {
      return (
        '<div class="card map-selected-empty mut">' +
        'Tap any map marker or report item below to inspect details and open Google Maps directions.' +
        '</div>'
      );
    }
    var r = GC.state.findReport(reportId);
    if (!r) return '';

    var prio = GC.utils.priority.pl(r);
    var score = GC.utils.priority.prio(r);
    var areaLabel = (r.area && r.area.area_name) || GC.state.areaName(r.area_id);
    var dirsUrl =
      'https://www.google.com/maps/dir/?api=1&destination=' +
      encodeURIComponent(r.latitude) +
      ',' +
      encodeURIComponent(r.longitude);

    return (
      '<div class="card map-selected-card">' +
      '<div class="report-card-head">' +
      '<strong>' +
      esc(r.report_number) +
      '</strong>' +
      '<div class="badge-group">' +
      '<span class="badge ' +
      prio +
      '">' +
      esc(prio) +
      ' · ' +
      score +
      '</span>' +
      '<span class="badge ' +
      esc(r.status) +
      '">' +
      esc(r.status.replace('_', ' ')) +
      '</span>' +
      '</div>' +
      '</div>' +
      '<div class="mut">' +
      esc(r.category) +
      ' · Severity: ' +
      esc(r.severity) +
      ' · ' +
      esc(areaLabel) +
      '</div>' +
      '<div class="mut">📅 ' +
      esc(GC.utils.dom.formatDateTime(r.created_at)) +
      '</div>' +
      '<div class="mut">📍 ' +
      Number(r.latitude).toFixed(5) +
      ', ' +
      Number(r.longitude).toFixed(5) +
      '</div>' +
      '<div class="quick-links-row">' +
      '<button type="button" class="btn btn-sm" onclick="GC.maps.openReportDetails(\'' +
      esc(r.id) +
      '\')">View Details</button>' +
      '<a class="btn btn-alt btn-sm" target="_blank" rel="noopener noreferrer" href="' +
      dirsUrl +
      '">🧭 Open Directions</a>' +
      '</div>' +
      '</div>'
    );
  }

  function renderDetailDrawer() {
    var detailId = GC.maps.state.detailReportId;
    if (!detailId) return '';
    var report = GC.state.findReport(detailId);
    if (!report) return '';

    return (
      '<section id="map-detail-section" class="page-section">' +
      '<div class="section-header">' +
      '<h3>📋 Full Report Details</h3>' +
      '<button type="button" class="btn btn-alt btn-sm" onclick="GC.maps.closeReportDetails()">✕ Close details</button>' +
      '</div>' +
      '<div class="narrow-section">' +
      GC.components.renderReportCard(report) +
      '</div>' +
      '</section>'
    );
  }

  function renderLegendBar(isAdmin) {
    return (
      '<div class="map-legend mut">' +
      '<span><i class="legend-dot dot-high"></i> High Priority (Red)</span>' +
      '<span><i class="legend-dot dot-med"></i> Medium Priority (Orange)</span>' +
      '<span><i class="legend-dot dot-low"></i> Low Priority (Green)</span>' +
      '<span><i class="legend-dot dot-res"></i> Resolved</span>' +
      (isAdmin ? '<span class="legend-note">Clusters &amp; hotspot rings reflect live Supabase reports</span>' : '') +
      '</div>'
    );
  }

  function renderCitizenMapPage(reports) {
    var esc = GC.utils.dom.esc;
    var pin = GC.maps.state.citizenPin;
    var pos = GC.state.pos;
    var activeCoord = pin || (pos ? { lat: pos.latitude, lng: pos.longitude } : null);
    var readoutText = activeCoord
      ? '📍 Selected: ' +
        Number(activeCoord.lat).toFixed(5) +
        ', ' +
        Number(activeCoord.lng).toFixed(5)
      : '📍 Click anywhere on the map or tap My GPS Location';

    var sorted = GC.utils.priority.sorted(reports);
    var ownListHtml = sorted.length
      ? sorted
          .map(function (r) {
            var prio = GC.utils.priority.pl(r);
            return (
              '<div class="map-report-item' +
              (GC.maps.state.selectedReportId === r.id ? ' is-selected' : '') +
              '" data-report-id="' +
              esc(r.id) +
              '" onclick="GC.maps.openReportDetails(\'' +
              esc(r.id) +
              '\')">' +
              '<div class="pq-main">' +
              '<strong>' +
              esc(r.report_number) +
              '</strong>' +
              '<span class="mut">' +
              esc(r.category) +
              ' · ' +
              esc(r.status.replace('_', ' ')) +
              '</span>' +
              '</div>' +
              '<span class="badge ' +
              prio +
              '">' +
              esc(prio) +
              '</span>' +
              '</div>'
            );
          })
          .join('')
      : '<p class="mut">You have not submitted any reports yet.</p>';

    return (
      '<section class="page-section">' +
      '<div class="section-header">' +
      '<div>' +
      '<h3>🗺️ Report Location Map</h3>' +
      '<p class="mut">View your GPS position, pick a waste location on Google Maps, or track your submitted reports</p>' +
      '</div>' +
      '<div class="badge-group">' +
      '<button type="button" class="btn btn-alt btn-sm" onclick="GC.maps.centerCitizenGps()">🎯 My GPS Location</button>' +
      '<button type="button" id="citizen-use-pin-btn" class="btn btn-sm" ' +
      (activeCoord ? '' : 'disabled') +
      ' onclick="GC.maps.reportAtPinnedLocation()">📸 Report Here</button>' +
      '</div>' +
      '</div>' +
      '<div class="map-workspace">' +
      '<div class="card map-stage-card">' +
      '<div id="gc-citizen-gmap" class="gmap-canvas gmap-main-canvas" role="region" aria-label="Citizen interactive Google Map"></div>' +
      '<div class="gps-box" style="margin-top:0.75rem">' +
      '<span id="citizen-map-pin-readout" class="gps-readout">' +
      esc(readoutText) +
      '</span>' +
      '<button type="button" class="btn btn-sm" onclick="GC.maps.reportAtPinnedLocation()">Confirm &amp; Open Camera</button>' +
      '</div>' +
      renderLegendBar(false) +
      '</div>' +
      '<aside class="map-side-column">' +
      '<div id="map-selected-panel">' +
      renderSelectedReportCard(GC.maps.state.selectedReportId) +
      '</div>' +
      '<div class="card map-list-card">' +
      '<h4>🗂️ My Reports (' +
      sorted.length +
      ')</h4>' +
      '<div class="map-report-list">' +
      ownListHtml +
      '</div>' +
      '</div>' +
      '</aside>' +
      '</div>' +
      renderDetailDrawer() +
      '</section>'
    );
  }

  function renderAdminFilterBar() {
    var esc = GC.utils.dom.esc;
    var f = GC.maps.state.filters;

    var catOpts =
      '<option value="ALL">All categories</option>' +
      GC.config.categories
        .map(function (c) {
          return '<option value="' + esc(c) + '"' + (f.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
        })
        .join('');

    var areaOpts =
      '<option value="ALL">All service areas</option>' +
      '<option value="UNASSIGNED"' +
      (f.areaId === 'UNASSIGNED' ? ' selected' : '') +
      '>Unassigned</option>' +
      GC.state.areas
        .map(function (a) {
          return (
            '<option value="' +
            esc(a.id) +
            '"' +
            (f.areaId === a.id ? ' selected' : '') +
            '>' +
            esc(a.area_name) +
            '</option>'
          );
        })
        .join('');

    return (
      '<div class="card map-filters-card">' +
      '<div class="map-filters-grid">' +
      '<select aria-label="Filter by status" onchange="GC.maps.setFilter(\'status\', this.value)">' +
      '<option value="ALL"' + (f.status === 'ALL' ? ' selected' : '') + '>All statuses</option>' +
      '<option value="PENDING"' + (f.status === 'PENDING' ? ' selected' : '') + '>PENDING (incl. legacy OPEN)</option>' +
      '<option value="IN_PROGRESS"' + (f.status === 'IN_PROGRESS' ? ' selected' : '') + '>IN PROGRESS</option>' +
      '<option value="RESOLVED"' + (f.status === 'RESOLVED' ? ' selected' : '') + '>RESOLVED</option>' +
      '</select>' +
      '<select aria-label="Filter by priority" onchange="GC.maps.setFilter(\'priority\', this.value)">' +
      '<option value="ALL"' + (f.priority === 'ALL' ? ' selected' : '') + '>All priorities</option>' +
      '<option value="High"' + (f.priority === 'High' ? ' selected' : '') + '>High priority</option>' +
      '<option value="Medium"' + (f.priority === 'Medium' ? ' selected' : '') + '>Medium priority</option>' +
      '<option value="Low"' + (f.priority === 'Low' ? ' selected' : '') + '>Low priority</option>' +
      '</select>' +
      '<select aria-label="Filter by category" onchange="GC.maps.setFilter(\'category\', this.value)">' +
      catOpts +
      '</select>' +
      '<select aria-label="Filter by service area" onchange="GC.maps.setFilter(\'areaId\', this.value)">' +
      areaOpts +
      '</select>' +
      '</div>' +
      '<div class="map-toggles-row">' +
      '<button type="button" class="toggle-chip' +
      (f.showHotspots ? ' is-on' : '') +
      '" onclick="GC.maps.toggleFilter(\'showHotspots\')">🔥 Hotspots Overlay</button>' +
      '<button type="button" class="toggle-chip' +
      (f.useClustering ? ' is-on' : '') +
      '" onclick="GC.maps.toggleFilter(\'useClustering\')">📍 Marker Clustering</button>' +
      '<button type="button" class="toggle-chip' +
      (f.showAreas ? ' is-on' : '') +
      '" onclick="GC.maps.toggleFilter(\'showAreas\')">🗺️ Service Area Zones</button>' +
      '<button type="button" class="toggle-chip" onclick="GC.maps.resetFilters()">↺ Reset Filters</button>' +
      '</div>' +
      '</div>'
    );
  }

  function renderHotspotsPage(reports) {
    var me = GC.state.me;
    if (me && me.role === 'citizen') {
      return renderCitizenMapPage(reports);
    }

    var esc = GC.utils.dom.esc;
    var isAdmin = me && me.role === 'admin';
    var visibleList = isAdmin ? GC.maps.getFilteredReports(reports) : reports;
    var sorted = GC.utils.priority.sorted(visibleList);
    var validCount = sorted.filter(function (r) {
      return GC.components.googleMap.isValidCoord(r.latitude, r.longitude);
    }).length;
    var missingCoordCount = sorted.length - validCount;

    var active = sorted.filter(function (r) {
      return r.status !== 'RESOLVED';
    });
    var counts = { High: 0, Medium: 0, Low: 0 };
    active.forEach(function (r) {
      var lbl = GC.utils.priority.pl(r);
      counts[lbl] = (counts[lbl] || 0) + 1;
    });

    var hotspots = GC.components.googleMap.detectHotspotClusters(visibleList);
    var areaCounts = isAdmin
      ? GC.maps.getAreaUnresolvedCounts(reports, GC.state.areas)
      : [];

    var listHtml = sorted.length
      ? sorted
          .map(function (r) {
            var score = GC.utils.priority.prio(r);
            var lbl = GC.utils.priority.pl(r);
            var areaLbl = (r.area && r.area.area_name) || GC.state.areaName(r.area_id);
            var dirsUrl =
              'https://www.google.com/maps/dir/?api=1&destination=' +
              encodeURIComponent(r.latitude) +
              ',' +
              encodeURIComponent(r.longitude);

            return (
              '<div class="map-report-item' +
              (GC.maps.state.selectedReportId === r.id ? ' is-selected' : '') +
              '" data-report-id="' +
              esc(r.id) +
              '" onclick="GC.maps.selectReport(\'' +
              esc(r.id) +
              '\', true)">' +
              '<div class="pq-main">' +
              '<strong>' +
              esc(r.report_number) +
              '</strong>' +
              '<span class="mut">' +
              esc(r.category) +
              ' · ' +
              esc(areaLbl) +
              ' · ' +
              esc(r.status.replace('_', ' ')) +
              '</span>' +
              '</div>' +
              '<div class="pq-right">' +
              '<span class="badge ' +
              lbl +
              '">' +
              esc(lbl) +
              ' · ' +
              score +
              '</span>' +
              '<a class="maps-link-compact" target="_blank" rel="noopener noreferrer" href="' +
              dirsUrl +
              '" onclick="event.stopPropagation()" title="Open Directions in Google Maps">🧭</a>' +
              '</div>' +
              '</div>'
            );
          })
          .join('')
      : '<p class="mut">No reports match the current filters.</p>';

    var hotspotSummaryHtml = hotspots.length
      ? hotspots
          .map(function (h) {
            var firstId = h.reports[0].id;
            return (
              '<div class="hotspot-zone-row" onclick="GC.maps.selectReport(\'' +
              esc(firstId) +
              '\', true)">' +
              '<div class="pq-main">' +
              '<strong>🔥 ' +
              esc(h.areaName) +
              '</strong>' +
              '<span class="mut">' +
              h.lat.toFixed(4) +
              ', ' +
              h.lng.toFixed(4) +
              ' · ' +
              h.highCount +
              ' high-priority</span>' +
              '</div>' +
              '<span class="badge High">' +
              h.count +
              ' nearby</span>' +
              '</div>'
            );
          })
          .join('')
      : '<p class="mut">No multi-report unresolved clusters detected.</p>';

    var areaCountsHtml = areaCounts.length
      ? areaCounts
          .map(function (a) {
            return (
              '<div class="summary-row area-count-row" onclick="GC.maps.setFilter(\'areaId\', \'' +
              esc(a.id) +
              '\')">' +
              '<span>' +
              esc(a.name) +
              '</span>' +
              '<span class="badge ' +
              (a.unresolved >= 3 ? 'High' : a.unresolved > 0 ? 'Medium' : 'RESOLVED') +
              '">' +
              a.unresolved +
              ' unresolved</span>' +
              '</div>'
            );
          })
          .join('')
      : '<p class="mut">No service areas configured yet.</p>';

    return (
      '<section class="page-section">' +
      '<div class="section-header">' +
      '<div>' +
      '<h3>' +
      (isAdmin ? '🗺️ All Reports &amp; Hotspot Map' : '🗺️ Assigned Reports Map') +
      '</h3>' +
      '<p class="mut">' +
      validCount +
      ' marker(s) plotted from Supabase' +
      (missingCoordCount ? ' · ' + missingCoordCount + ' missing GPS coords' : '') +
      '</p>' +
      '</div>' +
      (!isAdmin
        ? '<button type="button" class="toggle-chip' +
          (GC.maps.state.filters.useClustering ? ' is-on' : '') +
          '" onclick="GC.maps.toggleFilter(\'useClustering\')">📍 Clustering</button>'
        : '') +
      '</div>' +
      (isAdmin ? renderAdminFilterBar() : '') +
      '<div class="map-workspace">' +
      '<div class="card map-stage-card">' +
      '<div id="gc-reports-gmap" class="gmap-canvas gmap-main-canvas" role="region" aria-label="Google Maps garbage report markers"></div>' +
      renderLegendBar(isAdmin) +
      '</div>' +
      '<aside class="map-side-column">' +
      '<div id="map-selected-panel">' +
      renderSelectedReportCard(GC.maps.state.selectedReportId) +
      '</div>' +
      '<div class="card">' +
      '<h4>🚩 Unresolved Priority Summary</h4>' +
      '<div class="priority-pills" style="margin-top:0.65rem;margin-bottom:0">' +
      '<div class="prio-stat prio-high"><small>High</small><b>' +
      counts.High +
      '</b></div>' +
      '<div class="prio-stat prio-med"><small>Medium</small><b>' +
      counts.Medium +
      '</b></div>' +
      '<div class="prio-stat prio-low"><small>Low</small><b>' +
      counts.Low +
      '</b></div>' +
      '</div>' +
      '</div>' +
      '<div class="card">' +
      '<h4>🔥 Urgent Hotspot Clusters (' +
      hotspots.length +
      ')</h4>' +
      '<div class="hotspot-zones-list">' +
      hotspotSummaryHtml +
      '</div>' +
      '</div>' +
      (isAdmin
        ? '<div class="card">' +
          '<h4>📍 Unresolved by Service Area</h4>' +
          '<div class="summary-list" style="margin-top:0.5rem">' +
          areaCountsHtml +
          '</div>' +
          '</div>'
        : '') +
      '<div class="card map-list-card">' +
      '<h4>📋 Reports on Map (' +
      sorted.length +
      ')</h4>' +
      '<div class="map-report-list">' +
      listHtml +
      '</div>' +
      '</div>' +
      '</aside>' +
      '</div>' +
      renderDetailDrawer() +
      '</section>'
    );
  }

  GC.pages.renderHotspotsPage = renderHotspotsPage;
  GC.pages.renderSelectedReportCard = renderSelectedReportCard;
})(window);
