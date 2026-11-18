/**
 * Supabase Realtime Subscriptions + Lightweight Background Sync
 * Streams live notifications and report updates to connected dashboards.
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});

  var activeChannel = null;
  var refreshDebounce = null;
  var pollTimer = null;

  function scheduleDashboardRefresh() {
    clearTimeout(refreshDebounce);
    refreshDebounce = setTimeout(async function () {
      if (!GC.state.me) return;
      try {
        var prevUnread = GC.state.unreadCount();
        await GC.state.refreshReportsAndNotes();
        var nextUnread = GC.state.unreadCount();
        if (nextUnread > prevUnread && GC.state.notifications[0]) {
          var latest = GC.state.notifications[0];
          GC.utils.dom.toast(
            '🔔 ' + (latest.title ? latest.title + ': ' : '') + latest.message,
            5500
          );
        }
        if (GC.state.tab !== 'report' && GC.state.tab !== 'map' && !GC.state.target) {
          GC.app.render();
        }
      } catch (err) {
        // Ignore transient background refresh errors
      }
    }, 600);
  }

  function subscribe(user) {
    unsubscribe();
    if (!GC.supabase || !user || !user.id) return;

    activeChannel = GC.supabase
      .channel('gc-live-' + user.id)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: 'user_id=eq.' + user.id
        },
        function (payload) {
          var row = payload.new;
          if (!row) return;
          var exists = GC.state.notifications.some(function (n) {
            return n.id === row.id;
          });
          if (!exists) {
            GC.state.notifications.unshift(row);
          }
          GC.utils.dom.toast('🔔 ' + (row.title ? row.title + ': ' : '') + row.message, 6000);
          if (GC.state.tab !== 'report' && GC.state.tab !== 'map' && !GC.state.target) {
            GC.app.render();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reports'
        },
        function () {
          scheduleDashboardRefresh();
        }
      )
      .subscribe();

    // Lightweight visibility-aware polling fallback for simplified session logins
    pollTimer = setInterval(function () {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!GC.state.me || GC.state.busy || GC.state.tab === 'report' || GC.state.target) {
        return;
      }
      scheduleDashboardRefresh();
    }, 20000);
  }

  function unsubscribe() {
    clearTimeout(refreshDebounce);
    clearInterval(pollTimer);
    pollTimer = null;
    if (activeChannel && GC.supabase) {
      GC.supabase.removeChannel(activeChannel);
      activeChannel = null;
    }
  }

  GC.realtime = {
    subscribe: subscribe,
    unsubscribe: unsubscribe
  };
})(window);
