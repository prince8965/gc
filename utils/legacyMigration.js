/**
 * Legacy LocalStorage (gc_db) Non-Destructive Backup & Migration Helper
 * Detects old prototype data in localStorage without silently deleting it,
 * lets users export a JSON backup, or migrate areas/reports into Supabase.
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.utils = GC.utils || {};

  var CATEGORY_MAP = {
    'Overflowing dustbin': 'Overflowing Dustbin',
    'Roadside garbage': 'Roadside Garbage',
    'Illegal dumping': 'Illegal Dumping',
    'Plastic waste': 'Plastic Waste',
    Other: 'Other'
  };

  function getLegacyData() {
    try {
      var raw = localStorage.getItem(GC.config.legacyStorageKey);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      var hasAny =
        (Array.isArray(parsed.reports) && parsed.reports.length > 0) ||
        (Array.isArray(parsed.areas) && parsed.areas.length > 0) ||
        (Array.isArray(parsed.users) && parsed.users.length > 1);
      return hasAny ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  function downloadBackup() {
    var data = getLegacyData();
    if (!data) {
      return GC.utils.dom.toast('No legacy prototype data found.', 3000);
    }
    var blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'garbage-collector-legacy-backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    GC.utils.dom.toast('✅ Legacy backup JSON downloaded.', 3500);
  }

  async function migrateAreasToSupabase() {
    var data = getLegacyData();
    if (!data || !Array.isArray(data.areas) || !data.areas.length) {
      return GC.utils.dom.toast('No legacy service areas to migrate.', 3000);
    }
    if (!GC.state.me || GC.state.me.role !== 'admin') {
      return GC.utils.dom.toast('Admin login required to migrate service areas.', 3500);
    }
    var migrated = 0;
    for (var i = 0; i < data.areas.length; i++) {
      var a = data.areas[i];
      if (!a.name || isNaN(a.lat) || isNaN(a.lng) || !(a.km > 0)) continue;
      try {
        await GC.db.createServiceArea({
          area_name: a.name,
          latitude: Number(a.lat),
          longitude: Number(a.lng),
          radius: Number(a.km)
        });
        migrated++;
      } catch (err) {
        // Skip failed item and continue
      }
    }
    await GC.state.refreshAll();
    GC.utils.dom.toast('✅ Migrated ' + migrated + ' legacy service area(s) to Supabase.', 4000);
    GC.app.render();
  }

  async function migrateCitizenReportsToSupabase() {
    var data = getLegacyData();
    if (!data || !Array.isArray(data.reports) || !data.reports.length) {
      return GC.utils.dom.toast('No legacy reports to migrate.', 3000);
    }
    if (!GC.state.me || (GC.state.me.role !== 'citizen' && GC.state.me.role !== 'admin')) {
      return GC.utils.dom.toast('Sign in as a Citizen or Admin to migrate reports.', 3500);
    }
    var migrated = 0;
    for (var i = 0; i < data.reports.length; i++) {
      var r = data.reports[i];
      if (!r.before || isNaN(r.lat) || isNaN(r.lng)) continue;
      try {
        var blob = GC.utils.camera.dataUrlToBlob(r.before);
        var path = await GC.storage.uploadBeforePhoto(blob, GC.state.me.id);
        await GC.db.createReport({
          category: CATEGORY_MAP[r.cat] || 'Other',
          severity: ['Low', 'Medium', 'High'].indexOf(r.sev) >= 0 ? r.sev : 'Medium',
          description: r.desc || '',
          latitude: Number(r.lat),
          longitude: Number(r.lng),
          location_accuracy: r.acc || null,
          location_verified: !!r.ver,
          before_image_url: path
        });
        migrated++;
      } catch (err) {
        // Continue with next report
      }
    }
    await GC.state.refreshAll();
    GC.utils.dom.toast('✅ Migrated ' + migrated + ' legacy report(s) to Supabase Storage & DB.', 4500);
    GC.app.render();
  }

  function clearLegacyData() {
    if (
      typeof window.confirm === 'function' &&
      !window.confirm('Clear old browser LocalStorage prototype data? Download a backup first if needed.')
    ) {
      return;
    }
    localStorage.removeItem('gc_db');
    localStorage.removeItem('gc_me');
    GC.utils.dom.toast('Legacy browser prototype data cleared.', 3000);
    GC.app.render();
  }

  GC.utils.legacyMigration = {
    getLegacyData: getLegacyData,
    downloadBackup: downloadBackup,
    migrateAreasToSupabase: migrateAreasToSupabase,
    migrateCitizenReportsToSupabase: migrateCitizenReportsToSupabase,
    clearLegacyData: clearLegacyData
  };
})(window);
