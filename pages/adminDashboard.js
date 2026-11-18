/**
 * Admin Dashboard & All Reports Management Pages
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.pages = GC.pages || {};

  function renderCategoryAnalytics(reports) {
    var esc = GC.utils.dom.esc;
    var counts = {};
    reports.forEach(function (r) {
      counts[r.category] = (counts[r.category] || 0) + 1;
    });

    var values = Object.keys(counts).map(function (k) {
      return counts[k];
    });
    var maxCount = Math.max.apply(null, [1].concat(values));

    var resolved = reports.filter(function (r) {
      return r.status === 'RESOLVED' && r.resolved_at;
    });
    var avgHours = resolved.length
      ? (
          resolved.reduce(function (sum, r) {
            return sum + Math.max(0, Date.parse(r.resolved_at) - Date.parse(r.created_at));
          }, 0) /
          resolved.length /
          36e5
        ).toFixed(1) + ' h'
      : '–';

    var barsHtml = Object.keys(counts)
      .map(function (cat) {
        var count = counts[cat];
        var pct = Math.round((count / maxCount) * 100);
        return (
          '<div class="bar-item">' +
          '<div class="bar-label-row">' +
          '<span>' +
          esc(cat) +
          '</span>' +
          '<strong>' +
          count +
          '</strong>' +
          '</div>' +
          '<div class="bar-track">' +
          '<div class="bar-fill" style="width:' +
          pct +
          '%"></div>' +
          '</div>' +
          '</div>'
        );
      })
      .join('');

    var unassignedCount = reports.filter(function (r) {
      return !r.area_id && r.status !== 'RESOLVED';
    }).length;
    var collectorCount = GC.state.profiles.filter(function (u) {
      return u.role === 'collector';
    }).length;
    var citizenCount = GC.state.profiles.filter(function (u) {
      return u.role === 'citizen';
    }).length;

    return (
      '<div class="analytics-grid">' +
      '<div class="card analytics-card">' +
      '<h3>📊 Reports by category</h3>' +
      (barsHtml || '<p class="mut">No report data yet</p>') +
      '<p class="avg-resolution">⏱️ Average resolution time: <b>' +
      avgHours +
      '</b></p>' +
      '</div>' +
      '<div class="card analytics-card">' +
      '<h3>🧭 Operations summary</h3>' +
      '<div class="summary-list">' +
      '<div class="summary-row"><span class="mut">Active service areas</span><b>' +
      GC.state.areas.length +
      '</b></div>' +
      '<div class="summary-row"><span class="mut">Registered collectors</span><b>' +
      collectorCount +
      '</b></div>' +
      '<div class="summary-row"><span class="mut">Registered citizens</span><b>' +
      citizenCount +
      '</b></div>' +
      '<div class="summary-row"><span class="mut">Unassigned active reports</span><b>' +
      unassignedCount +
      '</b></div>' +
      '</div>' +
      '<div class="quick-links-row">' +
      '<button type="button" class="btn btn-alt btn-sm" onclick="GC.app.go(\'areas\')">📍 Manage areas</button>' +
      '<button type="button" class="btn btn-alt btn-sm" onclick="GC.app.go(\'users\')">👥 Manage users</button>' +
      '<button type="button" class="btn btn-sm" onclick="GC.app.go(\'reports\')">🗑️ Review reports</button>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function renderAdminOverview(reports) {
    return (
      '<section class="hero h-admin hero-with-cta">' +
      '<div class="hero-copy">' +
      '<small class="hero-kicker">OPERATIONS OVERVIEW</small>' +
      '<h1>City waste at a glance</h1>' +
      '<p>Live Supabase metrics from citizens, collectors, and service areas.</p>' +
      '</div>' +
      '<div class="hero-cta-wrap">' +
      '<button type="button" class="btn btn-hero-light" onclick="GC.app.go(\'map\')">🗺️ View Hotspots</button>' +
      '</div>' +
      '</section>' +
      GC.components.renderStatsGrid(reports, 'admin') +
      renderCategoryAnalytics(reports)
    );
  }

  function renderAdminReports(reports) {
    var sorted = GC.utils.priority.sorted(reports);
    return (
      '<section class="page-section">' +
      '<div class="section-header">' +
      '<div>' +
      '<h3>🗑️ All Waste Reports</h3>' +
      '<p class="mut">Assign areas &amp; collectors, manage priority, inspect before/after proof and status history</p>' +
      '</div>' +
      '<span class="badge IN_PROGRESS">' +
      sorted.length +
      ' total</span>' +
      '</div>' +
      (sorted.length
        ? '<div class="reports-grid">' +
          sorted.map(GC.components.renderReportCard).join('') +
          '</div>'
        : '<div class="card empty-state mut">No reports submitted yet.</div>') +
      '</section>'
    );
  }

  GC.pages.renderAdminOverview = renderAdminOverview;
  GC.pages.renderAdminReports = renderAdminReports;
})(window);
