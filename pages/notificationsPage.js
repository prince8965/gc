/**
 * Real-Time Notifications Page (Supabase notifications table)
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.pages = GC.pages || {};

  function renderNotificationsPage() {
    var esc = GC.utils.dom.esc;
    var me = GC.state.me;
    var isAdmin = me && me.role === 'admin';
    var list = GC.state.notifications || [];

    var adminToggle = isAdmin
      ? '<div class="badge-group">' +
        '<button type="button" class="btn btn-sm ' +
        (GC.state.adminNotifScope === 'mine' ? '' : 'btn-alt') +
        '" onclick="GC.notifications.setAdminScope(\'mine\')">My Alerts</button>' +
        '<button type="button" class="btn btn-sm ' +
        (GC.state.adminNotifScope === 'all' ? '' : 'btn-alt') +
        '" onclick="GC.notifications.setAdminScope(\'all\')">Monitor All</button>' +
        '</div>'
      : '<span class="mut">' + list.length + ' item(s)</span>';

    var itemsHtml = list.length
      ? list
          .map(function (n) {
            return (
              '<div class="card notif-card' +
              (n.is_read ? '' : ' is-unread') +
              '">' +
              '<div class="notif-title">' +
              esc(n.title || 'Update') +
              '</div>' +
              '<div class="notif-msg">' +
              esc(n.message) +
              '</div>' +
              '<div class="mut notif-time">' +
              GC.utils.dom.formatDateTime(n.created_at) +
              '</div>' +
              '</div>'
            );
          })
          .join('')
      : '<div class="card empty-state mut">No notifications yet. Real-time updates on reports and cleaning progress appear here automatically.</div>';

    return (
      '<section class="page-section narrow-section">' +
      '<div class="section-header">' +
      '<h3>🔔 Notifications</h3>' +
      adminToggle +
      '</div>' +
      '<div class="notif-list">' +
      itemsHtml +
      '</div>' +
      '</section>'
    );
  }

  GC.pages.renderNotificationsPage = renderNotificationsPage;
})(window);
