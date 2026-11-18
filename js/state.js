/**
 * Central Application State (In-Memory Cache Synchronized with Supabase)
 * LocalStorage is NO LONGER used as the database.
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});

  var state = {
    me: null, // Authenticated user's row from public.profiles
    session: null,
    reports: [],
    areas: [],
    profiles: [], // Loaded for admins
    notifications: [],
    historyByReportId: {},
    expandedHistoryId: null,
    editingAreaId: null,
    adminNotifScope: 'mine',
    tab: 'home',
    busy: false,
    loadingSession: true,
    dbError: null,
    draft: {
      sev: 'Medium',
      cat: 'Overflowing Dustbin',
      desc: '',
      blob: null,
      previewUrl: null,
      lat: null,
      lng: null,
      acc: null,
      ver: false,
      locationConfirmed: false
    },
    pos: null,
    target: null, // Report currently capturing after-cleaning photo
    authUI: {
      role: 'citizen',
      fullName: '',
      phone: ''
    }
  };

  function areaName(areaId) {
    if (!areaId) return 'Unassigned';
    var found = state.areas.find(function (a) {
      return a.id === areaId;
    });
    return found ? found.area_name : 'Unassigned';
  }

  function unreadCount() {
    if (!state.me) return 0;
    return state.notifications.filter(function (n) {
      return n.user_id === state.me.id && !n.is_read;
    }).length;
  }

  function visibleReports() {
    // Database RLS already scopes reports per role; keep array directly
    return state.reports;
  }

  function findReport(reportId) {
    return state.reports.find(function (r) {
      return r.id === reportId;
    });
  }

  function resetDraft() {
    if (state.draft.previewUrl && state.draft.previewUrl.indexOf('blob:') === 0) {
      try {
        URL.revokeObjectURL(state.draft.previewUrl);
      } catch (e) {}
    }
    state.draft = {
      sev: 'Medium',
      cat: GC.config.categories[0],
      desc: '',
      blob: null,
      previewUrl: null,
      lat: null,
      lng: null,
      acc: null,
      ver: false,
      locationConfirmed: false
    };
  }

  function clearUserData() {
    state.me = null;
    state.session = null;
    state.reports = [];
    state.areas = [];
    state.profiles = [];
    state.notifications = [];
    state.historyByReportId = {};
    state.expandedHistoryId = null;
    state.editingAreaId = null;
    state.target = null;
    state.dbError = null;
    resetDraft();
    if (GC.storage) GC.storage.clearCache();
  }

  async function refreshReportsAndNotes() {
    if (!state.me) return;
    var results = await Promise.all([
      GC.db.fetchReports(),
      GC.db.fetchNotifications(
        state.me.id,
        state.me.role === 'admin' && state.adminNotifScope === 'all'
      )
    ]);
    state.reports = results[0];
    state.notifications = results[1];
    await GC.storage.preloadReportImageUrls(state.reports);
  }

  async function refreshAll() {
    if (!state.me) return;
    state.dbError = null;
    try {
      var tasks = [
        GC.db.fetchServiceAreas(),
        GC.db.fetchReports(),
        GC.db.fetchNotifications(
          state.me.id,
          state.me.role === 'admin' && state.adminNotifScope === 'all'
        )
      ];
      if (state.me.role === 'admin') {
        tasks.push(GC.db.fetchAllProfiles());
      }
      var res = await Promise.all(tasks);
      state.areas = res[0];
      state.reports = res[1];
      state.notifications = res[2];
      if (state.me.role === 'admin') {
        state.profiles = res[3] || [];
      } else {
        state.profiles = [];
      }
      await GC.storage.preloadReportImageUrls(state.reports);
    } catch (err) {
      state.dbError = err && err.message ? err.message : 'Failed to load data from Supabase.';
      throw err;
    }
  }

  state.areaName = areaName;
  state.unreadCount = unreadCount;
  state.visibleReports = visibleReports;
  state.findReport = findReport;
  state.resetDraft = resetDraft;
  state.clearUserData = clearUserData;
  state.refreshReportsAndNotes = refreshReportsAndNotes;
  state.refreshAll = refreshAll;

  GC.state = state;
})(window);
