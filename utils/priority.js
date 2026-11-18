/**
 * Priority Scoring & Report Sorting Helpers
 * Mirrors the server-side PostgreSQL priority engine (severity + age + nearby cluster)
 * and reads authoritative database priority_score / priority values.
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});
  GC.utils = GC.utils || {};

  function hrs(report) {
    var createdMs =
      typeof report.created_at === 'string'
        ? Date.parse(report.created_at)
        : report.created || Date.now();
    return Math.max(0, (Date.now() - createdMs) / 36e5);
  }

  function prio(report, allReports) {
    if (typeof report.priority_score === 'number' && !isNaN(report.priority_score)) {
      return report.priority_score;
    }
    var cfg = GC.config.priority;
    var sevKey = report.severity || report.sev || 'Medium';
    var sevEntry = GC.config.severities[sevKey];
    var score = sevEntry ? sevEntry.score : 2;
    var elapsed = hrs(report);

    if (elapsed > cfg.ageHighHours) {
      score += 2;
    } else if (elapsed > cfg.ageMediumHours) {
      score += 1;
    }

    var list = allReports || (GC.state && GC.state.reports ? GC.state.reports : []);
    var lat = Number(report.latitude);
    var lng = Number(report.longitude);
    var nearbyCount = list.filter(function (other) {
      return (
        other.id !== report.id &&
        other.status !== 'RESOLVED' &&
        Math.abs(Number(other.latitude) - lat) < cfg.clusterRadiusDeg &&
        Math.abs(Number(other.longitude) - lng) < cfg.clusterRadiusDeg
      );
    }).length;

    return score + (nearbyCount >= 3 ? 2 : nearbyCount ? 1 : 0);
  }

  function priorityLabel(scoreOrReport) {
    if (scoreOrReport && typeof scoreOrReport === 'object') {
      if (scoreOrReport.priority) return scoreOrReport.priority;
      scoreOrReport = prio(scoreOrReport);
    }
    var cfg = GC.config.priority;
    if (scoreOrReport >= cfg.highThreshold) return 'High';
    if (scoreOrReport >= cfg.mediumThreshold) return 'Medium';
    return 'Low';
  }

  function sortReports(reports) {
    return reports.slice().sort(function (a, b) {
      var resolvedDiff = (a.status === 'RESOLVED') - (b.status === 'RESOLVED');
      if (resolvedDiff !== 0) return resolvedDiff;
      var scoreDiff = prio(b, reports) - prio(a, reports);
      if (scoreDiff !== 0) return scoreDiff;
      return Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0);
    });
  }

  GC.utils.priority = {
    hrs: hrs,
    prio: prio,
    pl: priorityLabel,
    sorted: sortReports
  };
})(window);
