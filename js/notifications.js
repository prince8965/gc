/**
 * Notifications Controller
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});

  async function markAllRead() {
    if (!GC.state.me) return;
    var hasUnread = GC.state.notifications.some(function (n) {
      return n.user_id === GC.state.me.id && !n.is_read;
    });
    if (!hasUnread) return;

    try {
      await GC.db.markNotificationsRead(GC.state.me.id);
      GC.state.notifications.forEach(function (n) {
        if (n.user_id === GC.state.me.id) n.is_read = true;
      });
    } catch (err) {
      // Keep UI responsive even if mark-read fails transiently
    }
  }

  async function refresh() {
    if (!GC.state.me) return;
    GC.state.notifications = await GC.db.fetchNotifications(
      GC.state.me.id,
      GC.state.me.role === 'admin' && GC.state.adminNotifScope === 'all'
    );
    GC.app.render();
  }

  async function setAdminScope(scope) {
    GC.state.adminNotifScope = scope === 'all' ? 'all' : 'mine';
    try {
      await refresh();
    } catch (err) {
      GC.utils.dom.toast('Failed to load notifications: ' + err.message, 4000);
    }
  }

  GC.notifications = {
    markAllRead: markAllRead,
    refresh: refresh,
    setAdminScope: setAdminScope
  };
})(window);
