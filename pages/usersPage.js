/**
 * Admin Users, Role Management & Collector Area Assignment Page
 * Displays a responsive data table on tablet/desktop and touch-friendly cards on mobile.
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.pages = GC.pages || {};

  function renderRoleSelect(user) {
    var esc = GC.utils.dom.esc;
    var isSelf = GC.state.me && GC.state.me.id === user.id;
    return (
      '<select class="area-select" aria-label="Role for ' +
      esc(user.full_name) +
      '" ' +
      (isSelf ? 'disabled title="Cannot change your own role"' : '') +
      ' onchange="GC.users.changeUserRole(\'' +
      esc(user.id) +
      '\', this.value)">' +
      ['citizen', 'collector', 'admin']
        .map(function (r) {
          return (
            '<option value="' +
            r +
            '"' +
            (user.role === r ? ' selected' : '') +
            '>' +
            r +
            '</option>'
          );
        })
        .join('') +
      '</select>'
    );
  }

  function renderAreaSelect(user) {
    var esc = GC.utils.dom.esc;
    return (
      '<select class="area-select" aria-label="Assign area for ' +
      esc(user.full_name) +
      '" onchange="GC.users.assignCollectorArea(\'' +
      esc(user.id) +
      '\', this.value)">' +
      '<option value="">Unassigned (no area)</option>' +
      GC.state.areas
        .map(function (area) {
          var selected = user.assigned_area_id === area.id ? ' selected' : '';
          return (
            '<option value="' +
            esc(area.id) +
            '"' +
            selected +
            '>' +
            esc(area.area_name) +
            '</option>'
          );
        })
        .join('') +
      '</select>'
    );
  }

  function renderUsersPage() {
    var esc = GC.utils.dom.esc;
    var users = GC.state.profiles || [];
    var citizens = users.filter(function (u) { return u.role === 'citizen'; }).length;
    var collectors = users.filter(function (u) { return u.role === 'collector'; }).length;
    var admins = users.filter(function (u) { return u.role === 'admin'; }).length;

    var tableRows = users
      .map(function (u) {
        return (
          '<tr>' +
          '<td><strong>' +
          esc(u.full_name) +
          '</strong></td>' +
          '<td><div>' +
          esc(u.phone || 'No phone') +
          '</div>' +
          (u.email ? '<small class="mut">' + esc(u.email) + '</small>' : '') +
          '</td>' +
          '<td>' +
          renderRoleSelect(u) +
          '</td>' +
          '<td>' +
          (u.role === 'collector'
            ? renderAreaSelect(u)
            : '<span class="mut">—</span>') +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var mobileCards = users
      .map(function (u) {
        return (
          '<div class="card user-card-row">' +
          '<div class="user-card-info">' +
          '<strong>' +
          esc(u.full_name) +
          '</strong>' +
          '<div class="mut">' +
          esc(u.phone || 'No phone') +
          (u.email ? ' · ' + esc(u.email) : '') +
          '</div>' +
          '</div>' +
          '<div class="user-card-controls-stack">' +
          renderRoleSelect(u) +
          (u.role === 'collector' ? renderAreaSelect(u) : '') +
          '</div>' +
          '</div>'
        );
      })
      .join('');

    return (
      '<section class="page-section">' +
      '<div class="section-header">' +
      '<div>' +
      '<h3>👥 Registered Users &amp; Roles</h3>' +
      '<p class="mut">' +
      citizens +
      ' citizen(s) · ' +
      collectors +
      ' collector(s) · ' +
      admins +
      ' admin(s)</p>' +
      '</div>' +
      '<span class="badge IN_PROGRESS">' +
      users.length +
      ' total</span>' +
      '</div>' +
      '<div class="card table-card desktop-table-view">' +
      '<div class="table-responsive">' +
      '<table class="data-table">' +
      '<thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Assigned Service Area</th></tr></thead>' +
      '<tbody>' +
      tableRows +
      '</tbody>' +
      '</table>' +
      '</div>' +
      '</div>' +
      '<div class="mobile-cards-view">' +
      mobileCards +
      '</div>' +
      '</section>'
    );
  }

  GC.pages.renderUsersPage = renderUsersPage;
})(window);
