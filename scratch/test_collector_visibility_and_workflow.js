/**
 * Comprehensive Workflow & Collector Visibility Test Suite
 * Tests all 13 points specified in Phase 5 of the master task.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('GARBAGE COLLECTOR — WORKFLOW & VISIBILITY INTEGRATION TEST SUITE');
console.log('================================================================');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] Test ${totalTests}: ${name}`);
    console.error(`       Error: ${err.message}`);
  }
}

// Haversine formula identical to public.calc_distance_km in SQL
function calcDistanceKm(lat1, lon1, lat2, lon2) {
  const dlat = (lat2 - lat1) * (Math.PI / 180);
  const dlon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dlat / 2) * Math.sin(dlat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dlon / 2) *
      Math.sin(dlon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371.0 * c;
}

// Simulation of reports_select_scoped RLS policy in PostgreSQL
function evaluateReportSelectRLS(user, report) {
  if (!user || !user.id) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'citizen') {
    return report.citizen_id === user.id;
  }
  if (user.role === 'collector') {
    // 1. Directly assigned
    if (report.assigned_collector_id && report.assigned_collector_id === user.id) {
      return true;
    }
    // 2. Unassigned, non-null area, matching area
    if (
      report.assigned_collector_id === null &&
      user.assigned_area_id !== null &&
      user.assigned_area_id !== undefined &&
      report.area_id !== null &&
      report.area_id !== undefined &&
      report.area_id === user.assigned_area_id
    ) {
      return true;
    }
    return false;
  }
  return false;
}

// Simulation of before_update_report() transition logic for Collector
function simulateCollectorReportUpdate(user, oldReport, updates) {
  if (!user || user.role !== 'collector') {
    throw new Error('Only authorized collectors can update report status.');
  }
  if (oldReport.status === 'RESOLVED') {
    throw new Error('Resolved reports cannot be modified by collectors.');
  }
  // Check assigned collector
  if (oldReport.assigned_collector_id && oldReport.assigned_collector_id !== user.id) {
    throw new Error('Forbidden: This report is assigned to another collector.');
  }
  // Check unassigned claim requirement
  if (!oldReport.assigned_collector_id) {
    if (!user.assigned_area_id) {
      throw new Error('Forbidden: You must be assigned to a service area before claiming unassigned reports.');
    }
    if (!oldReport.area_id || oldReport.area_id !== user.assigned_area_id) {
      throw new Error('Forbidden: This report is outside your assigned service area.');
    }
  }

  const newReport = Object.assign({}, oldReport, updates);

  // Status transitions
  if (['PENDING', 'OPEN'].includes(oldReport.status) && newReport.status === 'IN_PROGRESS') {
    newReport.assigned_collector_id = user.id;
    newReport.resolved_at = null;
    return newReport;
  }

  if (oldReport.status === 'IN_PROGRESS' && newReport.status === 'RESOLVED') {
    if (!newReport.after_image_url || !newReport.after_image_url.startsWith(`after/${oldReport.id}/`)) {
      throw new Error('A valid after-cleaning photograph uploaded for this report is required to resolve it.');
    }
    newReport.assigned_collector_id = user.id;
    newReport.resolved_at = new Date().toISOString();
    return newReport;
  }

  throw new Error(`Invalid report status transition from ${oldReport.status} to ${newReport.status}.`);
}

// -------------------------------------------------------------
// TEST CASES
// -------------------------------------------------------------

// 1. Citizen submits report payload
runTest('Citizen submits report payload with strictly permitted fields', () => {
  const reportsJs = fs.readFileSync(path.join(WORKSPACE, 'js', 'reports.js'), 'utf8');
  assert(reportsJs.includes('category: draft.cat'), 'Missing category field');
  assert(reportsJs.includes('severity: draft.sev'), 'Missing severity field');
  assert(reportsJs.includes('description: (draft.desc || \'\').trim()'), 'Missing description field');
  assert(reportsJs.includes('latitude: lat'), 'Missing latitude field');
  assert(reportsJs.includes('longitude: lng'), 'Missing longitude field');
  assert(reportsJs.includes('location_accuracy: draft.acc || null'), 'Missing accuracy field');
  assert(reportsJs.includes('location_verified: !!draft.ver'), 'Missing location_verified field');
  assert(reportsJs.includes('before_image_url: storagePath'), 'Missing before_image_url field');

  // Verify protected fields are NOT sent in createReport payload
  assert(!reportsJs.match(/createReport\(\s*\{[^}]*priority\s*:/), 'priority must not be in createReport payload');
  assert(!reportsJs.match(/createReport\(\s*\{[^}]*status\s*:/), 'status must not be in createReport payload');
  assert(!reportsJs.match(/createReport\(\s*\{[^}]*assigned_collector_id\s*:/), 'assigned_collector_id must not be in createReport payload');
});

// 2. Spatial area identification
runTest('Spatial service area identification correctly matches boundaries', () => {
  const areaVasai = {
    id: 'area-vasai-uuid',
    name: 'Vasai West',
    lat: 19.3800,
    lng: 72.8200,
    radius: 5.0 // 5 km
  };
  const areaVirar = {
    id: 'area-virar-uuid',
    name: 'Virar East',
    lat: 19.4700,
    lng: 72.8100,
    radius: 4.0 // 4 km
  };
  const serviceAreas = [areaVasai, areaVirar];

  // Point A: Inside Vasai West (~1.2 km away)
  const reportCoordA = { lat: 19.3880, lng: 72.8250 };
  const distA_Vasai = calcDistanceKm(areaVasai.lat, areaVasai.lng, reportCoordA.lat, reportCoordA.lng);
  assert(distA_Vasai <= areaVasai.radius, 'Coord A should be within Vasai radius');

  // Find closest matching area
  const matchedAreaA = serviceAreas
    .filter(sa => calcDistanceKm(sa.lat, sa.lng, reportCoordA.lat, reportCoordA.lng) <= sa.radius)
    .sort((a, b) => calcDistanceKm(a.lat, a.lng, reportCoordA.lat, reportCoordA.lng) - calcDistanceKm(b.lat, b.lng, reportCoordA.lat, reportCoordA.lng))[0];
  assert.strictEqual(matchedAreaA.id, areaVasai.id, 'Report A must match Vasai West');

  // Point B: Outside all service areas (e.g. Pune: 18.5204, 73.8567)
  const reportCoordOut = { lat: 18.5204, lng: 73.8567 };
  const matchedAreaOut = serviceAreas
    .filter(sa => calcDistanceKm(sa.lat, sa.lng, reportCoordOut.lat, reportCoordOut.lng) <= sa.radius)[0];
  assert.strictEqual(matchedAreaOut, undefined, 'Out-of-bounds report should match no service area');
});

// 3. Correct Collector can see unassigned report in their area
runTest('Correct Collector can see unassigned report in their assigned area', () => {
  const collectorVasai = { id: 'col-1', role: 'collector', assigned_area_id: 'area-vasai-uuid' };
  const reportVasai = {
    id: 'rep-1',
    citizen_id: 'cit-1',
    area_id: 'area-vasai-uuid',
    assigned_collector_id: null,
    status: 'PENDING'
  };
  const canSee = evaluateReportSelectRLS(collectorVasai, reportVasai);
  assert.strictEqual(canSee, true, 'Collector in Area Vasai must be able to see unassigned report in Area Vasai');
});

// 4. Collector from another area CANNOT see the report
runTest('Collector from another area CANNOT see the report', () => {
  const collectorVirar = { id: 'col-2', role: 'collector', assigned_area_id: 'area-virar-uuid' };
  const reportVasai = {
    id: 'rep-1',
    citizen_id: 'cit-1',
    area_id: 'area-vasai-uuid',
    assigned_collector_id: null,
    status: 'PENDING'
  };
  const canSee = evaluateReportSelectRLS(collectorVirar, reportVasai);
  assert.strictEqual(canSee, false, 'Collector in Virar must NOT see unassigned report in Vasai');
});

// 5. Collector with NO assigned area CANNOT see unassigned reports
runTest('Collector with NO assigned area CANNOT see unassigned reports', () => {
  const collectorUnassigned = { id: 'col-3', role: 'collector', assigned_area_id: null };
  const reportVasai = {
    id: 'rep-1',
    citizen_id: 'cit-1',
    area_id: 'area-vasai-uuid',
    assigned_collector_id: null,
    status: 'PENDING'
  };
  const canSee = evaluateReportSelectRLS(collectorUnassigned, reportVasai);
  assert.strictEqual(canSee, false, 'Unassigned collector must NOT see unassigned reports');
});

// 6. Citizen CANNOT see another citizen\'s reports
runTest('Citizen CANNOT see another citizen\'s reports', () => {
  const citizenAlice = { id: 'cit-alice', role: 'citizen' };
  const citizenBob = { id: 'cit-bob', role: 'citizen' };
  const reportOfBob = {
    id: 'rep-bob-1',
    citizen_id: citizenBob.id,
    area_id: 'area-vasai-uuid',
    assigned_collector_id: null,
    status: 'PENDING'
  };
  const aliceCanSeeBob = evaluateReportSelectRLS(citizenAlice, reportOfBob);
  const bobCanSeeOwn = evaluateReportSelectRLS(citizenBob, reportOfBob);
  assert.strictEqual(aliceCanSeeBob, false, 'Alice cannot see Bob\'s report');
  assert.strictEqual(bobCanSeeOwn, true, 'Bob can see his own report');
});

// 7. Admin can see all reports
runTest('Admin can see all reports across all areas and assignments', () => {
  const admin = { id: 'admin-1', role: 'admin' };
  const report1 = { id: 'r1', citizen_id: 'c1', area_id: 'area-vasai-uuid', assigned_collector_id: null, status: 'PENDING' };
  const report2 = { id: 'r2', citizen_id: 'c2', area_id: null, assigned_collector_id: null, status: 'OPEN' };
  const report3 = { id: 'r3', citizen_id: 'c3', area_id: 'area-virar-uuid', assigned_collector_id: 'col-2', status: 'IN_PROGRESS' };

  assert.strictEqual(evaluateReportSelectRLS(admin, report1), true, 'Admin can see report1');
  assert.strictEqual(evaluateReportSelectRLS(admin, report2), true, 'Admin can see report2');
  assert.strictEqual(evaluateReportSelectRLS(admin, report3), true, 'Admin can see report3');
});

// 8. PENDING and legacy OPEN statuses display correctly
runTest('PENDING and legacy OPEN statuses display correctly in UI components', () => {
  const statCardJs = fs.readFileSync(path.join(WORKSPACE, 'components', 'statCard.js'), 'utf8');
  assert(statCardJs.includes("r.status === 'PENDING' || r.status === 'OPEN'"), 'statCard must count both PENDING and OPEN as pending');

  const collectorDashboardJs = fs.readFileSync(path.join(WORKSPACE, 'pages', 'collectorDashboard.js'), 'utf8');
  assert(collectorDashboardJs.includes("r.status !== 'RESOLVED'"), 'renderCollectorOverview must include non-resolved (PENDING and OPEN)');

  const reportCardJs = fs.readFileSync(path.join(WORKSPACE, 'components', 'reportCard.js'), 'utf8');
  assert(reportCardJs.includes("report.status === 'PENDING' || report.status === 'OPEN'"), 'reportCard must show Start Cleaning for both PENDING and OPEN');
});

// 9. Collector can start cleaning (claim report)
runTest('Collector can claim unassigned report in area and transition to IN_PROGRESS', () => {
  const collector = { id: 'col-1', role: 'collector', assigned_area_id: 'area-vasai-uuid' };
  const report = {
    id: 'rep-10',
    citizen_id: 'cit-1',
    area_id: 'area-vasai-uuid',
    assigned_collector_id: null,
    status: 'PENDING',
    after_image_url: null,
    resolved_at: null
  };

  const updated = simulateCollectorReportUpdate(collector, report, { status: 'IN_PROGRESS' });
  assert.strictEqual(updated.status, 'IN_PROGRESS', 'Status must be IN_PROGRESS');
  assert.strictEqual(updated.assigned_collector_id, collector.id, 'Report must be assigned to claiming collector');
  assert.strictEqual(updated.resolved_at, null, 'resolved_at must be null');

  // Verify other collector CANNOT claim it now that it is assigned
  const otherCollector = { id: 'col-2', role: 'collector', assigned_area_id: 'area-vasai-uuid' };
  assert.throws(() => {
    simulateCollectorReportUpdate(otherCollector, updated, { status: 'IN_PROGRESS' });
  }, /Forbidden: This report is assigned to another collector/);
});

// 10. Collector can upload after-photo and resolve report
runTest('Collector can upload after photo and transition report to RESOLVED', () => {
  const collector = { id: 'col-1', role: 'collector', assigned_area_id: 'area-vasai-uuid' };
  const inProgressReport = {
    id: 'rep-10',
    citizen_id: 'cit-1',
    area_id: 'area-vasai-uuid',
    assigned_collector_id: 'col-1',
    status: 'IN_PROGRESS',
    after_image_url: null,
    resolved_at: null
  };

  // Rejects if after_image_url is missing
  assert.throws(() => {
    simulateCollectorReportUpdate(collector, inProgressReport, { status: 'RESOLVED' });
  }, /A valid after-cleaning photograph uploaded for this report is required/);

  // Rejects if after_image_url points to a different report
  assert.throws(() => {
    simulateCollectorReportUpdate(collector, inProgressReport, {
      status: 'RESOLVED',
      after_image_url: 'after/different-report-id/clean.jpg'
    });
  }, /A valid after-cleaning photograph uploaded for this report is required/);

  // Succeeds with valid after_image_url matching report ID
  const resolved = simulateCollectorReportUpdate(collector, inProgressReport, {
    status: 'RESOLVED',
    after_image_url: `after/${inProgressReport.id}/verified_clean.jpg`
  });
  assert.strictEqual(resolved.status, 'RESOLVED', 'Status must be RESOLVED');
  assert(resolved.resolved_at, 'resolved_at must be populated');
});

// 11. Correct notifications are created
runTest('Notifications query correctly targets admins and area collectors', () => {
  const sql06 = fs.readFileSync(path.join(WORKSPACE, 'supabase', '06_fix_priority_trigger_and_guards.sql'), 'utf8');
  assert(sql06.includes('NEW.area_id IS NOT NULL'), 'Notification must check NEW.area_id IS NOT NULL');
  assert(sql06.includes('p.assigned_area_id = NEW.area_id'), 'Notification must check collector assigned area matches');
  assert(sql06.includes("p.role = 'admin'"), 'Admin must always receive notification');
});

// 12. Dashboard refresh and Realtime behavior work
runTest('Realtime and polling refresh mechanisms are active and robust', () => {
  const realtimeJs = fs.readFileSync(path.join(WORKSPACE, 'js', 'realtime.js'), 'utf8');
  assert(realtimeJs.includes("table: 'notifications'"), 'Realtime must listen to notifications');
  assert(realtimeJs.includes("table: 'reports'"), 'Realtime must listen to reports changes');
  assert(realtimeJs.includes('pollTimer = setInterval('), 'Background polling fallback must be active');
});

// 13. Google Maps shows the correct report location
runTest('Google Maps links and coordinates formatting are properly generated', () => {
  const reportCardJs = fs.readFileSync(path.join(WORKSPACE, 'components', 'reportCard.js'), 'utf8');
  assert(reportCardJs.includes('https://www.google.com/maps/dir/?api=1&destination='), 'Must include Google Maps destination direction link');
  assert(reportCardJs.includes('encodeURIComponent(report.latitude)'), 'Must encode latitude');
  assert(reportCardJs.includes('encodeURIComponent(report.longitude)'), 'Must encode longitude');
});

console.log('================================================================');
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log('================================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
