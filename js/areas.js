/**
 * Admin Service Area Management Controller (Create, Edit, Delete)
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});

  async function fillMyLocation() {
    var $ = GC.utils.dom.$;
    try {
      var coords = await GC.utils.geo.getPos();
      var latInput = $('#alt');
      var lngInput = $('#aln');
      if (latInput) latInput.value = coords.latitude.toFixed(5);
      if (lngInput) lngInput.value = coords.longitude.toFixed(5);
      GC.utils.dom.toast('📍 Current coordinates populated', 2500);
    } catch (err) {
      GC.utils.dom.toast('Allow location access to auto-fill coordinates.', 3500);
    }
  }

  function startEditArea(areaId) {
    GC.state.editingAreaId = areaId;
    GC.app.render();
  }

  function cancelEditArea() {
    GC.state.editingAreaId = null;
    GC.app.render();
  }

  async function saveArea() {
    var $ = GC.utils.dom.$;
    var name = ($('#an') ? $('#an').value : '').trim();
    var lat = parseFloat($('#alt') ? $('#alt').value : '');
    var lng = parseFloat($('#aln') ? $('#aln').value : '');
    var radius = parseFloat($('#akm') ? $('#akm').value : '');

    if (name.length < 2 || isNaN(lat) || isNaN(lng) || !(radius > 0)) {
      return GC.utils.dom.toast(
        'Enter area name, valid latitude, longitude, and positive radius (km).',
        4000
      );
    }

    var payload = {
      area_name: name,
      latitude: lat,
      longitude: lng,
      radius: radius
    };

    try {
      if (GC.state.editingAreaId) {
        await GC.db.updateServiceArea(GC.state.editingAreaId, payload);
        GC.utils.dom.toast('✅ Service area "' + name + '" updated', 3000);
      } else {
        await GC.db.createServiceArea(payload);
        GC.utils.dom.toast('✅ Service area "' + name + '" created', 3000);
      }
      GC.state.editingAreaId = null;
      GC.state.areas = await GC.db.fetchServiceAreas();
      GC.app.render();
    } catch (err) {
      GC.utils.dom.toast('⚠️ ' + (err.message || 'Could not save service area'), 4500);
    }
  }

  async function deleteArea(areaId, areaName) {
    if (
      typeof window.confirm === 'function' &&
      !window.confirm(
        'Delete service area "' +
          areaName +
          '"? Linked reports and collectors will be unassigned.'
      )
    ) {
      return;
    }

    try {
      await GC.db.deleteServiceArea(areaId);
      if (GC.state.editingAreaId === areaId) GC.state.editingAreaId = null;
      await GC.state.refreshAll();
      GC.utils.dom.toast('🗑️ Service area deleted', 3000);
      GC.app.render();
    } catch (err) {
      GC.utils.dom.toast('⚠️ ' + (err.message || 'Could not delete area'), 4500);
    }
  }

  GC.areas = {
    fillMyLocation: fillMyLocation,
    startEditArea: startEditArea,
    cancelEditArea: cancelEditArea,
    saveArea: saveArea,
    deleteArea: deleteArea
  };
})(window);
