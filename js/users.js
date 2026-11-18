/**
 * Admin User & Role Management Controller
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});

  async function changeUserRole(userId, newRole) {
    if (!GC.state.me || GC.state.me.role !== 'admin') {
      return GC.utils.dom.toast('Admin permission required.', 3500);
    }
    try {
      await GC.db.adminUpdateUserRole(userId, newRole);
      GC.state.profiles = await GC.db.fetchAllProfiles();
      GC.utils.dom.toast('✅ User role updated to ' + newRole, 3000);
      GC.app.render();
    } catch (err) {
      GC.utils.dom.toast('⚠️ ' + (err.message || 'Could not update role'), 4500);
      GC.app.render();
    }
  }

  async function assignCollectorArea(collectorId, areaId) {
    if (!GC.state.me || GC.state.me.role !== 'admin') {
      return GC.utils.dom.toast('Admin permission required.', 3500);
    }
    try {
      await GC.db.adminAssignCollectorArea(collectorId, areaId || null);
      GC.state.profiles = await GC.db.fetchAllProfiles();
      GC.utils.dom.toast('✅ Collector area assignment updated', 3000);
      GC.app.render();
    } catch (err) {
      GC.utils.dom.toast('⚠️ ' + (err.message || 'Could not update collector area'), 4500);
      GC.app.render();
    }
  }

  GC.users = {
    changeUserRole: changeUserRole,
    assignCollectorArea: assignCollectorArea
  };
})(window);
