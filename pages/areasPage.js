/**
 * Admin Service Areas Management Page (Create, Edit, Delete)
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.pages = GC.pages || {};

  function renderAreasPage() {
    var esc = GC.utils.dom.esc;
    var areas = GC.state.areas || [];
    var editingArea = GC.state.editingAreaId
      ? areas.find(function (a) {
          return a.id === GC.state.editingAreaId;
        })
      : null;

    var areaCards = areas.length
      ? areas
          .map(function (area) {
            var collectorCount = GC.state.profiles.filter(function (u) {
              return u.role === 'collector' && u.assigned_area_id === area.id;
            }).length;
            var reportCount = GC.state.reports.filter(function (r) {
              return r.area_id === area.id;
            }).length;

            return (
              '<div class="card area-item-card">' +
              '<div class="area-item-main">' +
              '<strong>' +
              esc(area.area_name) +
              '</strong>' +
              '<div class="mut">' +
              Number(area.latitude).toFixed(4) +
              ', ' +
              Number(area.longitude).toFixed(4) +
              ' · ' +
              area.radius +
              ' km radius · ' +
              collectorCount +
              ' collector(s)</div>' +
              '</div>' +
              '<div class="area-item-actions">' +
              '<span class="badge RESOLVED">' +
              reportCount +
              ' reports</span>' +
              '<button type="button" class="btn btn-alt btn-sm" onclick="GC.areas.startEditArea(\'' +
              esc(area.id) +
              '\')">Edit</button>' +
              '<button type="button" class="btn btn-danger btn-sm" onclick="GC.areas.deleteArea(\'' +
              esc(area.id) +
              '\', \'' +
              esc(area.area_name).replace(/'/g, '') +
              '\')">Delete</button>' +
              '</div>' +
              '</div>'
            );
          })
          .join('')
      : '<div class="card empty-state mut">No service areas configured yet. Create your first ward or zone using the form.</div>';

    return (
      '<div class="areas-layout">' +
      '<section class="card area-form-card">' +
      '<h3>' +
      (editingArea ? '✏️ Edit service area' : '➕ New service area') +
      '</h3>' +
      '<p class="mut">Define center coordinates and radius so incoming citizen reports auto-route to the right collectors.</p>' +
      '<div class="form-field">' +
      '<label for="an">Area name</label>' +
      '<input id="an" placeholder="Area name (e.g. Ward 5)" value="' +
      esc(editingArea ? editingArea.area_name : '') +
      '">' +
      '</div>' +
      '<div class="form-field">' +
      '<label>Center coordinates</label>' +
      '<div class="input-pair">' +
      '<input id="alt" placeholder="Latitude" inputmode="decimal" value="' +
      esc(editingArea ? editingArea.latitude : '') +
      '">' +
      '<input id="aln" placeholder="Longitude" inputmode="decimal" value="' +
      esc(editingArea ? editingArea.longitude : '') +
      '">' +
      '</div>' +
      '</div>' +
      '<div class="form-field">' +
      '<label for="akm">Coverage radius (km)</label>' +
      '<input id="akm" type="number" step="0.1" min="0.1" placeholder="Radius in km (e.g. 2)" value="' +
      esc(editingArea ? editingArea.radius : '') +
      '">' +
      '</div>' +
      '<div class="action-stack">' +
      '<button type="button" class="btn btn-alt" onclick="GC.areas.fillMyLocation()">📍 Use my location</button>' +
      '<button type="button" class="btn" onclick="GC.areas.saveArea()">' +
      (editingArea ? 'Save changes' : 'Add area') +
      '</button>' +
      (editingArea
        ? '<button type="button" class="btn btn-alt" onclick="GC.areas.cancelEditArea()">Cancel edit</button>'
        : '') +
      '</div>' +
      '</section>' +
      '<section class="areas-list-section">' +
      '<div class="section-header">' +
      '<h3>📍 Configured Service Areas</h3>' +
      '<span class="badge IN_PROGRESS">' +
      areas.length +
      ' total</span>' +
      '</div>' +
      '<div class="areas-list">' +
      areaCards +
      '</div>' +
      '</section>' +
      '</div>'
    );
  }

  GC.pages.renderAreasPage = renderAreasPage;
})(window);
