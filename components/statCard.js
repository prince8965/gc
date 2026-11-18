/**
 * Stat Card Component
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.components = GC.components || {};

  function renderStatCard(icon, label, value, iconBg) {
    var esc = GC.utils.dom.esc;
    return (
      '<div class="stat-card">' +
      '<div class="stat-icon" style="background:' +
      iconBg +
      '" aria-hidden="true">' +
      icon +
      '</div>' +
      '<div class="stat-body">' +
      '<small class="stat-label">' +
      esc(label) +
      '</small>' +
      '<b class="stat-value">' +
      esc(value) +
      '</b>' +
      '</div>' +
      '</div>'
    );
  }

  function renderStatsGrid(reports, role) {
    var countByStatus = function (status) {
      return reports.filter(function (r) {
        return r.status === status;
      }).length;
    };
    var pendingCount = reports.filter(function (r) {
      return r.status === 'PENDING' || r.status === 'OPEN';
    }).length;
    var highPriorityCount = reports.filter(function (r) {
      return r.status !== 'RESOLVED' && GC.utils.priority.pl(r) === 'High';
    }).length;

    var items =
      role === 'admin'
        ? [
            ['🚛', 'Total reports', reports.length, '#ecfdf5'],
            ['🕒', 'Pending', pendingCount, '#fffbeb'],
            ['🚚', 'In progress', countByStatus('IN_PROGRESS'), '#eff6ff'],
            ['🚩', 'High priority', highPriorityCount, '#fef2f2'],
            ['✅', 'Resolved', countByStatus('RESOLVED'), '#ecfdf5'],
            ['👥', 'Total users', GC.state.profiles.length, '#f5f3ff']
          ]
        : [
            ['🚛', 'Total', reports.length, '#ecfdf5'],
            ['🕒', 'Pending', pendingCount, '#fffbeb'],
            ['🚚', 'In progress', countByStatus('IN_PROGRESS'), '#eff6ff'],
            ['🚩', 'High priority', highPriorityCount, '#fef2f2'],
            ['✅', 'Resolved', countByStatus('RESOLVED'), '#ecfdf5']
          ];

    return (
      '<div class="stats-grid stats-count-' +
      items.length +
      '">' +
      items
        .map(function (item) {
          return renderStatCard(item[0], item[1], item[2], item[3]);
        })
        .join('') +
      '</div>'
    );
  }

  GC.components.renderStatCard = renderStatCard;
  GC.components.renderStatsGrid = renderStatsGrid;
})(window);
