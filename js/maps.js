/**
 * Interactive Maps & Hotspot Management Controller
 * Connects Citizen location picking, Collector report markers & directions,
 * and Admin multi-filtering & hotspot analysis to Google Maps + Supabase reports.
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});

  var mapState = {
    filters: {
      status: 'ALL',
      priority: 'ALL',
      category: 'ALL',
      areaId: 'ALL',
      showHotspots: true,
      useClustering: true,
      showAreas: true
    },
    selectedReportId: null,
    detailReportId: null,
    citizenPin: null // { lat, lng, source } for standalone Citizen Report Map tab
  };

  function getFilteredReports(reports) {
    var f = mapState.filters;
    return (reports || []).filter(function (r) {
      if (f.status === 'PENDING') {
        if (r.status !== 'PENDING' && r.status !== 'OPEN') return false;
      } else if (f.status !== 'ALL' && r.status !== f.status) {
        return false;
      }
      if (f.priority !== 'ALL' && GC.utils.priority.pl(r) !== f.priority) return false;
      if (f.category !== 'ALL' && r.category !== f.category) return false;
      if (f.areaId === 'UNASSIGNED' && r.area_id) return false;
      if (f.areaId !== 'ALL' && f.areaId !== 'UNASSIGNED' && r.area_id !== f.areaId) {
        return false;
      }
      return true;
    });
  }

  function getAreaUnresolvedCounts(reports, areas) {
    var counts = {};
    var unassigned = 0;

    (reports || []).forEach(function (r) {
      if (r.status === 'RESOLVED') return;
      if (r.area_id) {
        counts[r.area_id] = (counts[r.area_id] || 0) + 1;
      } else {
        unassigned++;
      }
    });

    var list = (areas || []).map(function (a) {
      return {
        id: a.id,
        name: a.area_name,
        unresolved: counts[a.id] || 0
      };
    });

    if (unassigned > 0) {
      list.push({ id: 'UNASSIGNED', name: 'Unassigned Area', unresolved: unassigned });
    }

    return list.sort(function (a, b) {
      return b.unresolved - a.unresolved;
    });
  }

  function setFilter(key, value) {
    mapState.filters[key] = value;
    mapState.selectedReportId = null;
    GC.app.render();
  }

  function toggleFilter(key) {
    mapState.filters[key] = !mapState.filters[key];
    GC.app.render();
  }

  function resetFilters() {
    mapState.filters.status = 'ALL';
    mapState.filters.priority = 'ALL';
    mapState.filters.category = 'ALL';
    mapState.filters.areaId = 'ALL';
    mapState.selectedReportId = null;
    GC.app.render();
  }

  function selectReport(reportId, focusOnMap) {
    mapState.selectedReportId = reportId;
    var inst = GC.components.googleMap.getInstance('gc-reports-gmap');
    if (focusOnMap && inst && typeof inst.focusReport === 'function') {
      inst.focusReport(reportId);
    }
    // Update selected preview card cleanly without resetting the Google Map viewport
    var panel = GC.utils.dom.$('#map-selected-panel');
    if (panel) {
      panel.innerHTML = GC.pages.renderSelectedReportCard(reportId);
    }
    var listItems = GC.utils.dom.$$('.map-report-item');
    listItems.forEach(function (el) {
      el.classList.toggle('is-selected', el.getAttribute('data-report-id') === reportId);
    });
  }

  function openReportDetails(reportId) {
    mapState.selectedReportId = reportId;
    mapState.detailReportId = reportId;
    GC.app.render();
    var el = GC.utils.dom.$('#map-detail-section');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function closeReportDetails() {
    mapState.detailReportId = null;
    GC.app.render();
  }

  /**
   * Mounts Citizen Location Picker inside the Report Waste page
   */
  async function mountReportFormMap() {
    var draft = GC.state.draft;
    var pos = GC.state.pos;

    var inst = await GC.components.googleMap.mountLocationPicker('report-location-map', {
      selectedLat: draft.lat,
      selectedLng: draft.lng,
      gpsLat: pos ? pos.latitude : null,
      gpsLng: pos ? pos.longitude : null,
      gpsAccuracy: pos ? pos.accuracy : null,
      onSelect: function (loc) {
        GC.reports.selectMapLocation(loc.lat, loc.lng, false);
      }
    });

    if (inst && pos && draft.lat == null) {
      inst.placeSelectionMarker(pos.latitude, pos.longitude, true);
    }
  }

  /**
   * Mounts the dedicated Citizen Report Map page
   */
  async function mountCitizenMapPage() {
    var pos = GC.state.pos;
    if (!pos) {
      try {
        pos = await GC.utils.geo.getPos();
        GC.state.pos = pos;
      } catch (err) {
        pos = null;
      }
    }

    var pin = mapState.citizenPin;
    await GC.components.googleMap.mountLocationPicker('gc-citizen-gmap', {
      selectedLat: pin ? pin.lat : pos ? pos.latitude : null,
      selectedLng: pin ? pin.lng : pos ? pos.longitude : null,
      gpsLat: pos ? pos.latitude : null,
      gpsLng: pos ? pos.longitude : null,
      gpsAccuracy: pos ? pos.accuracy : null,
      ownReports: GC.state.visibleReports(),
      onSelect: function (loc) {
        mapState.citizenPin = { lat: loc.lat, lng: loc.lng, source: 'map' };
        var box = GC.utils.dom.$('#citizen-map-pin-readout');
        if (box) {
          box.textContent =
            '📍 Selected: ' + loc.lat.toFixed(5) + ', ' + loc.lng.toFixed(5);
        }
        var cta = GC.utils.dom.$('#citizen-use-pin-btn');
        if (cta) cta.disabled = false;
      },
      onReportClick: function (reportId) {
        mapState.selectedReportId = reportId;
        var panel = GC.utils.dom.$('#map-selected-panel');
        if (panel) {
          panel.innerHTML = GC.pages.renderSelectedReportCard(reportId);
        }
      }
    });
  }

  async function centerCitizenGps() {
    try {
      var pos = await GC.utils.geo.getPos();
      GC.state.pos = pos;
      mapState.citizenPin = {
        lat: pos.latitude,
        lng: pos.longitude,
        acc: pos.accuracy,
        source: 'gps'
      };
      var inst = GC.components.googleMap.getInstance('gc-citizen-gmap');
      if (inst) {
        inst.setGpsIndicator(pos.latitude, pos.longitude, pos.accuracy);
        inst.placeSelectionMarker(pos.latitude, pos.longitude, true);
      }
      var box = GC.utils.dom.$('#citizen-map-pin-readout');
      if (box) {
        box.textContent =
          '📍 Current GPS: ' +
          pos.latitude.toFixed(5) +
          ', ' +
          pos.longitude.toFixed(5) +
          ' (±' +
          Math.round(pos.accuracy) +
          'm)';
      }
      var cta = GC.utils.dom.$('#citizen-use-pin-btn');
      if (cta) cta.disabled = false;
      GC.utils.dom.toast('🎯 Centered on your GPS location', 2500);
    } catch (err) {
      GC.utils.dom.toast(
        '⚠️ GPS unavailable (' +
          GC.utils.geo.getGpsErrorMessage(err) +
          '). Click anywhere on the map to pick a spot manually.',
        4500
      );
    }
  }

  function reportAtPinnedLocation() {
    var pin = mapState.citizenPin;
    if (!pin && GC.state.pos) {
      pin = {
        lat: GC.state.pos.latitude,
        lng: GC.state.pos.longitude,
        acc: GC.state.pos.accuracy,
        source: 'gps'
      };
    }
    if (!pin) {
      return GC.utils.dom.toast('Click on the map or tap My GPS Location first.', 3500);
    }
    GC.state.draft.lat = pin.lat;
    GC.state.draft.lng = pin.lng;
    GC.state.draft.acc = pin.acc || null;
    GC.state.draft.ver = pin.source === 'gps';
    GC.state.draft.locationConfirmed = true;
    GC.utils.dom.toast('✅ Location selected for your report!', 2800);
    GC.app.go('report');
  }

  /**
   * Mounts Collector or Admin Multi-Marker Reports & Hotspots Map
   */
  async function mountDashboardReportsMap() {
    var me = GC.state.me;
    if (!me) return;

    var allReports = GC.state.visibleReports();
    var filtered = me.role === 'admin' ? getFilteredReports(allReports) : allReports;

    await GC.components.googleMap.mountReportsMap('gc-reports-gmap', {
      reports: filtered,
      areas: GC.state.areas,
      showHotspots: me.role === 'admin' ? mapState.filters.showHotspots : true,
      useClustering: mapState.filters.useClustering,
      showAreas: me.role === 'admin' && mapState.filters.showAreas,
      selectedReportId: mapState.selectedReportId,
      fallbackLat: GC.state.pos ? GC.state.pos.latitude : null,
      fallbackLng: GC.state.pos ? GC.state.pos.longitude : null,
      onMarkerClick: function (reportId) {
        selectReport(reportId, false);
      }
    });
  }

  function handleAuthFailure() {
    if (GC.state.tab === 'map' || GC.state.tab === 'report') {
      GC.app.render();
    }
  }

  GC.maps = {
    state: mapState,
    getFilteredReports: getFilteredReports,
    getAreaUnresolvedCounts: getAreaUnresolvedCounts,
    setFilter: setFilter,
    toggleFilter: toggleFilter,
    resetFilters: resetFilters,
    selectReport: selectReport,
    openReportDetails: openReportDetails,
    closeReportDetails: closeReportDetails,
    mountReportFormMap: mountReportFormMap,
    mountCitizenMapPage: mountCitizenMapPage,
    centerCitizenGps: centerCitizenGps,
    reportAtPinnedLocation: reportAtPinnedLocation,
    mountDashboardReportsMap: mountDashboardReportsMap,
    handleAuthFailure: handleAuthFailure
  };
})(window);
