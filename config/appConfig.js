/**
 * Application Configuration
 * Centralizes UI constants, role definitions, navigation items, categories,
 * severity levels, priority scoring rules, and non-sensitive UI preference keys.
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});

  GC.config = {
    appName: 'Garbage Collector',
    appTagline: 'Smart Urban Waste Reporting & Collection System',
    // LocalStorage is NO LONGER the application database.
    // Used strictly for optional non-sensitive UI preferences & legacy backup detection.
    uiPrefsKey: 'gc_ui_prefs',
    legacyStorageKey: 'gc_db',
    roles: {
      citizen: {
        key: 'citizen',
        icon: '🧑',
        label: 'Citizen',
        description:
          'Report urban waste with geo-tagged photos and track cleanup progress.'
      },
      collector: {
        key: 'collector',
        icon: '🚛',
        label: 'Collector',
        description:
          'Receive area-based high-priority tasks, navigate via Maps, and verify cleanup.'
      },
      admin: {
        key: 'admin',
        icon: '🛡️',
        label: 'Admin',
        description:
          'Monitor city-wide metrics, manage service areas, collectors, and waste hotspots.'
      }
    },
    navigation: {
      citizen: [
        { id: 'home', icon: '🏠', label: 'Home' },
        { id: 'report', icon: '📸', label: 'Report' },
        { id: 'map', icon: '🗺️', label: 'Report Map' },
        { id: 'mine', icon: '🗂️', label: 'My Reports' }
      ],
      collector: [
        { id: 'home', icon: '📊', label: 'Overview' },
        { id: 'tasks', icon: '🧹', label: 'Tasks' },
        { id: 'map', icon: '🗺️', label: 'Reports Map' }
      ],
      admin: [
        { id: 'home', icon: '📊', label: 'Overview' },
        { id: 'reports', icon: '🗑️', label: 'Reports' },
        { id: 'map', icon: '🗺️', label: 'Maps & Hotspots' },
        { id: 'users', icon: '👥', label: 'Users' },
        { id: 'areas', icon: '📍', label: 'Areas' }
      ]
    },
    allowedTabs: {
      citizen: ['home', 'report', 'map', 'mine', 'notes', 'profile'],
      collector: ['home', 'tasks', 'map', 'notes', 'profile'],
      admin: ['home', 'reports', 'map', 'users', 'areas', 'notes', 'profile']
    },
    categories: [
      'Overflowing Dustbin',
      'Roadside Garbage',
      'Illegal Dumping',
      'Plastic Waste',
      'Other'
    ],
    severities: {
      Low: { key: 'Low', score: 1, bg: '#ecfdf5', text: '#065f46', border: '#6ee7b7' },
      Medium: { key: 'Medium', score: 2, bg: '#fffbeb', text: '#92400e', border: '#fcd34d' },
      High: { key: 'High', score: 3, bg: '#fef2f2', text: '#991b1b', border: '#fca5a5' }
    },
    priority: {
      ageHighHours: 8,
      ageMediumHours: 4,
      clusterRadiusDeg: 0.001,
      highThreshold: 5,
      mediumThreshold: 3
    },
    geo: {
      enableHighAccuracy: true,
      timeoutMs: 15000
    },
    camera: {
      canvasWidth: 640,
      footerHeight: 44,
      jpegQuality: 0.72
    }
  };
})(window);
