/**
 * Supabase Database Access Layer
 * Encapsulates all PostgREST queries and RPC calls across profiles, service_areas,
 * reports, notifications, and report_status_history.
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});

  function requireClient() {
    if (!GC.supabase) {
      throw new Error(
        'Supabase SDK failed to load. Check your internet connection and reload.'
      );
    }
    return GC.supabase;
  }

  /* ---------------- PROFILES ---------------- */

  async function fetchProfile(userId) {
    var sb = requireClient();
    var res = await sb
      .from('profiles')
      .select('id, full_name, phone, email, role, assigned_area_id, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle();
    if (res.error) throw res.error;
    return res.data;
  }

  async function ensureProfile(authUser, fallbackMeta) {
    var existing = await fetchProfile(authUser.id);
    if (existing) return existing;

    var meta = Object.assign({}, authUser.user_metadata || {}, fallbackMeta || {});
    var requestedRole = String(meta.role || 'citizen').toLowerCase();
    var safeRole = requestedRole === 'collector' ? 'collector' : 'citizen';
    var fullName = String(meta.full_name || authUser.email || 'User').trim();
    if (fullName.length < 2) fullName = 'User';

    var sb = requireClient();
    var res = await sb
      .from('profiles')
      .insert({
        id: authUser.id,
        full_name: fullName,
        phone: meta.phone || authUser.phone || null,
        email: authUser.email || null,
        role: safeRole
      })
      .select('id, full_name, phone, email, role, assigned_area_id, created_at, updated_at')
      .single();

    if (res.error) throw res.error;
    return res.data;
  }

  async function updateOwnProfile(userId, updates) {
    var sb = requireClient();
    var payload = {};
    if (typeof updates.full_name === 'string') payload.full_name = updates.full_name;
    if (typeof updates.phone === 'string') payload.phone = updates.phone;

    var res = await sb
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select('id, full_name, phone, email, role, assigned_area_id, created_at, updated_at')
      .single();
    if (res.error) throw res.error;
    return res.data;
  }

  async function fetchAllProfiles() {
    var sb = requireClient();
    var res = await sb
      .from('profiles')
      .select('id, full_name, phone, email, role, assigned_area_id, created_at')
      .order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function adminUpdateUserRole(targetUserId, newRole) {
    var sb = requireClient();
    var res = await sb.rpc('admin_update_user_role', {
      p_target_user_id: targetUserId,
      p_new_role: newRole
    });
    if (res.error) throw res.error;
  }

  async function adminAssignCollectorArea(collectorId, areaId) {
    var sb = requireClient();
    var res = await sb.rpc('admin_assign_collector_area', {
      p_collector_id: collectorId,
      p_area_id: areaId || null
    });
    if (res.error) throw res.error;
  }

  /* ---------------- SERVICE AREAS ---------------- */

  async function fetchServiceAreas() {
    var sb = requireClient();
    var res = await sb
      .from('service_areas')
      .select('id, area_name, latitude, longitude, radius, created_at, updated_at')
      .order('area_name', { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function createServiceArea(payload) {
    var sb = requireClient();
    var res = await sb
      .from('service_areas')
      .insert(payload)
      .select('id, area_name, latitude, longitude, radius, created_at, updated_at')
      .single();
    if (res.error) throw res.error;
    return res.data;
  }

  async function updateServiceArea(areaId, payload) {
    var sb = requireClient();
    var res = await sb
      .from('service_areas')
      .update(payload)
      .eq('id', areaId)
      .select('id, area_name, latitude, longitude, radius, created_at, updated_at')
      .single();
    if (res.error) throw res.error;
    return res.data;
  }

  async function deleteServiceArea(areaId) {
    var sb = requireClient();
    var res = await sb.from('service_areas').delete().eq('id', areaId);
    if (res.error) throw res.error;
  }

  /* ---------------- REPORTS ---------------- */

  async function fetchReports() {
    var sb = requireClient();
    var res = await sb
      .from('reports')
      .select(
        'id, report_number, citizen_id, category, severity, description, latitude, longitude, ' +
          'location_accuracy, location_verified, before_image_url, after_image_url, area_id, ' +
          'assigned_collector_id, priority, priority_score, status, created_at, updated_at, resolved_at, ' +
          'citizen:profiles!reports_citizen_id_fkey(id, full_name, phone), ' +
          'collector:profiles!reports_assigned_collector_id_fkey(id, full_name), ' +
          'area:service_areas!reports_area_id_fkey(id, area_name)'
      )
      .order('created_at', { ascending: false });

    if (res.error) throw res.error;
    return res.data || [];
  }

  async function createReport(payload) {
    var sb = requireClient();
    var res = await sb
      .from('reports')
      .insert(payload)
      .select(
        'id, report_number, citizen_id, category, severity, description, latitude, longitude, ' +
          'location_accuracy, location_verified, before_image_url, after_image_url, area_id, ' +
          'assigned_collector_id, priority, priority_score, status, created_at, updated_at, resolved_at'
      )
      .single();
    if (res.error) throw res.error;
    return res.data;
  }

  async function updateReportStatus(reportId, payload) {
    var sb = requireClient();
    var res = await sb
      .from('reports')
      .update(payload)
      .eq('id', reportId)
      .select('id, report_number, status, after_image_url, resolved_at, assigned_collector_id')
      .single();
    if (res.error) throw res.error;
    return res.data;
  }

  async function adminUpdateReportAssignment(reportId, areaId, collectorId, priority) {
    var sb = requireClient();
    var res = await sb.rpc('admin_update_report_assignment', {
      p_report_id: reportId,
      p_area_id: areaId || null,
      p_collector_id: collectorId || null,
      p_priority: priority || null
    });
    if (res.error) throw res.error;
  }

  /* ---------------- REPORT STATUS HISTORY ---------------- */

  async function fetchReportHistory(reportId) {
    var sb = requireClient();
    var res = await sb
      .from('report_status_history')
      .select(
        'id, report_id, old_status, new_status, remarks, created_at, ' +
          'actor:profiles!report_status_history_updated_by_fkey(full_name, role)'
      )
      .eq('report_id', reportId)
      .order('created_at', { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
  }

  /* ---------------- NOTIFICATIONS ---------------- */

  async function fetchNotifications(userId, isAdminMonitor) {
    var sb = requireClient();
    var query = sb
      .from('notifications')
      .select('id, user_id, report_id, title, message, is_read, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!isAdminMonitor) {
      query = query.eq('user_id', userId);
    }

    var res = await query;
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function markNotificationsRead(userId) {
    var sb = requireClient();
    var res = await sb
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (res.error) throw res.error;
  }

  GC.db = {
    fetchProfile: fetchProfile,
    ensureProfile: ensureProfile,
    updateOwnProfile: updateOwnProfile,
    fetchAllProfiles: fetchAllProfiles,
    adminUpdateUserRole: adminUpdateUserRole,
    adminAssignCollectorArea: adminAssignCollectorArea,
    fetchServiceAreas: fetchServiceAreas,
    createServiceArea: createServiceArea,
    updateServiceArea: updateServiceArea,
    deleteServiceArea: deleteServiceArea,
    fetchReports: fetchReports,
    createReport: createReport,
    updateReportStatus: updateReportStatus,
    adminUpdateReportAssignment: adminUpdateReportAssignment,
    fetchReportHistory: fetchReportHistory,
    fetchNotifications: fetchNotifications,
    markNotificationsRead: markNotificationsRead
  };
})(window);
