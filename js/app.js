/**
 * Application Router, Role-Guard & Shell Renderer
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});

  function isTabAllowed(role, tabId) {
    var allowed = GC.config.allowedTabs[role] || ['home', 'notes', 'profile'];
    return allowed.indexOf(tabId) !== -1;
  }

  async function go(tabId) {
    GC.utils.camera.stopCam();
    GC.state.target = null;

    if (!GC.state.me) {
      return renderLogin();
    }

    // Strict client-side role route guard (backed by database RLS)
    if (!isTabAllowed(GC.state.me.role, tabId)) {
      GC.utils.dom.toast('⛔ Unauthorized section for your role.', 3500);
      GC.state.tab = 'home';
      render();
      return;
    }

    GC.state.tab = tabId;

    if (tabId === 'notes') {
      render();
      await GC.notifications.markAllRead();
      render();
    } else {
      render();
    }

    if (typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }

  async function manualRefresh() {
    if (!GC.state.me) return;
    try {
      await GC.state.refreshAll();
      GC.utils.dom.toast('🔄 Synced with Supabase', 2200);
      render();
    } catch (err) {
      GC.utils.dom.toast('⚠️ Sync failed: ' + (err.message || err), 4000);
    }
  }

  function renderLoading() {
    var root = GC.utils.dom.$('#app');
    if (!root) return;
    document.body.classList.add('is-login-view');
    document.body.classList.remove('is-app-view');
    root.innerHTML =
      '<main class="login-shell">' +
      '<div class="card empty-state" style="max-width:26rem;width:100%">' +
      '<div class="logo" style="margin:0 auto 1rem"><img src="assets/images/logo.svg" alt="" class="logo-img"></div>' +
      '<h3>Connecting to Garbage Collector…</h3>' +
      '<p class="mut" style="margin-top:0.4rem">Restoring secure Supabase session</p>' +
      '</div>' +
      '</main>';
  }

  function renderLogin() {
    var root = GC.utils.dom.$('#app');
    if (!root) return;
    document.body.classList.add('is-login-view');
    document.body.classList.remove('is-app-view');
    root.innerHTML = GC.pages.renderLoginPage();
  }

  function renderPageBody(user, tab, reports) {
    if (tab === 'home') {
      if (user.role === 'citizen') return GC.pages.renderCitizenDashboard(reports);
      if (user.role === 'collector') return GC.pages.renderCollectorOverview(reports);
      return GC.pages.renderAdminOverview(reports);
    }
    if (tab === 'report' && user.role === 'citizen') return GC.pages.renderReportPage();
    if (tab === 'mine' && user.role === 'citizen') return GC.pages.renderMyReportsPage(reports);
    if (tab === 'tasks' && user.role === 'collector') return GC.pages.renderCollectorTasks(reports);
    if (tab === 'reports' && user.role === 'admin') return GC.pages.renderAdminReports(reports);
    if (tab === 'map') {
      return GC.pages.renderHotspotsPage(reports);
    }
    if (tab === 'users' && user.role === 'admin') return GC.pages.renderUsersPage();
    if (tab === 'areas' && user.role === 'admin') return GC.pages.renderAreasPage();
    if (tab === 'profile') return GC.pages.renderProfilePage();
    if (tab === 'notes') return GC.pages.renderNotificationsPage();
    return GC.pages.renderCitizenDashboard(reports);
  }

  function render() {
    if (GC.state.loadingSession) {
      return renderLoading();
    }

    var me = GC.state.me;
    if (!me) {
      return renderLogin();
    }

    var root = GC.utils.dom.$('#app');
    if (!root) return;

    if (!isTabAllowed(me.role, GC.state.tab)) {
      GC.state.tab = 'home';
    }

    document.body.classList.remove('is-login-view');
    document.body.classList.add('is-app-view');

    var tab = GC.state.tab;
    var unread = GC.state.unreadCount();
    var reports = GC.state.visibleReports();

    var errorBanner = GC.state.dbError
      ? '<div class="card db-alert-banner" role="alert">' +
        '<strong>⚠️ Supabase Notice:</strong> ' +
        GC.utils.dom.esc(GC.state.dbError) +
        ' <button type="button" class="btn btn-alt btn-sm" onclick="GC.app.manualRefresh()">↻ Retry</button>' +
        '</div>'
      : '';

    var bodyHtml = errorBanner + renderPageBody(me, tab, reports);

    root.innerHTML =
      '<div class="app-shell">' +
      GC.components.renderSidebar(me, tab, unread) +
      '<div class="app-workspace">' +
      GC.components.renderHeader(me, tab, unread) +
      '<main class="app-main">' +
      '<div class="content-wrap">' +
      bodyHtml +
      '</div>' +
      '</main>' +
      '</div>' +
      GC.components.renderBottomNav(me, tab) +
      '</div>';

    if (tab === 'report') {
      GC.reports.bindReportView();
    }
    if (tab === 'map') {
      if (me.role === 'citizen') {
        GC.maps.mountCitizenMapPage();
      } else {
        GC.maps.mountDashboardReportsMap();
      }
    }
    if (GC.state.target) {
      GC.utils.camera.startCam('afterV');
    }
  }

  function init() {
    renderLoading();
    GC.auth.restoreSession();
  }

  GC.app = {
    go: go,
    manualRefresh: manualRefresh,
    render: render,
    renderLogin: renderLogin,
    init: init
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
