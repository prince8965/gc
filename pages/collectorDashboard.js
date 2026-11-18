/**
 * Collector Dashboard & Assigned Tasks Pages
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.pages = GC.pages || {};

  function renderCollectorOverview(reports) {
    var esc = GC.utils.dom.esc;
    var me = GC.state.me;
    var areaLabel =
      me && me.assigned_area_id
        ? GC.state.areaName(me.assigned_area_id)
        : 'No Service Area Assigned';
    var topPending = GC.utils.priority
      .sorted(reports)
      .filter(function (r) {
        return r.status !== 'RESOLVED';
      })
      .slice(0, 3);

    var areaNotice =
      me && !me.assigned_area_id
        ? '<div class="card db-alert-banner" role="status">' +
          '<strong>📍 Service Area Not Assigned:</strong> ' +
          'Your collector account is not assigned to a service area yet. ' +
          'Please ask an Administrator to assign your area in the <em>Admin → Users</em> panel. ' +
          'Once assigned, citizen waste reports submitted in your area will appear here automatically.' +
          '</div>'
        : '';

    return (
      '<section class="hero h-collector hero-with-cta">' +
      '<div class="hero-copy">' +
      '<small class="hero-kicker">FIELD DASHBOARD</small>' +
      '<h1>' +
      esc(areaLabel) +
      '</h1>' +
      '<p>Clean high-priority spots first and upload after-cleaning verification photos.</p>' +
      '</div>' +
      '<div class="hero-cta-wrap">' +
      '<button type="button" class="btn btn-hero-light" onclick="GC.app.go(\'tasks\')">🧹 View All Tasks</button>' +
      '</div>' +
      '</section>' +
      areaNotice +
      GC.components.renderStatsGrid(reports, 'collector') +
      '<section class="page-section">' +
      '<div class="section-header">' +
      '<h3>🔥 High priority first</h3>' +
      '<button type="button" class="btn btn-alt btn-sm" onclick="GC.app.go(\'map\')">🗺️ Hotspots</button>' +
      '</div>' +
      (topPending.length
        ? '<div class="reports-grid">' +
          topPending.map(GC.components.renderReportCard).join('') +
          '</div>'
        : '<div class="card empty-state mut">All clear! No pending reports in your authorized service area.</div>') +
      '</section>'
    );
  }

  function renderCollectorTasks(reports) {
    var sorted = GC.utils.priority.sorted(reports);
    return (
      '<section class="page-section">' +
      '<div class="section-header">' +
      '<div>' +
      '<h3>🧹 Assigned Cleaning Tasks</h3>' +
      '<p class="mut">Scoped to your direct assignments and service area, sorted by priority</p>' +
      '</div>' +
      '<span class="badge IN_PROGRESS">' +
      sorted.length +
      ' total</span>' +
      '</div>' +
      (sorted.length
        ? '<div class="reports-grid">' +
          sorted.map(GC.components.renderReportCard).join('') +
          '</div>'
        : '<div class="card empty-state mut">No authorized tasks yet.</div>') +
      '</section>'
    );
  }

  GC.pages.renderCollectorOverview = renderCollectorOverview;
  GC.pages.renderCollectorTasks = renderCollectorTasks;
})(window);
