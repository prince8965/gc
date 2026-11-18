/**
 * User Profile, Account Settings & Optional Legacy LocalStorage Migration Page
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.pages = GC.pages || {};

  function renderLegacyMigrationCard(me) {
    var legacy = GC.utils.legacyMigration.getLegacyData();
    if (!legacy) return '';

    var areaCount = Array.isArray(legacy.areas) ? legacy.areas.length : 0;
    var reportCount = Array.isArray(legacy.reports) ? legacy.reports.length : 0;

    return (
      '<section class="card legacy-migration-card">' +
      '<h3>📦 Legacy Prototype Data Detected</h3>' +
      '<p class="mut">Your browser still holds older LocalStorage prototype data (' +
      reportCount +
      ' report(s), ' +
      areaCount +
      ' area(s)). Nothing was deleted automatically. You can export a JSON backup or migrate compatible records into Supabase.</p>' +
      '<div class="quick-links-row">' +
      '<button type="button" class="btn btn-alt btn-sm" onclick="GC.utils.legacyMigration.downloadBackup()">⬇️ Download JSON backup</button>' +
      (me.role === 'admin' && areaCount
        ? '<button type="button" class="btn btn-sm" onclick="GC.utils.legacyMigration.migrateAreasToSupabase()">📍 Migrate areas</button>'
        : '') +
      ((me.role === 'citizen' || me.role === 'admin') && reportCount
        ? '<button type="button" class="btn btn-sm" onclick="GC.utils.legacyMigration.migrateCitizenReportsToSupabase()">📸 Migrate reports</button>'
        : '') +
      '<button type="button" class="btn btn-danger btn-sm" onclick="GC.utils.legacyMigration.clearLegacyData()">Clear old LocalStorage</button>' +
      '</div>' +
      '</section>'
    );
  }

  function renderProfilePage() {
    var esc = GC.utils.dom.esc;
    var me = GC.state.me;
    var roleInfo = GC.config.roles[me.role] || { icon: '👤', label: me.role };
    var myReports = GC.state.reports.filter(function (r) {
      return me.role === 'citizen'
        ? r.citizen_id === me.id
        : me.role === 'collector'
        ? r.assigned_collector_id === me.id
        : true;
    });

    return (
      '<div class="profile-layout">' +
      '<section class="card profile-hero-card">' +
      '<div class="profile-avatar" aria-hidden="true">' +
      roleInfo.icon +
      '</div>' +
      '<h2>' +
      esc(me.full_name) +
      '</h2>' +
      '<span class="badge IN_PROGRESS">' +
      esc(me.role) +
      '</span>' +
      '<div class="profile-details-list">' +
      '<div class="summary-row"><span class="mut">Phone Number</span><b>' +
      esc(me.phone || 'Not set') +
      '</b></div>' +
      (me.email
        ? '<div class="summary-row"><span class="mut">Email</span><b>' +
          esc(me.email) +
          '</b></div>'
        : '') +
      '<div class="summary-row"><span class="mut">Registered</span><b>' +
      esc(GC.utils.dom.formatDateTime(me.created_at)) +
      '</b></div>' +
      (me.role === 'collector'
        ? '<div class="summary-row"><span class="mut">Assigned Area</span><b>' +
          (me.assigned_area_id ? esc(GC.state.areaName(me.assigned_area_id)) : 'Not assigned') +
          '</b></div>'
        : '') +
      '<div class="summary-row"><span class="mut">Tracked Reports</span><b>' +
      myReports.length +
      '</b></div>' +
      '</div>' +
      '</section>' +
      '<div class="action-stack">' +
      '<section class="card profile-edit-card">' +
      '<h3>⚙️ Account settings</h3>' +
      '<div class="form-field">' +
      '<label for="pn">Full name</label>' +
      '<input id="pn" value="' +
      esc(me.full_name) +
      '">' +
      '</div>' +
      '<div class="form-field">' +
      '<label for="pp">Mobile number</label>' +
      '<input id="pp" type="tel" value="' +
      esc(me.phone || '') +
      '" placeholder="10-digit mobile or +91...">' +
      '</div>' +
      '<div class="action-stack">' +
      '<button type="button" class="btn btn-alt" onclick="GC.auth.updateProfile()">Save profile</button>' +
      '<button type="button" class="btn btn-danger" onclick="GC.auth.logout()">Logout</button>' +
      '</div>' +
      '</section>' +
      renderLegacyMigrationCard(me) +
      '</div>' +
      '</div>'
    );
  }

  GC.pages.renderProfilePage = renderProfilePage;
})(window);
