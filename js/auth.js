/**
 * Simplified Identity Login & Server-Side Session Controller
 *
 * SECURITY NOTICE:
 * - Anonymous Supabase Authentication provides a real signed JWT for Storage
 *   RLS scoping, NOT cryptographic verification of a person's name or phone.
 * - Admin permissions are NEVER granted from client-side role selection; they
 *   are enforced exclusively server-side in PostgreSQL (`profiles` + RLS).
 */
(function (global) {
  'use strict';

  var GC = (global.GC = global.GC || {});

  function syncLoginInputs() {
    var $ = GC.utils.dom.$;
    var nameEl = $('#login-name');
    var phoneEl = $('#login-phone');
    if (nameEl) GC.state.authUI.fullName = nameEl.value;
    if (phoneEl) GC.state.authUI.phone = phoneEl.value;
  }

  function selectRole(roleKey) {
    syncLoginInputs();
    if (['citizen', 'collector', 'admin'].indexOf(roleKey) === -1) {
      roleKey = 'citizen';
    }
    GC.state.authUI.role = roleKey;
    GC.app.renderLogin();
  }

  function normalizePhoneDigits(raw) {
    var digits = String(raw || '').replace(/[^0-9]/g, '');
    if (digits.length === 12 && digits.indexOf('91') === 0) {
      digits = digits.slice(2);
    }
    return digits;
  }

  /**
   * Ensures a live Supabase Auth anonymous session exists and returns it.
   * Returns { session, error } without swallowing diagnostic errors.
   */
  async function ensureAnonymousJwt() {
    if (!GC.supabase || !GC.supabase.auth) {
      return { session: null, error: new Error('Supabase Auth client unavailable.') };
    }
    try {
      var existing = await GC.supabase.auth.getSession();
      if (existing && existing.data && existing.data.session && existing.data.session.access_token) {
        return { session: existing.data.session, error: null };
      }
      if (typeof GC.supabase.auth.signInAnonymously !== 'function') {
        return { session: null, error: new Error('signInAnonymously() is not supported by this SDK version.') };
      }
      var res = await GC.supabase.auth.signInAnonymously();
      if (res.error) {
        return { session: null, error: res.error };
      }
      return { session: res.data ? res.data.session : null, error: null };
    } catch (err) {
      return { session: null, error: err };
    }
  }

  /**
   * Guarantees an active Supabase anonymous JWT is established AND bound in
   * `public.user_sessions` to the logged-in user's database profile before
   * uploading or signing private Storage URLs.
   */
  async function ensureStorageAuth() {
    if (!GC.supabase || !GC.state.me) {
      throw new Error('Please log in before accessing private report photos.');
    }

    var authResult = await ensureAnonymousJwt();
    if (authResult.error || !authResult.session) {
      var detail = authResult.error && authResult.error.message ? authResult.error.message : 'No anonymous session returned';
      throw new Error('Anonymous authentication failed: ' + detail);
    }

    // Bind auth.uid() to the current server-side x-gc-session if not yet bound
    var bindRes = await GC.supabase.rpc('gc_bind_auth_session');
    if (bindRes.error) {
      // Fallback if 05_storage_rls_policies.sql hasn't been executed yet:
      // re-establish server-side session binding via gc_simple_login using verified DB profile
      if (/PGRST202|Could not find the function public\.gc_bind_auth_session/i.test(bindRes.error.message || '')) {
        var me = GC.state.me;
        if (me && me.phone && me.role) {
          var relogin = await GC.supabase.rpc('gc_simple_login', {
            p_full_name: me.full_name,
            p_phone: me.phone,
            p_role: me.role
          });
          if (!relogin.error && relogin.data && relogin.data.session_token) {
            GC.supabaseConfig.setSessionToken(relogin.data.session_token);
          }
        }
      } else {
        throw bindRes.error;
      }
    }

    return authResult.session;
  }

  async function hydrateAuthorizedUser(profile) {
    GC.state.me = profile;
    GC.state.tab = 'home';
    GC.state.dbError = null;
    try {
      // Ensure anonymous JWT is bound before preloading private signed image URLs
      try {
        await ensureStorageAuth();
      } catch (authErr) {
        // Non-blocking on initial render; surfaced clearly on upload if still failing
      }
      await GC.state.refreshAll();
      GC.realtime.subscribe(profile);
    } catch (err) {
      GC.state.dbError =
        (err && err.message) || 'Could not load dashboard data from Supabase.';
    }
  }

  async function login(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    if (!GC.supabase) {
      return GC.utils.dom.toast(
        'Supabase SDK is not loaded. Check your internet connection and reload.',
        4500
      );
    }

    syncLoginInputs();
    var $ = GC.utils.dom.$;
    var fullName = ($('#login-name') ? $('#login-name').value : GC.state.authUI.fullName || '').trim();
    var rawPhone = ($('#login-phone') ? $('#login-phone').value : GC.state.authUI.phone || '').trim();
    var digits = normalizePhoneDigits(rawPhone);
    var selectedRole = GC.state.authUI.role || 'citizen';

    if (fullName.length < 2) {
      return GC.utils.dom.toast('Please enter your User Name (at least 2 characters).', 3200);
    }
    if (!/^\d{10,15}$/.test(digits)) {
      return GC.utils.dom.toast('Please enter a valid 10-digit Phone Number.', 3200);
    }

    GC.state.busy = true;
    GC.app.renderLogin();

    try {
      // 1. Establish real Supabase anonymous auth session BEFORE gc_simple_login
      //    so auth.uid() is immediately bound in public.user_sessions.
      var anon = await ensureAnonymousJwt();
      if (anon.error) {
        console.warn('[GC Auth] Anonymous sign-in notice:', anon.error.message || anon.error);
      }

      // 2. Validate role/phone & create server-side session in PostgreSQL
      var res = await GC.supabase.rpc('gc_simple_login', {
        p_full_name: fullName,
        p_phone: digits,
        p_role: selectedRole
      });

      if (res.error) throw res.error;
      if (!res.data || !res.data.profile || !res.data.session_token) {
        throw new Error('Unexpected login response from Supabase.');
      }

      // 3. Store opaque session token (single persistent Supabase client keeps anonymous JWT!)
      GC.supabaseConfig.setSessionToken(res.data.session_token);
      await hydrateAuthorizedUser(res.data.profile);

      GC.state.busy = false;
      GC.utils.dom.toast(
        res.data.is_new_user
          ? '✅ Profile created! Welcome, ' + res.data.profile.full_name
          : '✅ Welcome back, ' + res.data.profile.full_name,
        3500
      );
      GC.app.render();
    } catch (err) {
      GC.state.busy = false;
      var errMsg = (err && err.message) || 'Login failed';
      if (/PGRST202|Could not find the function public\.gc_simple_login/i.test(errMsg)) {
        errMsg =
          'Database setup required: run supabase/RUN_ALL_SETUP.sql in your Supabase SQL Editor to create tables and gc_simple_login().';
      }
      GC.utils.dom.toast('⚠️ ' + errMsg, 7000);
      GC.app.renderLogin();
    }
  }

  async function restoreSession() {
    if (!GC.supabase) {
      GC.state.loadingSession = false;
      GC.app.renderLogin();
      return;
    }

    var token = GC.supabaseConfig.getSessionToken();
    if (!token) {
      GC.state.loadingSession = false;
      GC.app.renderLogin();
      return;
    }

    try {
      var res = await GC.supabase.rpc('gc_get_session');
      if (res.error || !res.data || !res.data.id) {
        GC.supabaseConfig.clearSessionToken();
        GC.state.clearUserData();
        GC.state.loadingSession = false;
        GC.app.renderLogin();
        return;
      }

      await hydrateAuthorizedUser(res.data);
      GC.state.loadingSession = false;
      GC.app.render();
    } catch (err) {
      GC.supabaseConfig.clearSessionToken();
      GC.state.clearUserData();
      GC.state.loadingSession = false;
      GC.app.renderLogin();
    }
  }

  async function updateProfile() {
    if (!GC.state.me) return;
    var $ = GC.utils.dom.$;
    var nameInput = $('#pn');
    var phoneInput = $('#pp');
    var nextName = nameInput ? nameInput.value.trim() : GC.state.me.full_name;
    var nextPhone = phoneInput ? normalizePhoneDigits(phoneInput.value) : GC.state.me.phone || '';

    if (nextName.length < 2) {
      return GC.utils.dom.toast('Name must be at least 2 characters.', 3000);
    }
    if (nextPhone && !/^\d{10,15}$/.test(nextPhone)) {
      return GC.utils.dom.toast('Enter a valid 10-digit phone number.', 3000);
    }

    try {
      var updated = await GC.db.updateOwnProfile(GC.state.me.id, {
        full_name: nextName,
        phone: nextPhone || GC.state.me.phone
      });
      GC.state.me = updated;
      GC.utils.dom.toast('✅ Profile updated in Supabase', 2800);
      GC.app.render();
    } catch (err) {
      GC.utils.dom.toast(
        '⚠️ ' + (err && err.message ? err.message : 'Could not update profile'),
        4500
      );
    }
  }

  async function logout() {
    GC.utils.camera.stopCam();
    GC.realtime.unsubscribe();

    if (GC.supabase) {
      try {
        await GC.supabase.rpc('gc_simple_logout');
      } catch (err) {
        // Proceed with cleanup even if offline
      }
      try {
        if (GC.supabase.auth) await GC.supabase.auth.signOut();
      } catch (err) {}
    }

    GC.supabaseConfig.clearSessionToken();
    GC.state.clearUserData();
    GC.app.renderLogin();
    GC.utils.dom.toast('Logged out.', 2500);
  }

  GC.auth = {
    selectRole: selectRole,
    login: login,
    restoreSession: restoreSession,
    ensureAnonymousJwt: ensureAnonymousJwt,
    ensureStorageAuth: ensureStorageAuth,
    updateProfile: updateProfile,
    logout: logout
  };
})(window);
