/**
 * Simple Login Page
 * Displays ONLY three role options (Citizen, Garbage Collector, Admin),
 * two input fields (User Name, Phone Number), and one LOGIN button.
 * No email, password, OTP, or verification codes.
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.pages = GC.pages || {};

  function renderLoginPage() {
    var esc = GC.utils.dom.esc;
    var ui = GC.state.authUI;
    var selectedRole = ui.role || 'citizen';
    var busy = GC.state.busy;

    var roleOptions = [
      { key: 'citizen', icon: '🧑', label: 'Citizen' },
      { key: 'collector', icon: '🚛', label: 'Garbage Collector' },
      { key: 'admin', icon: '🛡️', label: 'Admin' }
    ];

    var roleCardsHtml = roleOptions
      .map(function (r) {
        var isOn = selectedRole === r.key;
        return (
          '<button type="button" class="role-btn ' +
          r.key +
          (isOn ? ' on' : '') +
          '" onclick="GC.auth.selectRole(\'' +
          r.key +
          '\')" aria-pressed="' +
          (isOn ? 'true' : 'false') +
          '">' +
          '<b aria-hidden="true">' +
          r.icon +
          '</b>' +
          '<span>' +
          esc(r.label) +
          '</span>' +
          '</button>'
        );
      })
      .join('');

    var roleInfo = GC.config.roles[selectedRole] || GC.config.roles.citizen;
    var roleHint =
      selectedRole === 'admin'
        ? 'Admin login is restricted to pre-authorized administrator phone numbers provisioned via database setup.'
        : 'New ' +
          roleInfo.label +
          ' accounts are created automatically on first login. Each phone number is bound to one role.';

    var btnCls =
      selectedRole === 'collector'
        ? 'btn btn-collector'
        : selectedRole === 'admin'
        ? 'btn btn-admin'
        : 'btn';

    return (
      '<main class="login-shell">' +
      '<div class="login-container">' +
      '<section class="hero h-' +
      esc(selectedRole) +
      ' login-hero">' +
      '<div class="login-hero-top">' +
      '<div class="login-brand-badge">' +
      '<img src="assets/images/logo.svg" alt="" class="logo-img">' +
      '<span>GEOCAMERA + GPS + MAPS</span>' +
      '</div>' +
      '<small class="hero-kicker">WELCOME</small>' +
      '<h1>🗑️ ' +
      esc(GC.config.appName) +
      '</h1>' +
      '<p class="hero-lead">Cleaner streets. Smarter operations.</p>' +
      '<p class="login-role-desc">' +
      esc(roleInfo.description) +
      '</p>' +
      '</div>' +
      '<ul class="login-highlights" aria-label="System highlights">' +
      '<li><span>📸</span> GeoCamera capture with cloud image storage</li>' +
      '<li><span>🗺️</span> Interactive Google Maps &amp; GPS precision</li>' +
      '<li><span>🔥</span> Automatic priority, hotspots &amp; before/after proof</li>' +
      '</ul>' +
      '</section>' +
      '<section class="card login-card" aria-label="Login">' +
      '<div class="login-card-header">' +
      '<h2>Login</h2>' +
      '<p class="mut">Select your role and enter your name and phone number</p>' +
      '</div>' +
      '<form onsubmit="GC.auth.login(event)">' +
      '<div class="form-field">' +
      '<span class="field-label">Select Role</span>' +
      '<div class="roles-grid">' +
      roleCardsHtml +
      '</div>' +
      '</div>' +
      '<div class="form-field">' +
      '<label for="login-name">User Name</label>' +
      '<input id="login-name" type="text" required minlength="2" placeholder="Enter your full name" value="' +
      esc(ui.fullName || '') +
      '" autocomplete="name">' +
      '</div>' +
      '<div class="form-field">' +
      '<label for="login-phone">Phone Number</label>' +
      '<input id="login-phone" type="tel" required inputmode="numeric" maxlength="15" placeholder="10-digit phone number" value="' +
      esc(ui.phone || '') +
      '" autocomplete="tel">' +
      '</div>' +
      '<button type="submit" class="' +
      btnCls +
      '" ' +
      (busy ? 'disabled' : '') +
      '>' +
      (busy ? 'Logging in…' : 'LOGIN') +
      '</button>' +
      '</form>' +
      '<p class="mut login-hint">' +
      esc(roleHint) +
      '</p>' +
      '<p class="mut login-demo-disclaimer">ℹ️ Simplified demonstration login (no password or OTP). Anyone with a registered phone number can access that profile; use full authentication for production deployments.</p>' +
      '</section>' +
      '</div>' +
      '</main>'
    );
  }

  GC.pages.renderLoginPage = renderLoginPage;
})(window);
