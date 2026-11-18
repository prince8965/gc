/**
 * DOM & UI Utility Helpers
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.utils = GC.utils || {};

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch];
    });
  }

  function toast(message, durationMs) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () {
      el.classList.remove('is-visible');
    }, durationMs || 5000);
  }

  function formatDateTime(timestamp) {
    return new Date(timestamp).toLocaleString();
  }

  GC.utils.dom = {
    $: $,
    $$: $$,
    esc: esc,
    toast: toast,
    formatDateTime: formatDateTime
  };
})(window);
