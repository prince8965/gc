/**
 * Citizen Dashboard Page
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.pages = GC.pages || {};

  function renderCitizenDashboard(reports) {
    var sorted = GC.utils.priority.sorted(reports);
    var recent = sorted.slice(0, 3);

    return (
      '<section class="hero h-citizen hero-with-cta">' +
      '<div class="hero-copy">' +
      '<small class="hero-kicker">MY CONTRIBUTION</small>' +
      '<h1>Make your city cleaner</h1>' +
      '<p>Report waste with a live geo-tagged photo.</p>' +
      '</div>' +
      '<div class="hero-cta-wrap">' +
      '<button type="button" class="btn btn-hero-light" onclick="GC.app.go(\'report\')">📸 Report Waste</button>' +
      '</div>' +
      '</section>' +
      GC.components.renderStatsGrid(reports, 'citizen') +
      '<div class="mobile-primary-cta">' +
      '<button type="button" class="btn" onclick="GC.app.go(\'report\')">📸 REPORT WASTE</button>' +
      '</div>' +
      '<section class="page-section">' +
      '<div class="section-header">' +
      '<h3>Recent reports</h3>' +
      (reports.length > 3
        ? '<button type="button" class="btn btn-alt btn-sm" onclick="GC.app.go(\'mine\')">View all (' +
          reports.length +
          ')</button>'
        : '') +
      '</div>' +
      (recent.length
        ? '<div class="reports-grid">' +
          recent.map(GC.components.renderReportCard).join('') +
          '</div>'
        : '<div class="card empty-state mut">No reports yet. Capture your first waste report to help keep your area clean.</div>') +
      '</section>'
    );
  }

  GC.pages.renderCitizenDashboard = renderCitizenDashboard;
})(window);
