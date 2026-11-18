/**
 * Header Component
 * Renders responsive top bar across Mobile, Tablet, and Desktop viewports.
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.components = GC.components || {};

  var PAGE_TITLES = {
    home: { citizen: 'Citizen Dashboard', collector: 'Field Overview', admin: 'Operations Overview' },
    report: { citizen: 'Report Waste' },
    mine: { citizen: 'My Reports' },
    tasks: { collector: 'Assigned Tasks' },
    reports: { admin: 'All Waste Reports' },
    map: {
      citizen: 'Report Location Map',
      collector: 'Assigned Reports Map',
      admin: 'All Reports & Hotspot Map'
    },
    users: { admin: 'Users & Roles' },
    areas: { admin: 'Service Areas' },
    notes: { default: 'Notifications' },
    profile: { default: 'Profile & Settings' }
  };

  function getPageTitle(tab, role) {
    var entry = PAGE_TITLES[tab];
    if (!entry) return GC.config.appName;
    return entry[role] || entry.default || GC.config.appName;
  }

  function renderHeader(user, activeTab, unreadCount) {
    var esc = GC.utils.dom.esc;
    var navItems = GC.config.navigation[user.role] || [];
    var pageTitle = getPageTitle(activeTab, user.role);
    var roleInfo = GC.config.roles[user.role] || { label: user.role };
    var displayName = user.full_name || user.email || 'User';

    var tabletNavHtml =
      '<nav class="tablet-nav" aria-label="Primary navigation">' +
      navItems
        .map(function (item) {
          var activeCls = activeTab === item.id ? ' on' : '';
          return (
            '<button type="button" class="tablet-nav-btn' +
            activeCls +
            '" onclick="GC.app.go(\'' +
            item.id +
            '\')" aria-current="' +
            (activeTab === item.id ? 'page' : 'false') +
            '">' +
            '<span class="nav-ic" aria-hidden="true">' +
            item.icon +
            '</span>' +
            '<span>' +
            esc(item.label) +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</nav>';

    return (
      '<header class="app-header">' +
      '<div class="header-inner">' +
      '<div class="header-brand" onclick="GC.app.go(\'home\')" role="button" tabindex="0">' +
      '<div class="logo" aria-hidden="true">' +
      '<img src="assets/images/logo.svg" alt="" class="logo-img">' +
      '</div>' +
      '<div class="brand-text">' +
      '<h2 class="brand-title">' +
      esc(GC.config.appName) +
      '</h2>' +
      '<small class="brand-sub">' +
      esc(displayName) +
      ' · ' +
      esc(roleInfo.label) +
      '</small>' +
      '</div>' +
      '</div>' +
      '<div class="header-desktop-heading">' +
      '<h2 class="page-heading">' +
      esc(pageTitle) +
      '</h2>' +
      '<small class="brand-sub">' +
      esc(displayName) +
      ' · ' +
      esc(roleInfo.label) +
      '</small>' +
      '</div>' +
      tabletNavHtml +
      '<div class="header-actions">' +
      '<button type="button" class="icon-btn" onclick="GC.app.manualRefresh()" aria-label="Refresh data" title="Sync with Supabase">' +
      '<span aria-hidden="true">🔄</span>' +
      '</button>' +
      '<button type="button" class="icon-btn' +
      (activeTab === 'notes' ? ' is-active' : '') +
      '" onclick="GC.app.go(\'notes\')" aria-label="Notifications" title="Notifications">' +
      '<span aria-hidden="true">🔔</span>' +
      (unreadCount ? '<i class="notif-count">' + unreadCount + '</i>' : '') +
      '</button>' +
      '<button type="button" class="icon-btn profile-trigger' +
      (activeTab === 'profile' ? ' is-active' : '') +
      '" onclick="GC.app.go(\'profile\')" aria-label="Profile" title="Profile">' +
      '<span aria-hidden="true">👤</span>' +
      '<span class="profile-trigger-name">' +
      esc(displayName) +
      '</span>' +
      '</button>' +
      '</div>' +
      '</div>' +
      '</header>'
    );
  }

  GC.components.renderHeader = renderHeader;
})(window);
