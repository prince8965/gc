/**
 * Citizen "My Reports" Page
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.pages = GC.pages || {};

  function renderMyReportsPage(reports) {
    var sorted = GC.utils.priority.sorted(reports);

    return (
      '<section class="page-section">' +
      '<div class="section-header">' +
      '<div>' +
      '<h3>🗂️ My Submitted Reports</h3>' +
      '<p class="mut">Sorted with active and highest-priority reports first</p>' +
      '</div>' +
      '<button type="button" class="btn btn-sm" onclick="GC.app.go(\'report\')">📸 New report</button>' +
      '</div>' +
      (sorted.length
        ? '<div class="reports-grid">' +
          sorted.map(GC.components.renderReportCard).join('') +
          '</div>'
        : '<div class="card empty-state mut">No reports yet. Submit a geo-tagged report to see its status here.</div>') +
      '</section>'
    );
  }

  GC.pages.renderMyReportsPage = renderMyReportsPage;
})(window);
