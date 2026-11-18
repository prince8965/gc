/**
 * Reusable Google Maps JavaScript API Component
 *
 * Supports:
 * 1. Citizen Interactive Location Picker (GPS dot + accuracy circle + click/drag pin)
 * 2. Collector & Admin Multi-Marker Reports Map (Priority colors: Red/Orange/Green,
 *    zoom-aware marker clustering, hotspot concentration circles/heatmap,
 *    InfoWindow with Directions & View Details).
 *
 * Never invents dummy coordinates or dummy markers.
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.components = GC.components || {};

  var activeInstances = {};

  function isValidCoord(lat, lng) {
    var la = Number(lat);
    var lo = Number(lng);
    return (
      lat !== null &&
      lat !== undefined &&
      lat !== '' &&
      lng !== null &&
      lng !== undefined &&
      lng !== '' &&
      !isNaN(la) &&
      !isNaN(lo) &&
      la >= -90 &&
      la <= 90 &&
      lo >= -180 &&
      lo <= 180
    );
  }

  function makePinIcon(color, isResolved) {
    var inner = isResolved
      ? '<path d="M12 16l3 3 6-6" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
      : '<circle cx="16" cy="15" r="5" fill="#ffffff"/>';
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 32 42">' +
      '<path d="M16 1C7.7 1 1 7.7 1 16c0 10.6 15 25 15 25s15-14.4 15-25C31 7.7 24.3 1 16 1z" fill="' +
      color +
      '" stroke="#ffffff" stroke-width="2"/>' +
      inner +
      '</svg>';
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new global.google.maps.Size(34, 44),
      anchor: new global.google.maps.Point(17, 42)
    };
  }

  function makeClusterIcon(count, color) {
    var size = count >= 10 ? 48 : count >= 5 ? 44 : 38;
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" viewBox="0 0 48 48">' +
      '<circle cx="24" cy="24" r="22" fill="' +
      color +
      '" fill-opacity="0.28"/>' +
      '<circle cx="24" cy="24" r="16" fill="' +
      color +
      '" stroke="#ffffff" stroke-width="2.5"/>' +
      '<text x="24" y="29" text-anchor="middle" fill="#ffffff" font-family="system-ui,sans-serif" font-size="14" font-weight="800">' +
      count +
      '</text>' +
      '</svg>';
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new global.google.maps.Size(size, size),
      anchor: new global.google.maps.Point(size / 2, size / 2)
    };
  }

  function getMarkerColor(report) {
    var colors = GC.mapsConfig.priorityColors;
    if (report.status === 'RESOLVED') return colors.RESOLVED;
    var prio = GC.utils.priority.pl(report);
    return colors[prio] || colors.Low;
  }

  function buildInfoWindowHtml(report) {
    var esc = GC.utils.dom.esc;
    var prio = GC.utils.priority.pl(report);
    var score = GC.utils.priority.prio(report);
    var areaLabel =
      (report.area && report.area.area_name) || GC.state.areaName(report.area_id);
    var submitted = GC.utils.dom.formatDateTime(report.created_at);
    var dirsUrl =
      'https://www.google.com/maps/dir/?api=1&destination=' +
      encodeURIComponent(report.latitude) +
      ',' +
      encodeURIComponent(report.longitude);

    return (
      '<div class="gm-info-card">' +
      '<div class="gm-info-head">' +
      '<strong>' +
      esc(report.report_number) +
      '</strong>' +
      '<span class="badge ' +
      prio +
      '">' +
      esc(prio) +
      ' · ' +
      score +
      '</span>' +
      '</div>' +
      '<div class="gm-info-row"><b>Category:</b> ' +
      esc(report.category) +
      '</div>' +
      '<div class="gm-info-row"><b>Severity:</b> ' +
      esc(report.severity) +
      ' · <b>Status:</b> ' +
      esc(report.status.replace('_', ' ')) +
      '</div>' +
      '<div class="gm-info-row"><b>Area:</b> ' +
      esc(areaLabel) +
      '</div>' +
      '<div class="gm-info-row"><b>Date:</b> ' +
      esc(submitted) +
      '</div>' +
      '<div class="gm-info-row"><b>Location:</b> ' +
      Number(report.latitude).toFixed(5) +
      ', ' +
      Number(report.longitude).toFixed(5) +
      '</div>' +
      '<div class="gm-info-actions">' +
      '<button type="button" class="gm-btn gm-btn-primary" onclick="GC.maps.openReportDetails(\'' +
      esc(report.id) +
      '\')">View Details</button>' +
      '<a class="gm-btn gm-btn-alt" target="_blank" rel="noopener noreferrer" href="' +
      dirsUrl +
      '">🧭 Directions</a>' +
      '</div>' +
      '</div>'
    );
  }

  function renderMapErrorState(container, message) {
    var esc = GC.utils.dom.esc;
    container.innerHTML =
      '<div class="gmap-fallback">' +
      '<div class="gmap-fallback-icon" aria-hidden="true">🗺️</div>' +
      '<h4>Google Maps Unavailable</h4>' +
      '<p class="mut">' +
      esc(message) +
      '</p>' +
      '<p class="mut gmap-fallback-tip">Setup: Copy <code>config/env.example.js</code> to <code>config/env.js</code>, add your HTTP-referrer-restricted <code>GOOGLE_MAPS_API_KEY</code>, enable <b>Maps JavaScript API</b> in Google Cloud Console, and reload.</p>' +
      '</div>';
  }

  function detectHotspotClusters(reports) {
    var unresolved = reports.filter(function (r) {
      return r.status !== 'RESOLVED' && isValidCoord(r.latitude, r.longitude);
    });
    var visited = {};
    var clusters = [];

    for (var i = 0; i < unresolved.length; i++) {
      var seed = unresolved[i];
      if (visited[seed.id]) continue;
      var group = [seed];
      visited[seed.id] = true;

      for (var j = i + 1; j < unresolved.length; j++) {
        var other = unresolved[j];
        if (visited[other.id]) continue;
        // Group reports within ~250m (0.25 km) to identify real hotspot concentrations
        var distKm = GC.utils.geo.km(
          Number(seed.latitude),
          Number(seed.longitude),
          Number(other.latitude),
          Number(other.longitude)
        );
        if (distKm <= 0.25) {
          visited[other.id] = true;
          group.push(other);
        }
      }

      if (group.length >= 2) {
        var sumLat = 0;
        var sumLng = 0;
        var highCount = 0;
        group.forEach(function (item) {
          sumLat += Number(item.latitude);
          sumLng += Number(item.longitude);
          if (GC.utils.priority.pl(item) === 'High') highCount++;
        });
        clusters.push({
          lat: sumLat / group.length,
          lng: sumLng / group.length,
          count: group.length,
          highCount: highCount,
          reports: group,
          areaName:
            (group[0].area && group[0].area.area_name) ||
            GC.state.areaName(group[0].area_id)
        });
      }
    }

    return clusters.sort(function (a, b) {
      return b.count - a.count || b.highCount - a.highCount;
    });
  }

  function clusterMarkersByZoom(reports, zoom) {
    // At zoom >= 15 show individual pins; at lower zoom cluster nearby markers cleanly
    if (zoom >= 15) {
      return reports.map(function (r) {
        return { type: 'single', report: r };
      });
    }
    var cellDeg = 0.002 * Math.pow(2, Math.max(0, 14 - zoom));
    var buckets = {};
    var order = [];

    reports.forEach(function (r) {
      var lat = Number(r.latitude);
      var lng = Number(r.longitude);
      var key = Math.floor(lat / cellDeg) + ':' + Math.floor(lng / cellDeg);
      if (!buckets[key]) {
        buckets[key] = [];
        order.push(key);
      }
      buckets[key].push(r);
    });

    return order.map(function (key) {
      var items = buckets[key];
      if (items.length === 1) {
        return { type: 'single', report: items[0] };
      }
      var sumLat = 0;
      var sumLng = 0;
      var worst = 'Low';
      items.forEach(function (r) {
        sumLat += Number(r.latitude);
        sumLng += Number(r.longitude);
        var p = GC.utils.priority.pl(r);
        if (p === 'High') worst = 'High';
        else if (p === 'Medium' && worst !== 'High') worst = 'Medium';
      });
      return {
        type: 'cluster',
        lat: sumLat / items.length,
        lng: sumLng / items.length,
        count: items.length,
        worstPriority: worst,
        reports: items
      };
    });
  }

  function destroy(containerId) {
    var inst = activeInstances[containerId];
    if (!inst) return;
    if (inst.overlays) {
      inst.overlays.forEach(function (o) {
        if (o && typeof o.setMap === 'function') o.setMap(null);
      });
    }
    if (inst.heatmap) {
      inst.heatmap.setMap(null);
    }
    delete activeInstances[containerId];
  }

  /**
   * Mount Citizen Interactive Location Picker Map
   */
  async function mountLocationPicker(containerId, options) {
    var container = document.getElementById(containerId);
    if (!container) return null;
    destroy(containerId);

    var opts = options || {};
    var gmaps;
    try {
      gmaps = await GC.mapsConfig.load();
    } catch (err) {
      renderMapErrorState(container, err.message || 'Unable to load Google Maps.');
      return null;
    }

    var hasSelected = isValidCoord(opts.selectedLat, opts.selectedLng);
    var hasGps = isValidCoord(opts.gpsLat, opts.gpsLng);
    var initialCenter = hasSelected
      ? { lat: Number(opts.selectedLat), lng: Number(opts.selectedLng) }
      : hasGps
      ? { lat: Number(opts.gpsLat), lng: Number(opts.gpsLng) }
      : GC.mapsConfig.defaultCenter;
    var initialZoom = hasSelected || hasGps ? GC.mapsConfig.focusedZoom : GC.mapsConfig.defaultZoom;

    var map = new gmaps.Map(container, {
      center: initialCenter,
      zoom: initialZoom,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: 'greedy'
    });

    var overlays = [];
    var infoWindow = new gmaps.InfoWindow();

    // Render Citizen's own existing reports if provided (strictly RLS-scoped)
    if (Array.isArray(opts.ownReports) && opts.ownReports.length) {
      opts.ownReports.forEach(function (r) {
        if (!isValidCoord(r.latitude, r.longitude)) return;
        var m = new gmaps.Marker({
          position: { lat: Number(r.latitude), lng: Number(r.longitude) },
          map: map,
          icon: makePinIcon(getMarkerColor(r), r.status === 'RESOLVED'),
          title: r.report_number + ' · ' + r.category
        });
        m.addListener('click', function () {
          infoWindow.setContent(buildInfoWindowHtml(r));
          infoWindow.open(map, m);
          if (typeof opts.onReportClick === 'function') {
            opts.onReportClick(r.id);
          }
        });
        overlays.push(m);
      });
    }

    // Current GPS position dot + accuracy circle
    var gpsMarker = null;
    var gpsCircle = null;
    function setGpsIndicator(lat, lng, accuracy) {
      if (!isValidCoord(lat, lng)) return;
      var pos = { lat: Number(lat), lng: Number(lng) };
      if (!gpsMarker) {
        gpsMarker = new gmaps.Marker({
          position: pos,
          map: map,
          zIndex: 5,
          title: 'Your current GPS location',
          icon: {
            path: gmaps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#2563eb',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3
          }
        });
        overlays.push(gpsMarker);
      } else {
        gpsMarker.setPosition(pos);
      }

      if (accuracy && !isNaN(accuracy)) {
        if (!gpsCircle) {
          gpsCircle = new gmaps.Circle({
            map: map,
            center: pos,
            radius: Math.min(Number(accuracy), 250),
            fillColor: '#3b82f6',
            fillOpacity: 0.14,
            strokeColor: '#2563eb',
            strokeOpacity: 0.4,
            strokeWeight: 1,
            clickable: false
          });
          overlays.push(gpsCircle);
        } else {
          gpsCircle.setCenter(pos);
          gpsCircle.setRadius(Math.min(Number(accuracy), 250));
        }
      }
    }

    if (hasGps) {
      setGpsIndicator(opts.gpsLat, opts.gpsLng, opts.gpsAccuracy);
    }

    // Selected waste location marker (draggable + movable by clicking map)
    var selectionMarker = null;
    function placeSelectionMarker(lat, lng, shouldPan) {
      if (!isValidCoord(lat, lng)) return;
      var pos = { lat: Number(lat), lng: Number(lng) };
      if (!selectionMarker) {
        selectionMarker = new gmaps.Marker({
          position: pos,
          map: map,
          draggable: true,
          zIndex: 10,
          animation: gmaps.Animation.DROP,
          icon: makePinIcon('#0e7c5a', false),
          title: 'Selected garbage location (drag to adjust)'
        });
        selectionMarker.addListener('dragend', function (evt) {
          var p = evt.latLng;
          if (typeof opts.onSelect === 'function') {
            opts.onSelect({ lat: p.lat(), lng: p.lng(), source: 'map' });
          }
        });
        overlays.push(selectionMarker);
      } else {
        selectionMarker.setPosition(pos);
      }
      if (shouldPan) {
        map.panTo(pos);
        if (map.getZoom() < 15) map.setZoom(16);
      }
    }

    if (hasSelected) {
      placeSelectionMarker(opts.selectedLat, opts.selectedLng, false);
    }

    map.addListener('click', function (evt) {
      var lat = evt.latLng.lat();
      var lng = evt.latLng.lng();
      placeSelectionMarker(lat, lng, false);
      if (typeof opts.onSelect === 'function') {
        opts.onSelect({ lat: lat, lng: lng, source: 'map' });
      }
    });

    var instance = {
      map: map,
      overlays: overlays,
      setGpsIndicator: setGpsIndicator,
      placeSelectionMarker: placeSelectionMarker,
      focusCoord: function (lat, lng, zoom) {
        if (!isValidCoord(lat, lng)) return;
        map.panTo({ lat: Number(lat), lng: Number(lng) });
        map.setZoom(zoom || GC.mapsConfig.focusedZoom);
      }
    };
    activeInstances[containerId] = instance;
    return instance;
  }

  /**
   * Mount Collector / Admin Multi-Marker Reports & Hotspot Map
   */
  async function mountReportsMap(containerId, options) {
    var container = document.getElementById(containerId);
    if (!container) return null;
    destroy(containerId);

    var opts = options || {};
    var gmaps;
    try {
      gmaps = await GC.mapsConfig.load();
    } catch (err) {
      renderMapErrorState(container, err.message || 'Unable to load Google Maps.');
      return null;
    }

    var validReports = (opts.reports || []).filter(function (r) {
      return isValidCoord(r.latitude, r.longitude);
    });

    var map = new gmaps.Map(container, {
      center: GC.mapsConfig.defaultCenter,
      zoom: GC.mapsConfig.defaultZoom,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: 'greedy'
    });

    var infoWindow = new gmaps.InfoWindow();
    var overlays = [];
    var markerById = {};
    var heatmap = null;

    function clearOverlays() {
      overlays.forEach(function (o) {
        if (o && typeof o.setMap === 'function') o.setMap(null);
      });
      overlays = [];
      markerById = {};
      if (heatmap) {
        heatmap.setMap(null);
        heatmap = null;
      }
    }

    function drawLayers() {
      clearOverlays();

      // 1. Hotspot visualization (real multi-report unresolved clusters + optional heatmap)
      if (opts.showHotspots) {
        var unresolved = validReports.filter(function (r) {
          return r.status !== 'RESOLVED';
        });

        if (unresolved.length && gmaps.visualization && gmaps.visualization.HeatmapLayer) {
          heatmap = new gmaps.visualization.HeatmapLayer({
            data: unresolved.map(function (r) {
              return {
                location: new gmaps.LatLng(Number(r.latitude), Number(r.longitude)),
                weight: GC.utils.priority.prio(r)
              };
            }),
            radius: 36,
            opacity: 0.55,
            map: map
          });
        }

        var hotspots = detectHotspotClusters(validReports);
        hotspots.forEach(function (h) {
          var ring = new gmaps.Circle({
            map: map,
            center: { lat: h.lat, lng: h.lng },
            radius: GC.mapsConfig.hotspotRadiusMeters,
            fillColor: h.highCount > 0 ? '#ef4444' : '#f59e0b',
            fillOpacity: 0.16,
            strokeColor: h.highCount > 0 ? '#dc2626' : '#d97706',
            strokeOpacity: 0.75,
            strokeWeight: 2,
            clickable: false
          });
          overlays.push(ring);
        });
      }

      // 2. Service area boundaries (subtle reference rings for Admin)
      if (opts.showAreas && Array.isArray(opts.areas)) {
        opts.areas.forEach(function (a) {
          if (!isValidCoord(a.latitude, a.longitude) || !(Number(a.radius) > 0)) return;
          var zone = new gmaps.Circle({
            map: map,
            center: { lat: Number(a.latitude), lng: Number(a.longitude) },
            radius: Number(a.radius) * 1000,
            fillColor: '#0e7c5a',
            fillOpacity: 0.05,
            strokeColor: '#0e7c5a',
            strokeOpacity: 0.35,
            strokeWeight: 1.5,
            clickable: false
          });
          overlays.push(zone);
        });
      }

      // 3. Report markers (clustered or individual)
      var zoom = map.getZoom() || 12;
      var items = opts.useClustering
        ? clusterMarkersByZoom(validReports, zoom)
        : validReports.map(function (r) {
            return { type: 'single', report: r };
          });

      items.forEach(function (item) {
        if (item.type === 'cluster') {
          var color =
            GC.mapsConfig.priorityColors[item.worstPriority] ||
            GC.mapsConfig.priorityColors.Medium;
          var clusterMarker = new gmaps.Marker({
            position: { lat: item.lat, lng: item.lng },
            map: map,
            icon: makeClusterIcon(item.count, color),
            title: item.count + ' nearby reports (click to zoom in)',
            zIndex: 8
          });
          clusterMarker.addListener('click', function () {
            var bounds = new gmaps.LatLngBounds();
            item.reports.forEach(function (r) {
              bounds.extend({ lat: Number(r.latitude), lng: Number(r.longitude) });
            });
            map.fitBounds(bounds);
            if (map.getZoom() < 15) map.setZoom(16);
          });
          overlays.push(clusterMarker);
        } else {
          var r = item.report;
          var marker = new gmaps.Marker({
            position: { lat: Number(r.latitude), lng: Number(r.longitude) },
            map: map,
            icon: makePinIcon(getMarkerColor(r), r.status === 'RESOLVED'),
            title: r.report_number + ' · ' + r.category + ' (' + GC.utils.priority.pl(r) + ')',
            zIndex: GC.utils.priority.pl(r) === 'High' ? 9 : 6
          });
          marker.addListener('click', function () {
            infoWindow.setContent(buildInfoWindowHtml(r));
            infoWindow.open(map, marker);
            if (typeof opts.onMarkerClick === 'function') {
              opts.onMarkerClick(r.id);
            }
          });
          markerById[r.id] = { marker: marker, report: r };
          overlays.push(marker);
        }
      });

      // Keep instance overlay references synced
      instance.overlays = overlays;
      instance.heatmap = heatmap;
    }

    var instance = {
      map: map,
      overlays: overlays,
      heatmap: heatmap,
      focusReport: function (reportId) {
        var r = validReports.find(function (x) {
          return x.id === reportId;
        });
        if (!r) return;
        var pos = { lat: Number(r.latitude), lng: Number(r.longitude) };
        map.panTo(pos);
        if (map.getZoom() < 15) map.setZoom(16);
        // Re-render at zoomed level so individual marker is guaranteed unclustered
        drawLayers();
        var entry = markerById[reportId];
        if (entry) {
          infoWindow.setContent(buildInfoWindowHtml(entry.report));
          infoWindow.open(map, entry.marker);
        }
      }
    };

    // Fit map bounds to all valid real report markers
    if (validReports.length === 1) {
      map.setCenter({
        lat: Number(validReports[0].latitude),
        lng: Number(validReports[0].longitude)
      });
      map.setZoom(15);
    } else if (validReports.length > 1) {
      var bounds = new gmaps.LatLngBounds();
      validReports.forEach(function (r) {
        bounds.extend({ lat: Number(r.latitude), lng: Number(r.longitude) });
      });
      map.fitBounds(bounds);
    } else if (isValidCoord(opts.fallbackLat, opts.fallbackLng)) {
      map.setCenter({ lat: Number(opts.fallbackLat), lng: Number(opts.fallbackLng) });
      map.setZoom(13);
    }

    drawLayers();

    if (opts.useClustering) {
      var zoomTimer = null;
      map.addListener('zoom_changed', function () {
        clearTimeout(zoomTimer);
        zoomTimer = setTimeout(drawLayers, 160);
      });
    }

    if (opts.selectedReportId) {
      instance.focusReport(opts.selectedReportId);
    }

    activeInstances[containerId] = instance;
    return instance;
  }

  GC.components.googleMap = {
    isValidCoord: isValidCoord,
    detectHotspotClusters: detectHotspotClusters,
    mountLocationPicker: mountLocationPicker,
    mountReportsMap: mountReportsMap,
    destroy: destroy,
    getInstance: function (containerId) {
      return activeInstances[containerId] || null;
    }
  };
})(window);
