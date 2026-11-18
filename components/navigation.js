/**
 * Navigation Components
 * - Desktop Sidebar (laptop & desktop screens)
 * - Mobile Bottom Tab Bar (mobile screens)
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.components = GC.components || {};

  function renderSidebar(user, activeTab, unreadCount) {
    var esc = GC.utils.dom.esc;
    var navItems = GC.config.navigation[user.role] || [];
    var roleInfo = GC.config.roles[user.role] || { icon: '👤', label: user.role };
    var displayName = user.full_name || user.email || 'User';
    var subContact = user.phone || user.email || '';

    var navLinks = navItems
      .map(function (item) {
        var isOn = activeTab === item.id;
        return (
          '<button type="button" class="sidebar-link' +
          (isOn ? ' on' : '') +
          '" onclick="GC.app.go(\'' +
          item.id +
          '\')" aria-current="' +
          (isOn ? 'page' : 'false') +
          '">' +
          '<span class="sidebar-ic" aria-hidden="true">' +
          item.icon +
          '</span>' +
          '<span class="sidebar-label">' +
          esc(item.label) +
          '</span>' +
          '</button>'
        );
      })
      .join('');

    return (
      '<aside class="app-sidebar" aria-label="Sidebar navigation">' +
      '<div class="sidebar-brand" onclick="GC.app.go(\'home\')" role="button" tabindex="0">' +
      '<div class="logo" aria-hidden="true">' +
      '<img src="assets/images/logo.svg" alt="" class="logo-img">' +
      '</div>' +
      '<div class="sidebar-brand-text">' +
      '<strong>' +
      esc(GC.config.appName) +
      '</strong>' +
      '<small>Supabase · GeoCamera</small>' +
      '</div>' +
      '</div>' +
      '<div class="sidebar-role-pill role-pill-' +
      esc(user.role) +
      '">' +
      '<span aria-hidden="true">' +
      roleInfo.icon +
      '</span>' +
      '<span>' +
      esc(roleInfo.label) +
      ' Workspace</span>' +
      '</div>' +
      '<nav class="sidebar-nav">' +
      '<div class="sidebar-section-label">Menu</div>' +
      navLinks +
      '<div class="sidebar-section-label">Account</div>' +
      '<button type="button" class="sidebar-link' +
      (activeTab === 'notes' ? ' on' : '') +
      '" onclick="GC.app.go(\'notes\')">' +
      '<span class="sidebar-ic" aria-hidden="true">🔔</span>' +
      '<span class="sidebar-label">Notifications</span>' +
      (unreadCount
        ? '<span class="sidebar-badge">' + unreadCount + '</span>'
        : '') +
      '</button>' +
      '<button type="button" class="sidebar-link' +
      (activeTab === 'profile' ? ' on' : '') +
      '" onclick="GC.app.go(\'profile\')">' +
      '<span class="sidebar-ic" aria-hidden="true">👤</span>' +
      '<span class="sidebar-label">Profile</span>' +
      '</button>' +
      '</nav>' +
      '<div class="sidebar-footer">' +
      '<div class="sidebar-user">' +
      '<div class="sidebar-user-avatar" aria-hidden="true">' +
      roleInfo.icon +
      '</div>' +
      '<div class="sidebar-user-meta">' +
      '<b>' +
      esc(displayName) +
      '</b>' +
      '<small>' +
      esc(subContact) +
      '</small>' +
      '</div>' +
      '</div>' +
      '<button type="button" class="sidebar-logout" onclick="GC.auth.logout()" title="Logout">Logout</button>' +
      '</div>' +
      '</aside>'
    );
  }

  function renderBottomNav(user, activeTab) {
    var esc = GC.utils.dom.esc;
    var navItems = GC.config.navigation[user.role] || [];

    return (
      '<nav class="bottom-nav" aria-label="Bottom navigation">' +
      navItems
        .map(function (item) {
          var isOn = activeTab === item.id;
          return (
            '<button type="button" class="bottom-nav-btn' +
            (isOn ? ' on' : '') +
            '" onclick="GC.app.go(\'' +
            item.id +
            '\')" aria-current="' +
            (isOn ? 'page' : 'false') +
            '">' +
            '<b aria-hidden="true">' +
            item.icon +
            '</b>' +
            '<span>' +
            esc(item.label) +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</nav>'
    );
  }

  GC.components.renderSidebar = renderSidebar;
  GC.components.renderBottomNav = renderBottomNav;
})(window);
