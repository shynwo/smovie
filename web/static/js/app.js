(function () {
  const heroMedia = document.getElementById("hero-media");
  const heroSection = document.querySelector(".hero");
  const heroLogo = document.getElementById("hero-logo");
  const heroTitle = document.getElementById("hero-title");
  const heroSubtitle = document.getElementById("hero-subtitle");
  const heroMetaTop = document.getElementById("hero-meta-top");
  const heroKicker1 = document.getElementById("hero-kicker-1");
  const heroKicker2 = document.getElementById("hero-kicker-2");
  const heroKicker3 = document.getElementById("hero-kicker-3");
  const heroKickerDot1 = document.getElementById("hero-kicker-dot-1");
  const heroKickerDot2 = document.getElementById("hero-kicker-dot-2");
  const heroGenreLine = document.getElementById("hero-genre-line");
  const heroStatLine = document.querySelector(".hero-stat-line");
  const heroRating = document.getElementById("hero-rating");
  const heroDuration = document.getElementById("hero-duration");
  const heroYear = document.getElementById("hero-year");
  const heroMatch = document.getElementById("hero-match");
  const heroPrimary = document.getElementById("hero-cta-primary");
  const heroSecondary = document.getElementById("hero-cta-secondary");
  const heroInfoBtn = document.getElementById("hero-cta-info");
  const rowsContainer = document.getElementById("rows-container");
  const searchEmpty = document.getElementById("search-empty");
  const navButtons = Array.from(document.querySelectorAll("[data-nav-view]"));
  const topSearch = document.getElementById("top-search");
  const topSearchToggle = document.getElementById("top-search-toggle");
  const topSearchInput = document.getElementById("top-search-input");
  const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
  const mobileDropdown = document.getElementById("mobile-dropdown");
  const profileAvatarButton = document.getElementById("profile-avatar-btn");
  const avatarHub = document.getElementById("avatar-hub");
  const avatarHubCloseTriggers = document.querySelectorAll("[data-close-avatar-hub]");
  const avatarHubBadge = document.getElementById("avatar-hub-badge");
  const avatarHubName = document.getElementById("avatar-hub-name");
  const avatarMenuSwitchProfileBtn = document.getElementById("avatar-menu-switch-profile");
  const avatarMenuSettingsBtn = document.getElementById("avatar-menu-settings");
  const avatarMenuLogoutBtn = document.getElementById("avatar-menu-logout");
  const profileSwitcher = document.getElementById("profile-switcher");
  const profileGrid = document.getElementById("profile-grid");
  const profileForm = document.getElementById("profile-form");
  const profileNameInput = document.getElementById("profile-name-input");
  const profileColorInput = document.getElementById("profile-color-input");
  const profileCancelBtn = document.getElementById("profile-cancel-btn");
  const profileCloseTriggers = document.querySelectorAll("[data-close-profile-switcher]");
  const authGate = document.getElementById("auth-gate");
  const authForm = document.getElementById("auth-form");
  const authUsernameInput = document.getElementById("auth-username");
  const authPasswordInput = document.getElementById("auth-password");
  const authMessage = document.getElementById("auth-message");
  const authLoginBtn = document.getElementById("auth-login-btn");
  const authRegisterBtn = document.getElementById("auth-register-btn");
  const initialViewFromServer = String((document.body && document.body.getAttribute("data-initial-view")) || "home");
  const initialProfileColorFromServer = normalizeHexColor(
    document.body && document.body.getAttribute("data-profile-color-init"),
    "#f97316"
  );
  const initialProfileNameFromServer = String(
    (document.body && document.body.getAttribute("data-profile-name-init")) || "Profil actif"
  ).trim();
  const initialAvatarFromServer = String((document.body && document.body.getAttribute("data-avatar-init")) || "ST").trim();
  const initialProfileIdFromServer = String(
    (document.body && document.body.getAttribute("data-active-profile-id")) || "profile-seed"
  ).trim();

  const THEME_STORAGE_KEY = "smovie.theme.v1";
  const GLASS_THEME_NAME = "glass";
  const MAX_PROFILES = 8;
  const defaultProfiles = [
    {
      id: initialProfileIdFromServer || "profile-seed",
      name: initialProfileNameFromServer || "Profil actif",
      color: initialProfileColorFromServer,
      avatar: ""
    }
  ];

  let profiles = [];
  let activeProfileId = "";
  let favoritesByProfile = {};
  let progressByProfile = {};
  let authUser = null;
  let authMode = "login";
  let activeTheme = GLASS_THEME_NAME;
  let currentView = "home";
  let currentSearchQuery = "";
  let searchFromUrlHydrated = false;
  let catalogState = { hero: {}, rows: [] };
  /** Liste plate + index pour éviter de reconstruire le catalogue à chaque lookup (titre, hero, favoris). */
  let catalogItemsFlat = [];
  let catalogByItemKey = new Map();
  let catalogBySlug = new Map();
  let catalogItemsByTitle = new Map();
  let currentHeroItemKey = "";
  let tvKeyboardNavWired = false;
  let rowStripPointerWired = false;
  let rowStripResizeWired = false;
  let rowStripRaf = 0;
  let rowStripPointerStrip = null;
  let rowStripPointerX = 0;
  const FETCH_TIMEOUT_MS = 7000;
  const RESUME_MIN_SECONDS = 8;
  const RESUME_END_BUFFER_SECONDS = 20;
  const RESUME_END_RATIO = 0.97;
  let heroBgRequestId = 0;
  let heroLogoRequestId = 0;

  const preloadedHeroImages = new Set();

  const fallbackRows = [
    {
      title: "Tendances actuelles",
      items: [
        { title: "Nuit Rouge", genre: "Thriller", rating: "16+", duration: "2h 05min", tags: ["Thriller", "Noir", "Crime"], image: "/static/template-assets/movie-6.jpg" },
        { title: "Le Dernier Samourai", genre: "Action", rating: "13+", duration: "2h 34min", tags: ["Action", "Drame", "Historique"], image: "/static/template-assets/movie-1.jpg" },
        { title: "Neon District", genre: "Sci-Fi", rating: "16+", duration: "2h 18min", tags: ["Cyberpunk", "Action", "Sci-Fi"], image: "/static/template-assets/movie-8.jpg" },
        { title: "Orbite Zero", genre: "Sci-Fi", rating: "13+", duration: "2h 11min", tags: ["Sci-Fi", "Thriller", "Drame"], image: "/static/template-assets/movie-3.jpg" }
      ]
    },
    {
      title: "Nouveautes",
      items: [
        { title: "Abysses", genre: "Aventure", rating: "13+", duration: "1h 58min", tags: ["Aventure", "Mystere", "Sci-Fi"], image: "/static/template-assets/movie-2.jpg" },
        { title: "Horizons Perdus", genre: "Drame", rating: "13+", duration: "2h 22min", tags: ["Aventure", "Drame", "Survie"], image: "/static/template-assets/movie-5.jpg" },
        { title: "Le Passage", genre: "Fantasy", rating: "16+", duration: "1h 47min", tags: ["Fantasy", "Horreur", "Mystere"], image: "/static/template-assets/movie-4.jpg" },
        { title: "Altitude", genre: "Aventure", rating: "10+", duration: "1h 52min", tags: ["Aventure", "Drame", "Nature"], image: "/static/template-assets/movie-7.jpg" }
      ]
    }
  ];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeUrl(input) {
    if (typeof input !== "string" || !input.trim()) return "";
    return encodeURI(input.trim()).replace(/'/g, "%27").replace(/\)/g, "%29");
  }

  function preloadImageAsset(url) {
    const target = String(url || "").trim();
    if (!target) return Promise.resolve(false);
    if (preloadedHeroImages.has(target)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const img = new Image();
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        if (ok) preloadedHeroImages.add(target);
        resolve(ok);
      };

      img.decoding = "async";
      img.onload = () => done(true);
      img.onerror = () => done(false);
      img.src = target;

      if (img.complete && img.naturalWidth > 0) {
        done(true);
      } else {
        window.setTimeout(() => done(false), 2600);
      }
    });
  }

  function initialsFromName(name) {
    const value = String(name || "").trim();
    if (!value) return "ST";
    const parts = value.split(/\s+/).filter(Boolean);
    if (!parts.length) return "ST";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }

  function normalizeHexColor(input, fallback) {
    const value = String(input || "").trim();
    if (/^#[\da-fA-F]{6}$/.test(value)) return value;
    return fallback;
  }

  function hexToRgba(hex, alpha) {
    const normalized = normalizeHexColor(hex, "#f97316");
    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function hexToRgbTriplet(hex) {
    const normalized = normalizeHexColor(hex, "#f97316");
    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  }

  function applyProfileAccent(accentHex) {
    const accent = normalizeHexColor(accentHex, "#f97316");
    const rgb = hexToRgbTriplet(accent);
    const root = document.documentElement;
    const body = document.body;
    if (root) {
      root.style.setProperty("--primary", accent);
      root.style.setProperty("--primary-rgb", rgb);
      root.style.setProperty("--focus-ring", `rgba(${rgb}, 0.9)`);
      root.style.setProperty("--focus-ring-soft", `rgba(${rgb}, 0.22)`);
    }
    if (body) {
      body.style.setProperty("--primary", accent);
      body.style.setProperty("--primary-rgb", rgb);
      body.style.setProperty("--focus-ring", `rgba(${rgb}, 0.9)`);
      body.style.setProperty("--focus-ring-soft", `rgba(${rgb}, 0.22)`);
    }
  }

  function normalizeThemeName() {
    return GLASS_THEME_NAME;
  }

  function applyTheme(themeName) {
    activeTheme = normalizeThemeName(themeName);
    document.documentElement.setAttribute("data-theme", activeTheme);
    if (document.body) {
      document.body.setAttribute("data-theme", activeTheme);
      document.body.classList.add("theme-glass");
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, activeTheme);
    } catch (error) {
      // Ignore localStorage write failures.
    }
  }

  function loadThemeState() {
    let storedTheme = GLASS_THEME_NAME;
    try {
      storedTheme = localStorage.getItem(THEME_STORAGE_KEY) || GLASS_THEME_NAME;
    } catch (error) {
      storedTheme = GLASS_THEME_NAME;
    }
    applyTheme(storedTheme);
  }

  async function apiJson(url, options) {
    const opts = options && typeof options === "object" ? { ...options } : {};
    const headers = { Accept: "application/json", ...(opts.headers || {}) };
    if (opts.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...opts,
      headers
    });

    let data = null;
    try {
      data = await response.json();
    } catch (_error) {
      data = null;
    }

    if (!response.ok) {
      const message = data && data.message ? String(data.message) : `HTTP ${response.status}`;
      throw new Error(message);
    }
    return data || {};
  }

  function showAuthGate(message) {
    if (!authGate) return;
    if (authMessage) authMessage.textContent = message || "Connecte-toi pour synchroniser tes profils et favoris.";
    authGate.classList.add("open");
    authGate.setAttribute("aria-hidden", "false");
    document.body.classList.add("auth-gate-open");
    if (authUsernameInput) authUsernameInput.focus();
  }

  function hideAuthGate() {
    if (!authGate) return;
    authGate.classList.remove("open");
    authGate.setAttribute("aria-hidden", "true");
    document.body.classList.remove("auth-gate-open");
    if (authPasswordInput) authPasswordInput.value = "";
  }

  function normalizeViewName(view) {
    const value = String(view || "").trim().toLowerCase();
    if (value === "my-list") return "my-list";
    if (value === "films") return "films";
    if (value === "series") return "series";
    if (value === "documentaires") return "documentaires";
    return "home";
  }

  function normalizeKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^\w-]+/g, "");
  }

  function buildItemKey(item) {
    const title = normalizeKey(item && item.title);
    const year = normalizeKey(item && item.year);
    const image = normalizeKey(item && (item.card_image || item.cardImage || item.image));
    return [title || "item", year || "0", image || "na"].join("|");
  }

  function buildDetailUrl(item) {
    const src = item && typeof item === "object" ? item : {};
    const kind = String(src.kind || "").trim().toLowerCase();
    const slugRaw = String(src.slug || "").trim();
    const slug = normalizeKey(slugRaw || `${String(src.title || "").trim()}-${String(src.year || "").trim()}`);
    if (!slug) return "";
    if (kind === "series") return `/serie/${encodeURIComponent(slug)}`;
    return `/film/${encodeURIComponent(slug)}`;
  }

  function normalizeFavoritesState(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out = {};
    Object.entries(raw).forEach(([profileId, values]) => {
      const pid = String(profileId || "").trim();
      if (!pid) return;
      if (!Array.isArray(values)) return;
      const clean = [];
      const seen = new Set();
      values.forEach((entry) => {
        const key = String(entry || "").trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        clean.push(key);
      });
      out[pid] = clean;
    });
    return out;
  }

  async function loadFavoritesState() {
    if (!authUser) {
      favoritesByProfile = {};
      return;
    }
    try {
      const data = await apiJson("/api/favorites");
      favoritesByProfile = normalizeFavoritesState(data && data.by_profile ? data.by_profile : {});
    } catch (error) {
      favoritesByProfile = {};
      console.warn("Impossible de charger les favoris serveur.", error);
    }
  }

  async function loadFavoritesForProfile(profileId) {
    const id = String(profileId || "").trim();
    if (!id || !authUser) return;
    try {
      const data = await apiJson(`/api/favorites?profile_id=${encodeURIComponent(id)}`);
      const items = Array.isArray(data && data.items) ? data.items.map((value) => String(value)) : [];
      favoritesByProfile[id] = items;
    } catch (error) {
      favoritesByProfile[id] = favoritesByProfile[id] || [];
      console.warn("Impossible de charger les favoris du profil.", error);
    }
  }

  function normalizeProgressState(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out = {};
    Object.entries(raw).forEach(([profileId, progressMap]) => {
      const pid = String(profileId || "").trim();
      if (!pid) return;
      if (!progressMap || typeof progressMap !== "object" || Array.isArray(progressMap)) return;
      const cleanMap = {};
      Object.entries(progressMap).forEach(([itemKey, progressRaw]) => {
        const key = String(itemKey || "").trim();
        if (!key) return;
        if (!progressRaw || typeof progressRaw !== "object") return;
        const positionSeconds = Number(progressRaw.position_seconds);
        const durationSeconds = Number(progressRaw.duration_seconds);
        cleanMap[key] = {
          position_seconds: Number.isFinite(positionSeconds) ? Math.max(0, positionSeconds) : 0,
          duration_seconds: Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0,
          updated_at: Number(progressRaw.updated_at) || 0
        };
      });
      out[pid] = cleanMap;
    });
    return out;
  }

  async function loadProgressState() {
    if (!authUser) {
      progressByProfile = {};
      return;
    }
    try {
      const data = await apiJson("/api/progress");
      progressByProfile = normalizeProgressState(data && data.by_profile ? data.by_profile : {});
    } catch (error) {
      progressByProfile = {};
      console.warn("Impossible de charger la reprise de lecture serveur.", error);
    }
  }

  async function loadProgressForProfile(profileId) {
    const id = String(profileId || "").trim();
    if (!id || !authUser) return;
    try {
      const data = await apiJson(`/api/progress?profile_id=${encodeURIComponent(id)}`);
      const items = data && data.items ? data.items : {};
      const normalized = normalizeProgressState({ [id]: items });
      progressByProfile[id] = normalized[id] || {};
    } catch (error) {
      progressByProfile[id] = progressByProfile[id] || {};
      console.warn("Impossible de charger la reprise du profil.", error);
    }
  }

  function getProgressMapForProfile(profileId) {
    const id = String(profileId || "").trim();
    if (!id) return {};
    if (!progressByProfile[id] || typeof progressByProfile[id] !== "object") {
      progressByProfile[id] = {};
    }
    return progressByProfile[id];
  }

  function shouldClearProgressAtPosition(positionSeconds, durationSeconds) {
    const position = Number(positionSeconds);
    const duration = Number(durationSeconds);
    if (!Number.isFinite(position) || position < RESUME_MIN_SECONDS) return true;
    if (!Number.isFinite(duration) || duration <= 0) return false;
    const nearEndThreshold = Math.max(duration * RESUME_END_RATIO, duration - RESUME_END_BUFFER_SECONDS);
    return position >= nearEndThreshold;
  }

  function getSavedProgressSeconds(profileId, itemKey) {
    const pid = String(profileId || "").trim();
    const key = String(itemKey || "").trim();
    if (!pid || !key) return 0;
    const progressMap = getProgressMapForProfile(pid);
    const entry = progressMap[key];
    if (!entry || typeof entry !== "object") return 0;
    const position = Number(entry.position_seconds);
    const duration = Number(entry.duration_seconds);
    if (!Number.isFinite(position) || position <= 0) return 0;
    if (shouldClearProgressAtPosition(position, duration)) return 0;
    return position;
  }

  function setLocalProgress(profileId, itemKey, positionSeconds, durationSeconds, updatedAt) {
    const pid = String(profileId || "").trim();
    const key = String(itemKey || "").trim();
    if (!pid || !key) return;
    const progressMap = getProgressMapForProfile(pid);
    progressMap[key] = {
      position_seconds: Number.isFinite(Number(positionSeconds)) ? Math.max(0, Number(positionSeconds)) : 0,
      duration_seconds: Number.isFinite(Number(durationSeconds)) ? Math.max(0, Number(durationSeconds)) : 0,
      updated_at: Number(updatedAt) || Math.floor(Date.now() / 1000)
    };
  }

  function clearLocalProgress(profileId, itemKey) {
    const pid = String(profileId || "").trim();
    const key = String(itemKey || "").trim();
    if (!pid || !key) return;
    const progressMap = getProgressMapForProfile(pid);
    if (Object.prototype.hasOwnProperty.call(progressMap, key)) {
      delete progressMap[key];
    }
  }

  function getActiveFavoritesSet() {
    const profileId = String(activeProfileId || "").trim();
    if (!profileId) return new Set();
    if (!Array.isArray(favoritesByProfile[profileId])) {
      favoritesByProfile[profileId] = [];
    }
    return new Set(favoritesByProfile[profileId]);
  }

  async function toggleFavorite(itemKey) {
    const key = String(itemKey || "").trim();
    if (!key) return false;
    if (!authUser) {
      showAuthGate("Connecte-toi pour gerer ta liste.");
      throw new Error("Connexion requise.");
    }

    let profileId = String(activeProfileId || "").trim();
    if (!profileId || !profiles.some((profile) => String(profile.id) === profileId)) {
      await fetchProfilesFromServer();
      profileId = String(activeProfileId || "").trim();
    }
    if (!profileId && Array.isArray(profiles) && profiles.length) {
      profileId = String(profiles[0].id || "").trim();
      if (profileId) {
        activeProfileId = profileId;
        saveProfilesState();
        await syncActiveProfileToServer(profileId);
      }
    }
    if (!profileId) {
      throw new Error("Profil introuvable.");
    }

    const data = await apiJson("/api/favorites/toggle", {
      method: "POST",
      body: JSON.stringify({ profile_id: profileId, item_key: key })
    });
    const items = Array.isArray(data && data.items) ? data.items.map((value) => String(value)) : [];
    favoritesByProfile[profileId] = items;
    return Boolean(data && data.active);
  }

  function normalizeProfiles(rawProfiles) {
    if (!Array.isArray(rawProfiles)) return defaultProfiles.slice();
    const cleaned = rawProfiles
      .map((profile, idx) => {
        const name = String(profile && profile.name ? profile.name : "").trim().slice(0, 24);
        if (!name) return null;
        const color = normalizeHexColor(profile.color, "#f97316");
        const avatar = typeof profile.avatar === "string" ? profile.avatar.trim() : "";
        const fallbackId = `profile-${idx + 1}`;
        const id = String(profile.id || fallbackId).trim();
        if (!id) return null;
        return { id, name, color, avatar };
      })
      .filter(Boolean);

    return cleaned.length ? cleaned.slice(0, MAX_PROFILES) : defaultProfiles.slice();
  }

  function loadProfilesState() {
    try {
      localStorage.removeItem("smovie.activeProfileId.v1");
    } catch (error) {
      // Ignore.
    }
    profiles = defaultProfiles.slice();
    activeProfileId = profiles[0] && profiles[0].id ? String(profiles[0].id) : "";
    applyProfileAccent(initialProfileColorFromServer);
    if (profileAvatarButton) {
      profileAvatarButton.textContent = initialAvatarFromServer || initialsFromName(initialProfileNameFromServer);
      profileAvatarButton.title = `Profil actif: ${initialProfileNameFromServer || "Profil actif"}`;
    }
    if (avatarHubBadge) {
      avatarHubBadge.textContent = initialAvatarFromServer || initialsFromName(initialProfileNameFromServer);
    }
    if (avatarHubName) {
      avatarHubName.textContent = initialProfileNameFromServer || "Profil actif";
    }
  }

  function saveProfilesState() { /* no-op: session serveur */ }

  function applyServerProfiles(serverProfiles, preferredActiveProfileId) {
    const normalized = normalizeProfiles(serverProfiles);
    profiles = normalized.length ? normalized : defaultProfiles.slice();
    const preferredId = String(preferredActiveProfileId || "").trim();
    if (preferredId && profiles.some((profile) => profile.id === preferredId)) {
      activeProfileId = preferredId;
    }
    if (!profiles.some((profile) => profile.id === activeProfileId)) {
      activeProfileId = profiles[0].id;
    }
    const activeProfile = getActiveProfile();
    applyProfileAccent(activeProfile && activeProfile.color ? activeProfile.color : "#f97316");
    saveProfilesState();
  }

  async function fetchProfilesFromServer() {
    const data = await apiJson("/api/profiles");
    applyServerProfiles(
      data && data.profiles ? data.profiles : [],
      data && data.active_profile_id ? String(data.active_profile_id) : ""
    );
  }

  async function syncActiveProfileToServer(profileId) {
    const id = String(profileId || "").trim();
    if (!id || !authUser) return;
    try {
      await apiJson("/api/profiles/active", {
        method: "POST",
        body: JSON.stringify({ profile_id: id })
      });
    } catch (error) {
      console.warn("Impossible de synchroniser le profil actif serveur.", error);
    }
  }

  async function ensureAuthenticated() {
    try {
      const data = await apiJson("/api/auth/me");
      if (data && data.authenticated) {
        authUser = data.user || null;
        applyServerProfiles(data.profiles || [], data.active_profile_id || "");
        hideAuthGate();
        return true;
      }
    } catch (_error) {
      // Fall through to gate.
    }
    authUser = null;
    showAuthGate("Connecte-toi pour synchroniser tes favoris sur tous tes appareils.");
    return false;
  }

  function getActiveProfile() {
    return profiles.find((profile) => profile.id === activeProfileId) || profiles[0] || defaultProfiles[0];
  }

  function syncActiveProfileAvatar() {
    if (!profileAvatarButton) return;
    const activeProfile = getActiveProfile();
    const accent = normalizeHexColor(activeProfile && activeProfile.color, "#f97316");
    applyProfileAccent(accent);
    const profileInitials = initialsFromName(activeProfile.name);
    profileAvatarButton.textContent = profileInitials;
    profileAvatarButton.title = `Profil actif: ${activeProfile.name}`;
    profileAvatarButton.style.setProperty("--avatar-bg", `linear-gradient(145deg, ${hexToRgba(accent, 0.58)}, ${hexToRgba(accent, 0.24)})`);
    profileAvatarButton.style.setProperty("--avatar-ring", hexToRgba(accent, 0.55));
    profileAvatarButton.style.setProperty("--avatar-inner", hexToRgba(accent, 0.22));

    if (avatarHubBadge) {
      avatarHubBadge.textContent = profileInitials;
      avatarHubBadge.style.setProperty("--hub-avatar-bg", `linear-gradient(145deg, ${hexToRgba(accent, 0.58)}, ${hexToRgba(accent, 0.24)})`);
      avatarHubBadge.style.setProperty("--hub-avatar-ring", hexToRgba(accent, 0.55));
      avatarHubBadge.style.setProperty("--hub-avatar-inner", hexToRgba(accent, 0.22));
    }
    if (avatarHubName) {
      avatarHubName.textContent = activeProfile.name;
    }
  }

  function profileCardMarkup(profile) {
    const active = profile.id === activeProfileId;
    const avatar = safeUrl(profile.avatar || "");
    const avatarStyle = avatar
      ? `--profile-color: ${esc(profile.color)}; --profile-image: url('${esc(avatar)}');`
      : `--profile-color: ${esc(profile.color)};`;
    const avatarClass = avatar ? "profile-avatar has-photo" : "profile-avatar";
    const avatarText = avatar ? "" : esc(initialsFromName(profile.name));
    return [
      `<button type="button" class="profile-choice${active ? " active" : ""}" data-profile-id="${esc(profile.id)}">`,
      `  <span class="${avatarClass}" style="${avatarStyle}">${avatarText}</span>`,
      `  <span class="profile-name">${esc(profile.name)}</span>`,
      "</button>"
    ].join("\n");
  }

  function addProfileCardMarkup() {
    return [
      '<button type="button" class="profile-choice add" data-profile-action="add">',
      '  <span class="profile-plus">+</span>',
      "  <span class=\"profile-name\">Ajouter</span>",
      "</button>"
    ].join("\n");
  }

  function renderProfilesGrid() {
    if (!profileGrid) return;
    const cards = profiles.map((profile) => profileCardMarkup(profile));
    if (profiles.length < MAX_PROFILES) cards.push(addProfileCardMarkup());
    profileGrid.innerHTML = cards.join("\n");
  }

  function closeProfileForm() {
    if (!profileForm) return;
    profileForm.classList.remove("open");
    if (profileNameInput) profileNameInput.value = "";
    if (profileColorInput) {
      const activeProfile = getActiveProfile();
      profileColorInput.value = normalizeHexColor(activeProfile && activeProfile.color, "#f97316");
    }
  }

  function openProfileForm() {
    if (!profileForm) return;
    profileForm.classList.add("open");
    if (profileColorInput) {
      const activeProfile = getActiveProfile();
      profileColorInput.value = normalizeHexColor(activeProfile && activeProfile.color, "#f97316");
    }
    if (profileNameInput) profileNameInput.focus();
  }

  function openProfileSwitcher() {
    if (!profileSwitcher) return;
    if (!authUser) {
      showAuthGate("Connecte-toi pour acceder aux profils.");
      return;
    }
    closeAvatarMenu();
    renderProfilesGrid();
    profileSwitcher.classList.add("open");
    profileSwitcher.setAttribute("aria-hidden", "false");
    document.body.classList.add("profile-switcher-open");
  }

  function closeProfileSwitcher() {
    if (!profileSwitcher) return;
    profileSwitcher.classList.remove("open");
    profileSwitcher.setAttribute("aria-hidden", "true");
    document.body.classList.remove("profile-switcher-open");
    closeProfileForm();
  }

  function wireProfileSwitcher() {
    if (!profileSwitcher || !profileGrid || !profileAvatarButton) return;

    profileCloseTriggers.forEach((trigger) => {
      trigger.addEventListener("click", closeProfileSwitcher);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && profileSwitcher.classList.contains("open")) {
        closeProfileSwitcher();
      }
    });

    profileGrid.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const addTrigger = target.closest("[data-profile-action='add']");
      if (addTrigger) {
        openProfileForm();
        return;
      }

      const profileButton = target.closest("[data-profile-id]");
      if (!profileButton) return;
      const profileId = String(profileButton.getAttribute("data-profile-id") || "").trim();
      if (!profileId) return;
      activeProfileId = profileId;
      saveProfilesState();
      await syncActiveProfileToServer(activeProfileId);
      await loadFavoritesForProfile(profileId);
      await loadProgressForProfile(profileId);
      syncActiveProfileAvatar();
      await loadViewData(currentView);
      renderProfilesGrid();
      closeProfileSwitcher();
    });

    if (profileCancelBtn) {
      profileCancelBtn.addEventListener("click", closeProfileForm);
    }

    if (profileForm) {
      profileForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!profileNameInput || !profileColorInput) return;
        const rawName = profileNameInput.value.trim().replace(/\s+/g, " ");
        if (!rawName) {
          profileNameInput.focus();
          return;
        }
        if (profiles.length >= MAX_PROFILES) return;
        const color = normalizeHexColor(profileColorInput.value, "#f97316");
        try {
          const payload = { name: rawName.slice(0, 24), color };
          const data = await apiJson("/api/profiles", {
            method: "POST",
            body: JSON.stringify(payload)
          });
          applyServerProfiles(
            data && data.profiles ? data.profiles : [],
            data && data.active_profile_id ? String(data.active_profile_id) : ""
          );
          activeProfileId = data && data.profile && data.profile.id ? String(data.profile.id) : activeProfileId;
          saveProfilesState();
          await syncActiveProfileToServer(activeProfileId);
          favoritesByProfile[activeProfileId] = [];
          progressByProfile[activeProfileId] = {};
          syncActiveProfileAvatar();
          await loadViewData(currentView);
          renderProfilesGrid();
          closeProfileSwitcher();
        } catch (error) {
          if (authMessage) authMessage.textContent = String(error.message || "Impossible de creer le profil.");
        }
      });
    }
  }

  function normalizeItem(item, idx) {
    const tags = Array.isArray(item.tags) && item.tags.length
      ? item.tags.slice(0, 3)
      : [item.genre || "Action", item.badge || "Top", "VF"];

    const cardImage = item.card_image || item.cardImage || item.image || "/static/template-assets/movie-1.jpg";
    const cardImagePosition = String(item.card_image_position || item.cardImagePosition || "50% 50%").trim() || "50% 50%";
    const cardImageType = String(item.card_image_type || item.cardImageType || "fallback").trim().toLowerCase();
    const cardFit = cardImageType === "poster" || cardImageType === "banner" ? "contain" : "cover";
    const kind = item.kind || "movie";
    const logoUrl = String(item.logo || "").trim();
    const marketingThumbTypes = new Set(["thumb", "moviethumb", "tvthumb"]);
    /* Séries / docs : TV thumb Fanart en fond + logo (hdclearlogo) par-dessus, comme Fanart.tv */
    const showCardLogo = Boolean(
      logoUrl && (kind === "series" || kind === "documentary")
    );
    /* Films : éviter double titre si le moviethumb intègre déjà le branding */
    const showCardLogoMovie = Boolean(
      logoUrl && kind === "movie" && !marketingThumbTypes.has(cardImageType)
    );
    return {
      title: item.title || "Sans titre",
      year: item.year || "",
      genre: item.genre || "Catalogue",
      rating: item.rating || "13+",
      duration: item.duration || item.runtime || "2h",
      match: item.match || `${92 + (idx % 7)}% Match`,
      tags,
      image: cardImage,
      cardImagePosition,
      cardImageType,
      cardFit,
      logo: logoUrl,
      showCardLogo: showCardLogo || showCardLogoMovie,
      kind,
      slug: item.slug || "",
      detailUrl: item.detail_url || buildDetailUrl(item),
      itemKey: item.item_key || buildItemKey(item)
    };
  }

  function renderTags(tags, hiddenValues) {
    const hidden = new Set(
      (Array.isArray(hiddenValues) ? hiddenValues : [])
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
    );

    const clean = [];
    const seen = new Set();
    (Array.isArray(tags) ? tags : []).forEach((tag) => {
      const raw = String(tag || "").trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (hidden.has(key)) return;
      if (seen.has(key)) return;
      seen.add(key);
      clean.push(raw);
    });

    const finalTags = clean.slice(0, 3);
    return finalTags
      .map((tag, i) => `${esc(tag)}${i < finalTags.length - 1 ? '<span class="sep">&bull;</span>' : ""}`)
      .map((entry) => `<span>${entry}</span>`)
      .join("");
  }

  function movieCard(item, idx) {
    const it = normalizeItem(item, idx);
    const title = esc(it.title);
    const genre = esc(it.genre);
    const rating = esc(it.rating);
    const duration = esc(it.duration);
    const match = esc(it.match);
    const image = safeUrl(it.image);
    const imagePosition = esc(it.cardImagePosition || "50% 50%");
    const frameClass = it.cardFit === "contain" ? "movie-frame fit-contain" : "movie-frame fit-cover";
    const detailUrl = String(it.detailUrl || "").trim();
    const itemKey = String(it.itemKey || buildItemKey(it));
    const isFavorite = _renderFavSet.has(itemKey);
    const favoriteIcon = isFavorite ? "✓" : "+";
    const favoriteTitle = isFavorite ? "Retirer de ma liste" : "Ajouter à ma liste";
    const searchBlob = esc(
      [it.title, it.genre, it.rating, it.duration, ...(Array.isArray(it.tags) ? it.tags : [])]
        .join(" ")
        .toLowerCase()
    );

    const logoBlock = it.showCardLogo
      ? `    <div class="movie-card-logo" aria-hidden="true"><img loading="lazy" src="${safeUrl(it.logo)}" alt="" /></div>\n`
      : "";

    return [
      '<article class="movie-card" data-item-key="' + esc(itemKey) + '" data-title="' + title + '" data-detail-url="' + esc(detailUrl) + '" data-search="' + searchBlob + '" tabindex="0" role="button" aria-label="Ouvrir ' + title + '">',
      `  <div class="${frameClass}" style="--card-image-pos:${imagePosition};--card-bg-image:url('${image}')">`,
      `    <img loading="lazy" src="${image}" alt="${title}" />`,
      logoBlock,
      '    <div class="movie-overlay">',
      `      <h3 class="movie-title">${title}</h3>`,
      `      <div class="movie-meta">${genre} &bull; ${rating} &bull; ${duration}</div>`,
      '    </div>',
      '  </div>',
      '  <div class="movie-hover">',
      '    <div class="movie-hover-info">',
      `      <h4 class="movie-hover-title">${title}</h4>`,
      '      <div class="movie-hover-actions">',
      '        <button class="hover-btn play" type="button" aria-label="Ouvrir la fiche">&#9658;</button>',
      '        <button class="hover-btn favorite' + (isFavorite ? " active" : "") + '" type="button" data-action="toggle-favorite" aria-pressed="' + (isFavorite ? "true" : "false") + '" aria-label="' + favoriteTitle + '" title="' + favoriteTitle + '">' + favoriteIcon + "</button>",
      '        <button class="hover-btn last" type="button" aria-label="Plus d options">&#8942;</button>',
      '      </div>',
      '      <div class="movie-hover-line">',
      `        <span class="match">${match}</span>`,
      `        <span class="runtime">${rating}</span>`,
      `        <span class="runtime">${duration}</span>`,
      '      </div>',
      `      <div class="movie-tags">${renderTags(it.tags, [it.rating, it.duration, it.match])}</div>`,
      '    </div>',
      '  </div>',
      '</article>'
    ].join("\n");
  }

  function rowSection(row, idx) {
    const rowId = `row-track-${idx}`;
    const items = Array.isArray(row.items) ? row.items : [];
    return [
      '<section class="row-section" data-row-search="' + esc(String(row.title || "").toLowerCase()) + '">',
      '  <div class="row-header">',
      `    <h2>${esc(row.title || "Collection")}</h2>`,
      '  </div>',
      '  <div class="row-body">',
      '    <div class="row-strip">',
      `      <button class="row-scroll-btn left" type="button" data-target="${rowId}" data-dir="left" aria-label="Defiler vers la gauche">&#8249;</button>`,
      `      <button class="row-scroll-btn right" type="button" data-target="${rowId}" data-dir="right" aria-label="Defiler vers la droite">&#8250;</button>`,
      `      <div id="${rowId}" class="row-track">`,
      items.map((item, itemIdx) => movieCard(item, itemIdx)).join("\n"),
      '      </div>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join("\n");
  }

  function rebuildCatalogIndexes() {
    const rows = Array.isArray(catalogState.rows) ? catalogState.rows : [];
    const flat = [];
    const byKey = new Map();
    const bySlug = new Map();
    const byTitle = new Map();
    rows.forEach((row) => {
      const items = Array.isArray(row && row.items) ? row.items : [];
      items.forEach((item) => {
        if (!item || typeof item !== "object") return;
        flat.push(item);
        const k = getCanonicalItemKey(item);
        if (k) byKey.set(k, item);
        const slug = normalizeKey(item.slug || "");
        if (slug) {
          if (!bySlug.has(slug)) bySlug.set(slug, []);
          bySlug.get(slug).push(item);
        }
        const titleLower = String(item.title || "").trim().toLowerCase();
        if (titleLower) {
          if (!byTitle.has(titleLower)) byTitle.set(titleLower, []);
          byTitle.get(titleLower).push(item);
        }
      });
    });
    catalogItemsFlat = flat;
    catalogByItemKey = byKey;
    catalogBySlug = bySlug;
    catalogItemsByTitle = byTitle;
  }

  function getCanonicalItemKey(item) {
    if (!item || typeof item !== "object") return "";
    return String(item.item_key || buildItemKey(item)).trim();
  }

  function normalizePathForCompare(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\\/g, "/");
  }

  function isLikelyValidLogoUrl(rawUrl) {
    const value = String(rawUrl || "").trim();
    if (!value) return false;
    const lowered = value.toLowerCase();
    if (lowered.includes("undefined") || lowered.includes("null")) return false;
    return true;
  }

  function logoBelongsToSlug(logoUrl, slugValue) {
    const slug = normalizeKey(slugValue);
    if (!slug) return false;
    const normalizedLogo = normalizePathForCompare(logoUrl);
    return normalizedLogo.includes(`/${slug}/`) || normalizedLogo.includes(`-${slug}-`);
  }

  function findCatalogItemByIdentity(rawIdentity) {
    const identity = rawIdentity && typeof rawIdentity === "object" ? rawIdentity : {};
    const expectedKey = String(identity.item_key || "").trim();
    const expectedSlug = normalizeKey(identity.slug || "");
    const expectedTitle = String(identity.title || "").trim().toLowerCase();
    const expectedKind = String(identity.kind || identity.item_kind || "").trim().toLowerCase();

    if (expectedKey) {
      const hit = catalogByItemKey.get(expectedKey);
      if (hit) return hit;
    }

    if (expectedSlug) {
      const candidates = catalogBySlug.get(expectedSlug) || [];
      for (let idx = 0; idx < candidates.length; idx += 1) {
        const candidate = candidates[idx];
        if (!candidate || typeof candidate !== "object") continue;
        const candidateKind = String(candidate.kind || "").trim().toLowerCase();
        if (!expectedKind || !candidateKind || candidateKind === expectedKind) return candidate;
      }
    }

    if (expectedTitle) {
      const titleBucket = catalogItemsByTitle.get(expectedTitle) || [];
      for (let idx = 0; idx < titleBucket.length; idx += 1) {
        const candidate = titleBucket[idx];
        if (!candidate || typeof candidate !== "object") continue;
        const candidateKind = String(candidate.kind || "").trim().toLowerCase();
        if (!expectedKind || !candidateKind || candidateKind === expectedKind) return candidate;
      }
    }

    return null;
  }

  function resolveHeroLogoUrl(heroSource, resolvedItem) {
    const source = heroSource && typeof heroSource === "object" ? heroSource : {};
    const mappedItem = resolvedItem && typeof resolvedItem === "object" ? resolvedItem : null;
    const itemLogo = mappedItem ? String(mappedItem.logo || "").trim() : "";
    const heroLogo = String(source.logo || "").trim();
    const heroSlug = String((mappedItem && mappedItem.slug) || source.slug || "").trim();
    const hasSlug = Boolean(normalizeKey(heroSlug));
    const itemLogoMatches = hasSlug ? logoBelongsToSlug(itemLogo, heroSlug) : false;
    const heroLogoMatches = hasSlug ? logoBelongsToSlug(heroLogo, heroSlug) : false;

    if (isLikelyValidLogoUrl(itemLogo) && (!hasSlug || itemLogoMatches)) {
      return itemLogo;
    }
    if (!isLikelyValidLogoUrl(heroLogo)) {
      return "";
    }
    if (hasSlug && heroLogoMatches) {
      return heroLogo;
    }
    if (!mappedItem && !hasSlug) {
      return heroLogo;
    }
    return "";
  }

  function getMediaQualityLabel(sourcePath) {
    const sourceText = String(sourcePath || "").trim();
    if (!sourceText) return "";
    const text = sourceText.toLowerCase();

    let resolution = "";
    if (/(?:^|[^a-z0-9])(2160p|4k|uhd)(?:[^a-z0-9]|$)/i.test(text)) {
      resolution = "4K";
    } else if (/(?:^|[^a-z0-9])1080p(?:[^a-z0-9]|$)/i.test(text)) {
      resolution = "1080p";
    } else if (/(?:^|[^a-z0-9])720p(?:[^a-z0-9]|$)/i.test(text)) {
      resolution = "720p";
    }

    let source = "";
    if (/(?:^|[^a-z0-9])(blu[ ._-]?ray|brrip|bdrip)(?:[^a-z0-9]|$)/i.test(text)) {
      source = "BluRay";
    } else if (/(?:^|[^a-z0-9])web[ ._-]?(?:dl|rip)(?:[^a-z0-9]|$)/i.test(text)) {
      source = "WEB-DL";
    } else if (/(?:^|[^a-z0-9])hdtv(?:[^a-z0-9]|$)/i.test(text)) {
      source = "HDTV";
    }

    let hdr = "";
    if (/(?:^|[^a-z0-9])(dolby[ ._-]?vision|dv)(?:[^a-z0-9]|$)/i.test(text)) {
      hdr = "Dolby Vision";
    } else if (/(?:^|[^a-z0-9])hdr(?:10|\+|10\+)?(?:[^a-z0-9]|$)/i.test(text)) {
      hdr = "HDR";
    }

    let audio = "";
    if (/(?:^|[^a-z0-9])atmos(?:[^a-z0-9]|$)/i.test(text)) {
      audio = "Dolby Atmos";
    } else if (/(?:^|[^a-z0-9])dts[ ._-]?hd(?:[ ._-]?ma)?(?:[^a-z0-9]|$)/i.test(text)) {
      audio = "DTS-HD";
    } else if (/(?:^|[^a-z0-9])dts(?:[^a-z0-9]|$)/i.test(text)) {
      audio = "DTS";
    } else if (/(?:^|[^a-z0-9])7[ .]?1(?:[^a-z0-9]|$)/i.test(text)) {
      audio = "7.1";
    } else if (/(?:^|[^a-z0-9])5[ .]?1(?:[^a-z0-9]|$)/i.test(text)) {
      audio = "5.1";
    }

    let firstSegment = "";
    if (resolution && hdr) {
      firstSegment = `${resolution} ${hdr}`.trim();
    } else if (resolution) {
      firstSegment = [source, resolution].filter(Boolean).join(" ").trim();
    }

    if (!firstSegment) return "";
    const parts = [firstSegment, audio].filter(Boolean);
    if (!parts.length) return "";
    return parts.join(" • ");
  }

  function findCatalogItemByKey(itemKey) {
    const expectedKey = String(itemKey || "").trim();
    if (!expectedKey) return null;
    return catalogByItemKey.get(expectedKey) || null;
  }

  function findDetailUrlByItemKey(itemKey) {
    const expectedKey = String(itemKey || "").trim();
    if (!expectedKey) return "";
    const item = findCatalogItemByKey(expectedKey);
    if (!item || typeof item !== "object") return "";
    const detailUrl = String(item.detail_url || "").trim();
    if (detailUrl) return detailUrl;
    return buildDetailUrl(item);
  }

  function getHeroDetailUrl() {
    const hero = catalogState && catalogState.hero ? catalogState.hero : {};
    const directDetailUrl = String(hero.detail_url || "").trim();
    if (directDetailUrl) return directDetailUrl;

    const heroKey = findHeroItemKey();
    if (heroKey) {
      const mappedDetailUrl = findDetailUrlByItemKey(heroKey);
      if (mappedDetailUrl) return mappedDetailUrl;
    }

    const mappedItem = findCatalogItemByIdentity(hero);
    if (mappedItem && typeof mappedItem === "object") {
      const mappedItemDetail = String(mappedItem.detail_url || "").trim();
      if (mappedItemDetail) return mappedItemDetail;
      const built = buildDetailUrl(mappedItem);
      if (built) return built;
    }

    return buildDetailUrl(hero);
  }

  async function openHeroDetailPage() {
    const detailUrl = getHeroDetailUrl();
    if (!detailUrl) return;
    window.location.href = detailUrl;
  }

  function openDetailFromCard(card) {
    if (!(card instanceof Element)) return;
    const detailUrl = String(card.getAttribute("data-detail-url") || "").trim();
    if (!detailUrl) return;
    window.location.href = detailUrl;
  }

  function findItemKeyByTitle(titleValue) {
    const title = String(titleValue || "").trim().toLowerCase();
    if (!title) return "";
    const bucket = catalogItemsByTitle.get(title) || [];
    const hit = bucket[0];
    return hit ? getCanonicalItemKey(hit) : "";
  }

  function dedupeRowsByItemKey(rows) {
    if (!Array.isArray(rows)) return [];
    const seen = new Set();
    const out = [];
    rows.forEach((row) => {
      if (!row || typeof row !== "object") return;
      const items = Array.isArray(row.items) ? row.items : [];
      const dedupedItems = [];
      items.forEach((item) => {
        if (!item || typeof item !== "object") return;
        const key = String(item.item_key || buildItemKey(item)).trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        dedupedItems.push(item);
      });
      if (!dedupedItems.length) return;
      out.push({ ...row, items: dedupedItems });
    });
    return out;
  }

  function refreshHeroForActiveProfile() {
    const hero = catalogState && catalogState.hero ? catalogState.hero : {};
    const mappedItem = findCatalogItemByIdentity(hero);
    currentHeroItemKey = mappedItem ? getCanonicalItemKey(mappedItem) : findItemKeyByTitle(hero && hero.title ? hero.title : "");
    applyHero(hero);
    syncHeroPrimaryState();
    syncHeroSecondaryState();
  }

  function getRowsForCurrentView() {
    const rows = Array.isArray(catalogState.rows) ? catalogState.rows : [];
    if (currentView === "my-list" || currentView === "films" || currentView === "series" || currentView === "documentaires") {
      return dedupeRowsByItemKey(rows);
    }
    return rows;
  }

  function refreshEmptyState(baseRows) {
    if (!searchEmpty) return;
    const hasQuery = Boolean((currentSearchQuery || "").trim());
    const hasRows = Array.isArray(baseRows) && baseRows.some((row) => Array.isArray(row.items) && row.items.length);

    if (currentView === "my-list" && !hasRows && !hasQuery) {
      searchEmpty.textContent = "Ta liste est vide. Clique sur + pour ajouter des favoris.";
      searchEmpty.classList.add("show");
      return;
    }

    if (!hasQuery) {
      searchEmpty.textContent = "Aucun titre ne correspond a ta recherche.";
      searchEmpty.classList.remove("show");
    }
  }

  let _renderFavSet = new Set();

  function renderRowsForCurrentView() {
    if (!rowsContainer) return;
    _renderFavSet = getActiveFavoritesSet();
    const sourceRows = getRowsForCurrentView();
    rowsContainer.innerHTML = sourceRows.map((row, idx) => rowSection(row, idx)).join("\n");
    wireRowButtons();
    attachRowTrackScrollListeners();
    refreshAllRowStripScrollStates();
    wireTvKeyboardNav();
    applySearchFilter(currentSearchQuery);
    refreshEmptyState(sourceRows);
  }

  function syncNavigationState() {
    navButtons.forEach((btn) => {
      const targetView = normalizeViewName(btn.getAttribute("data-nav-view"));
      btn.classList.toggle("active", targetView === currentView);
    });
    if (mobileDropdown && mobileMenuToggle) {
      mobileDropdown.classList.remove("open");
      mobileMenuToggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("mobile-menu-open");
    }
  }

  function setView(viewName) {
    currentView = normalizeViewName(viewName);
    if (!authUser && currentView !== "home") {
      currentView = "home";
    }
    syncNavigationState();
    void loadViewData(currentView);
  }

  function wireNavigation() {
    if (!navButtons.length) return;
    navButtons.forEach((btn) => {
      const tag = String(btn.tagName || "").toLowerCase();
      if (tag === "a") return;
      btn.addEventListener("click", () => {
        if (!authUser) {
          showAuthGate("Connecte-toi pour acceder a cette section.");
          return;
        }
        const targetView = normalizeViewName(btn.getAttribute("data-nav-view"));
        setView(targetView);
      });
    });
  }

  function syncFavoriteButtonsInDom(itemKey, isFavorite) {
    const cards = Array.from(document.querySelectorAll(".movie-card"));
    cards.forEach((card) => {
      if (!(card instanceof HTMLElement)) return;
      if (String(card.getAttribute("data-item-key") || "") !== itemKey) return;
      const btn = card.querySelector("[data-action='toggle-favorite']");
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.classList.toggle("active", isFavorite);
      btn.setAttribute("aria-pressed", isFavorite ? "true" : "false");
      btn.setAttribute("aria-label", isFavorite ? "Retirer de ma liste" : "Ajouter à ma liste");
      btn.setAttribute("title", isFavorite ? "Retirer de ma liste" : "Ajouter à ma liste");
      btn.textContent = isFavorite ? "✓" : "+";
    });
  }

  function wireFavoriteActions() {
    if (!rowsContainer) return;
    if (rowsContainer.dataset.favoritesWired === "1") return;
    rowsContainer.dataset.favoritesWired = "1";

    rowsContainer.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const favoriteBtn = target.closest("[data-action='toggle-favorite']");
      if (!(favoriteBtn instanceof HTMLButtonElement)) return;
      event.preventDefault();
      event.stopPropagation();

      const card = favoriteBtn.closest(".movie-card");
      if (!(card instanceof HTMLElement)) return;
      const itemKey = String(card.getAttribute("data-item-key") || "").trim();
      if (!itemKey) return;

      let isFavorite = false;
      try {
        isFavorite = await toggleFavorite(itemKey);
      } catch (error) {
        console.warn("Impossible de mettre a jour la liste.", error);
        return;
      }
      syncFavoriteButtonsInDom(itemKey, isFavorite);
      await loadViewData(currentView);
    });
  }

  function applyHero(hero) {
    const source = hero && typeof hero === "object" ? hero : {};
    const resolvedItem = findCatalogItemByIdentity(source);
    const isEmpty = Boolean(source.hero_empty);
    if (heroSection instanceof HTMLElement) {
      heroSection.classList.toggle("is-empty", isEmpty);
    }

    const setVisibleText = (node, value) => {
      if (!(node instanceof HTMLElement)) return "";
      const text = String(value || "").trim();
      node.textContent = text;
      node.style.display = text ? "" : "none";
      return text;
    };

    if (heroTitle) heroTitle.textContent = String(source.title || "").trim();
    setVisibleText(heroSubtitle, source.subtitle || "");

    const pathSources = [
      String(source.source_path || source.sourcePath || "").trim(),
      String(source.library_path || source.libraryPath || "").trim(),
      String((resolvedItem && (resolvedItem.source_path || resolvedItem.sourcePath)) || "").trim(),
      String((resolvedItem && (resolvedItem.library_path || resolvedItem.libraryPath)) || "").trim()
    ].filter(Boolean);
    const pathHint = pathSources.join(" ");
    const backendMediaHint = [
      String(source.media_info_primary || "").trim(),
      String(source.media_info_secondary || "").trim(),
      String(source.media_info_tertiary || "").trim(),
      String(source.media_info_summary || "").trim()
    ]
      .filter(Boolean)
      .join(" ");
    const inferredQualityLabel = getMediaQualityLabel(pathHint) || getMediaQualityLabel(backendMediaHint);

    let mediaParts = [];
    if (inferredQualityLabel) {
      mediaParts = inferredQualityLabel
        .split(/[•|]/g)
        .map((part) => String(part || "").trim())
        .filter(Boolean)
        .slice(0, 3);
    }
    const [mediaPart1 = "", mediaPart2 = "", mediaPart3 = ""] = mediaParts;
    const hasMediaLine = Boolean(mediaPart1 || mediaPart2 || mediaPart3);

    setVisibleText(heroKicker1, mediaPart1);
    setVisibleText(heroKicker2, mediaPart2);
    setVisibleText(heroKicker3, mediaPart3);

    if (heroKickerDot1 instanceof HTMLElement) {
      heroKickerDot1.style.display = mediaPart1 && mediaPart2 ? "" : "none";
    }
    if (heroKickerDot2 instanceof HTMLElement) {
      heroKickerDot2.style.display = mediaPart2 && mediaPart3 ? "" : "none";
    }
    if (heroMetaTop instanceof HTMLElement) {
      heroMetaTop.style.display = hasMediaLine ? "" : "none";
    }

    setVisibleText(
      heroGenreLine,
      String(source.content_meta_summary || source.genre || "").trim()
    );

    setVisibleText(heroRating, source.rating || "");
    setVisibleText(heroDuration, source.duration || "");
    setVisibleText(heroYear, source.year ? String(source.year) : "");
    const parsedHeroScore = Number(source.rating_score);
    const computedScoreLabel = Number.isFinite(parsedHeroScore) && parsedHeroScore > 0
      ? `★ ${parsedHeroScore.toFixed(1)}`
      : "";
    const heroScoreLabel =
      String(source.score_label || "").trim() ||
      String(source.match || "").trim() ||
      computedScoreLabel;
    setVisibleText(heroMatch, heroScoreLabel);
    if (heroStatLine instanceof HTMLElement) {
      const hasStatLine = Boolean(
        heroScoreLabel ||
        String(source.rating || "").trim() ||
        String(source.duration || "").trim() ||
        String(source.year || "").trim()
      );
      heroStatLine.style.display = hasStatLine ? "" : "none";
    }

    const primaryLabel = String(source.cta_primary || "").trim();
    if (heroPrimary instanceof HTMLButtonElement) {
      heroPrimary.textContent = primaryLabel || "Lire";
      heroPrimary.hidden = isEmpty;
      heroPrimary.disabled = isEmpty;
    }

    const secondaryLabel = String(source.cta_secondary || "").trim();
    if (heroSecondary instanceof HTMLButtonElement) {
      heroSecondary.textContent = secondaryLabel || "Ajouter à ma liste";
      heroSecondary.hidden = isEmpty;
      heroSecondary.disabled = isEmpty;
    }

    if (heroInfoBtn instanceof HTMLButtonElement) {
      heroInfoBtn.hidden = isEmpty;
      heroInfoBtn.disabled = isEmpty;
    }

    const heroLogoUrl = resolveHeroLogoUrl(source, resolvedItem);
    if (heroLogo instanceof HTMLImageElement) {
      if (!heroLogo.dataset.logoGuardWired) {
        heroLogo.dataset.logoGuardWired = "1";
        heroLogo.addEventListener("error", () => {
          heroLogo.classList.add("is-hidden");
          heroLogo.removeAttribute("src");
          if (heroTitle instanceof HTMLElement) {
            heroTitle.classList.remove("is-hidden");
          }
        });
      }
      if (heroLogoUrl) {
        const nextLogoUrl = safeUrl(heroLogoUrl);
        const currentLogoUrl = String(heroLogo.dataset.currentLogo || "").trim();
        const requestId = ++heroLogoRequestId;
        heroLogo.classList.add("is-loading");

        preloadImageAsset(nextLogoUrl).then((ok) => {
          if (!(heroLogo instanceof HTMLImageElement)) return;
          if (requestId !== heroLogoRequestId) return;
          if (!ok) {
            heroLogo.classList.add("is-hidden");
            heroLogo.classList.remove("is-loading");
            heroLogo.removeAttribute("src");
            if (heroTitle instanceof HTMLElement) {
              heroTitle.classList.remove("is-hidden");
            }
            return;
          }

          if (currentLogoUrl !== nextLogoUrl) {
            heroLogo.src = nextLogoUrl;
            heroLogo.dataset.currentLogo = nextLogoUrl;
          }
          heroLogo.classList.remove("is-hidden");
          heroLogo.classList.remove("is-loading");
          heroLogo.alt = String(source.title || "").trim() || "Logo";
          if (heroTitle instanceof HTMLElement) {
            heroTitle.classList.add("is-hidden");
          }
        });
      } else {
        heroLogoRequestId += 1;
        heroLogo.removeAttribute("src");
        heroLogo.dataset.currentLogo = "";
        heroLogo.classList.add("is-hidden");
        heroLogo.classList.remove("is-loading");
      }
    }
    if (heroTitle instanceof HTMLElement && !heroLogoUrl) {
      heroTitle.classList.remove("is-hidden");
    }

    const heroBackground = String(source.hero_background || source.heroBackground || source.image || "").trim();
    const hasImage = heroBackground.length > 0;
    const bg = hasImage ? safeUrl(heroBackground) : "";
    const imagePosition = (typeof source.image_position === "string" && source.image_position.trim())
      ? source.image_position.trim()
      : "50% 50%";
    const imageFit = (typeof source.image_fit === "string" && source.image_fit.trim())
      ? source.image_fit.trim()
      : "cover";
    if (heroMedia && hasImage) {
      const nextBg = bg;
      const currentBg = String(heroMedia.dataset.currentHeroBg || "").trim();
      const requestId = ++heroBgRequestId;

      const applyBgNow = () => {
        if (!(heroMedia instanceof HTMLElement)) return;
        if (requestId !== heroBgRequestId) return;
        heroMedia.style.backgroundImage = `url('${nextBg}')`;
        heroMedia.style.setProperty("--hero-pos", imagePosition);
        heroMedia.style.setProperty("--hero-fit", imageFit);
        heroMedia.dataset.currentHeroBg = nextBg;
      };

      if (!nextBg || nextBg === currentBg) {
        applyBgNow();
      } else {
        preloadImageAsset(nextBg).then(() => applyBgNow());
      }
    } else if (heroMedia) {
      heroBgRequestId += 1;
      heroMedia.style.backgroundImage = "none";
      heroMedia.dataset.currentHeroBg = "";
    }
  }

  function findHeroItemKey() {
    if (currentHeroItemKey) return currentHeroItemKey;
    const hero = catalogState && catalogState.hero ? catalogState.hero : {};
    const itemKey = String(hero.item_key || "").trim();
    if (itemKey) return itemKey;
    const heroTitleStr = String(hero.title || "").trim().toLowerCase();
    if (!heroTitleStr) return "";
    return findItemKeyByTitle(heroTitleStr);
  }

  function syncHeroSecondaryState() {
    if (!heroSecondary) return;
    const hero = catalogState && catalogState.hero ? catalogState.hero : {};
    if (hero && hero.hero_empty) {
      heroSecondary.hidden = true;
      heroSecondary.disabled = true;
      return;
    }
    const heroKey = findHeroItemKey();
    if (!heroKey) {
    const fallbackLabel = String(hero && hero.cta_secondary ? hero.cta_secondary : "").trim() || "Ajouter à ma liste";
      heroSecondary.textContent = fallbackLabel;
      heroSecondary.setAttribute("aria-label", fallbackLabel);
      heroSecondary.hidden = false;
      heroSecondary.disabled = false;
      return;
    }
    const isFavorite = getActiveFavoritesSet().has(heroKey);
    heroSecondary.textContent = isFavorite ? "Retirer de ma liste" : "Ajouter à ma liste";
    heroSecondary.setAttribute("aria-label", heroSecondary.textContent);
    heroSecondary.hidden = false;
    heroSecondary.disabled = false;
  }

  function syncHeroPrimaryState() {
    if (!(heroPrimary instanceof HTMLButtonElement)) return;
    const hero = catalogState && catalogState.hero ? catalogState.hero : {};
    if (hero && hero.hero_empty) {
      heroPrimary.hidden = true;
      heroPrimary.disabled = true;
      return;
    }

    const heroKey = findHeroItemKey();
    const profileId = String(activeProfileId || "").trim();
    const resumeSeconds = (heroKey && profileId) ? getSavedProgressSeconds(profileId, heroKey) : 0;
    const detailUrl = getHeroDetailUrl();
    heroPrimary.hidden = false;
    heroPrimary.textContent = resumeSeconds > 0 ? "Reprendre" : "Regarder";
    heroPrimary.setAttribute("aria-label", resumeSeconds > 0 ? "Reprendre" : "Regarder");
    heroPrimary.disabled = !detailUrl;
  }

  function wireHeroActions() {
    if (heroSecondary instanceof HTMLButtonElement) {
      heroSecondary.addEventListener("click", async () => {
        const heroKey = findHeroItemKey();
        if (!heroKey) {
          setView("my-list");
          return;
        }
        let isFavorite = false;
        try {
          isFavorite = await toggleFavorite(heroKey);
        } catch (error) {
          console.warn("Impossible de mettre a jour la liste hero.", error);
          return;
        }
        syncFavoriteButtonsInDom(heroKey, isFavorite);
        await loadViewData(currentView);
      });
    }

    if (heroInfoBtn instanceof HTMLButtonElement) {
      heroInfoBtn.addEventListener("click", () => {
        void openHeroDetailPage();
      });
    }
  }

  function clearStripNearClasses(strip) {
    if (!(strip instanceof HTMLElement)) return;
    strip.classList.remove("is-near-left", "is-near-right");
  }

  function syncRowArrowVertical(strip) {
    if (!(strip instanceof HTMLElement)) return;
    const track = strip.querySelector(".row-track");
    const frame = track ? track.querySelector(".movie-frame") : null;
    if (!(track instanceof HTMLElement) || !(frame instanceof HTMLElement)) return;
    const padTop = parseFloat(window.getComputedStyle(track).paddingTop) || 0;
    const h = frame.getBoundingClientRect().height;
    if (h > 0) {
      strip.style.setProperty("--row-arrow-top", `${Math.round(padTop + h / 2)}px`);
    }
  }

  function updateRowTrackScrollButtons(track) {
    if (!(track instanceof HTMLElement)) return;
    const strip = track.closest(".row-strip");
    if (!(strip instanceof HTMLElement)) return;
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    const overflowing = maxScroll > 6;
    const leftBtn = strip.querySelector(".row-scroll-btn.left");
    const rightBtn = strip.querySelector(".row-scroll-btn.right");
    if (leftBtn instanceof HTMLButtonElement) {
      leftBtn.disabled = !overflowing || track.scrollLeft <= 4;
    }
    if (rightBtn instanceof HTMLButtonElement) {
      rightBtn.disabled = !overflowing || track.scrollLeft >= maxScroll - 4;
    }
    syncRowArrowVertical(strip);
  }

  function applyStripNearFromClientX(strip, clientX) {
    if (!(strip instanceof HTMLElement)) return;
    const track = strip.querySelector(".row-track");
    if (!(track instanceof HTMLElement)) return;
    const rect = strip.getBoundingClientRect();
    const w = rect.width;
    if (w <= 0) return;
    const x = clientX - rect.left;
    const threshold = Math.min(200, Math.max(96, w * 0.14));
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    const overflowing = maxScroll > 6;
    const canLeft = overflowing && track.scrollLeft > 4;
    const canRight = overflowing && track.scrollLeft < maxScroll - 4;
    strip.classList.toggle("is-near-left", Boolean(canLeft && x < threshold));
    strip.classList.toggle("is-near-right", Boolean(canRight && x > w - threshold));
  }

  function attachRowTrackScrollListeners() {
    if (!rowsContainer) return;
    rowsContainer.querySelectorAll(".row-track").forEach((track) => {
      if (!(track instanceof HTMLElement)) return;
      track.addEventListener(
        "scroll",
        () => {
          updateRowTrackScrollButtons(track);
          const strip = track.closest(".row-strip");
          if (strip instanceof HTMLElement && strip === rowStripPointerStrip) {
            applyStripNearFromClientX(strip, rowStripPointerX);
          }
        },
        { passive: true }
      );
    });
  }

  function refreshAllRowStripScrollStates() {
    if (!rowsContainer) return;
    rowsContainer.querySelectorAll(".row-track").forEach((track) => {
      if (track instanceof HTMLElement) updateRowTrackScrollButtons(track);
    });
  }

  function wireRowStripPointerUi() {
    if (!rowsContainer || rowStripPointerWired) return;
    rowStripPointerWired = true;

    rowsContainer.addEventListener(
      "mousemove",
      (event) => {
        const raw = event.target;
        if (!(raw instanceof Element)) {
          if (rowStripPointerStrip) {
            clearStripNearClasses(rowStripPointerStrip);
            rowStripPointerStrip = null;
          }
          return;
        }
        const strip = raw.closest(".row-strip");
        if (!(strip instanceof HTMLElement) || !rowsContainer.contains(strip)) {
          if (rowStripPointerStrip) {
            clearStripNearClasses(rowStripPointerStrip);
            rowStripPointerStrip = null;
          }
          return;
        }
        if (rowStripPointerStrip && rowStripPointerStrip !== strip) {
          clearStripNearClasses(rowStripPointerStrip);
        }
        rowStripPointerStrip = strip;
        rowStripPointerX = event.clientX;
        if (rowStripRaf) return;
        rowStripRaf = requestAnimationFrame(() => {
          rowStripRaf = 0;
          if (rowStripPointerStrip) {
            applyStripNearFromClientX(rowStripPointerStrip, rowStripPointerX);
          }
        });
      },
      { passive: true }
    );

    rowsContainer.addEventListener("mouseleave", (event) => {
      const rt = event.relatedTarget;
      if (rt instanceof Node && rowsContainer.contains(rt)) return;
      rowsContainer.querySelectorAll(".row-strip").forEach((el) => {
        if (el instanceof HTMLElement) clearStripNearClasses(el);
      });
      rowStripPointerStrip = null;
    });
  }

  function wireRowStripResize() {
    if (rowStripResizeWired) return;
    rowStripResizeWired = true;
    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => refreshAllRowStripScrollStates(), 140);
    });
    window.addEventListener("load", () => refreshAllRowStripScrollStates());
  }

  function wireRowButtons() {
    const scope = rowsContainer || document;
    scope.querySelectorAll(".row-scroll-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        const targetId = this.getAttribute("data-target");
        const dir = this.getAttribute("data-dir");
        if (!targetId || !dir) return;
        const track = document.getElementById(targetId);
        if (!track) return;
        const firstCard = track.querySelector(".movie-card");
        const computed = window.getComputedStyle(track);
        const gap = parseFloat(computed.columnGap || computed.gap || "16") || 16;
        const cardWidth = firstCard instanceof HTMLElement ? firstCard.getBoundingClientRect().width : 320;
        const step = Math.max(180, Math.round(cardWidth + gap));
        track.scrollBy({
          left: dir === "left" ? -step : step,
          behavior: "smooth"
        });
      });
    });
  }

  function wireCardInteractions() {
    if (rowsContainer) {
      rowsContainer.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const card = target.closest(".movie-card");
        if (!(card instanceof HTMLElement)) return;
        if (target.closest("button")) return;
        event.preventDefault();
        openDetailFromCard(card);
      });

      rowsContainer.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const playBtn = target.closest(".hover-btn.play");
        if (!(playBtn instanceof HTMLElement)) return;
        const card = playBtn.closest(".movie-card");
        if (!(card instanceof HTMLElement)) return;
        event.preventDefault();
        event.stopPropagation();
        openDetailFromCard(card);
      });

      rowsContainer.addEventListener("keydown", (event) => {
        if (String(event.key || "") !== "Enter") return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const card = target.closest(".movie-card");
        if (!(card instanceof HTMLElement)) return;
        event.preventDefault();
        event.stopPropagation();
        openDetailFromCard(card);
      });
    }

    if (heroPrimary instanceof HTMLButtonElement) {
      heroPrimary.addEventListener("click", () => {
        void openHeroDetailPage();
      });
    }
  }

  function openAvatarMenu() {
    if (!avatarHub) return;
    syncActiveProfileAvatar();
    avatarHub.classList.add("open");
    avatarHub.setAttribute("aria-hidden", "false");
    document.body.classList.add("avatar-hub-open");
  }

  function closeAvatarMenu() {
    if (!avatarHub) return;
    avatarHub.classList.remove("open");
    avatarHub.setAttribute("aria-hidden", "true");
    document.body.classList.remove("avatar-hub-open");
  }

  function wireAvatarMenu() {
    if (!avatarHub || !profileAvatarButton) return;

    profileAvatarButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!authUser) {
        showAuthGate("Connecte-toi pour acceder a ton compte.");
        return;
      }
      if (avatarHub.classList.contains("open")) {
        closeAvatarMenu();
      } else {
        openAvatarMenu();
      }
    });

    avatarHubCloseTriggers.forEach((trigger) => {
      trigger.addEventListener("click", closeAvatarMenu);
    });

    if (avatarMenuSwitchProfileBtn) {
      avatarMenuSwitchProfileBtn.addEventListener("click", () => {
        closeAvatarMenu();
        openProfileSwitcher();
      });
    }

    if (avatarMenuSettingsBtn) {
      avatarMenuSettingsBtn.addEventListener("click", () => {
        closeAvatarMenu();
      });
    }

    if (avatarMenuLogoutBtn) {
      avatarMenuLogoutBtn.addEventListener("click", async () => {
        try {
          await apiJson("/api/auth/logout", { method: "POST" });
        } catch (_error) {
          // Continue logout locally.
        }
        authUser = null;
        activeProfileId = "";
        profiles = defaultProfiles.slice();
        favoritesByProfile = {};
        progressByProfile = {};
        applyProfileAccent("#f97316");
        saveProfilesState();
        closeAvatarMenu();
        showAuthGate("Session fermee. Connecte-toi pour continuer.");
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && avatarHub.classList.contains("open")) {
        closeAvatarMenu();
      }
    });
  }

  function wireTvKeyboardNav() {
    if (tvKeyboardNavWired) return;
    tvKeyboardNavWired = true;
    document.addEventListener("keydown", (event) => {
      const active = document.activeElement;
      if (!active || !active.classList || !active.classList.contains("movie-card")) return;
      const track = active.parentElement;
      if (!track || !track.classList.contains("row-track")) return;

      const cards = Array.from(track.querySelectorAll(".movie-card")).filter((card) => card instanceof HTMLElement);
      const index = cards.indexOf(active);
      if (index === -1) return;

      if (event.key === "ArrowRight" && cards[index + 1]) {
        event.preventDefault();
        cards[index + 1].focus();
        cards[index + 1].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      }

      if (event.key === "ArrowLeft" && cards[index - 1]) {
        event.preventDefault();
        cards[index - 1].focus();
        cards[index - 1].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const rowBody = track.closest(".row-body");
        const rowSection = rowBody ? rowBody.closest(".row-section") : null;
        if (!(rowSection instanceof HTMLElement)) return;

        const rowSections = Array.from(document.querySelectorAll(".row-section")).filter(
          (section) => section instanceof HTMLElement && !section.classList.contains("search-hidden")
        );
        const rowIndex = rowSections.indexOf(rowSection);
        if (rowIndex < 0) return;

        const nextRowIndex = event.key === "ArrowDown"
          ? Math.min(rowSections.length - 1, rowIndex + 1)
          : Math.max(0, rowIndex - 1);
        if (nextRowIndex === rowIndex) return;

        const nextRow = rowSections[nextRowIndex];
        if (!(nextRow instanceof HTMLElement)) return;
        const nextTrack = nextRow.querySelector(".row-track");
        if (!(nextTrack instanceof HTMLElement)) return;
        const nextCards = Array.from(nextTrack.querySelectorAll(".movie-card")).filter(
          (card) => card instanceof HTMLElement
        );
        if (!nextCards.length) return;

        const targetIndex = Math.max(0, Math.min(nextCards.length - 1, index));
        const targetCard = nextCards[targetIndex];
        if (!(targetCard instanceof HTMLElement)) return;

        event.preventDefault();
        nextRow.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        targetCard.focus({ preventScroll: true });
        targetCard.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      }
    });
  }

  function wireMobileMenu() {
    if (!mobileMenuToggle || !mobileDropdown) return;

    function closeMenu() {
      mobileDropdown.classList.remove("open");
      mobileMenuToggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("mobile-menu-open");
    }

    mobileMenuToggle.addEventListener("click", () => {
      const willOpen = !mobileDropdown.classList.contains("open");
      mobileDropdown.classList.toggle("open", willOpen);
      mobileMenuToggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
      document.body.classList.toggle("mobile-menu-open", willOpen);
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!mobileDropdown.contains(target) && !mobileMenuToggle.contains(target)) {
        closeMenu();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 920) closeMenu();
    });
  }

  function normalizeSearchText(value) {
    const input = String(value || "").toLowerCase();
    if (typeof input.normalize === "function") {
      return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    }
    return input.trim();
  }

  function readSearchQueryFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      return String(params.get("q") || "").trim();
    } catch (_error) {
      return "";
    }
  }

  function hydrateSearchFromUrl() {
    if (searchFromUrlHydrated) return;
    const query = readSearchQueryFromUrl();
    if (!query) {
      searchFromUrlHydrated = true;
      return;
    }
    if (topSearchInput) topSearchInput.value = query;
    if (topSearch) topSearch.classList.add("open");
    applySearchFilter(query);
    searchFromUrlHydrated = true;
  }

  function applySearchFilter(rawQuery) {
    const query = normalizeSearchText(rawQuery);
    currentSearchQuery = query;
    const scope = rowsContainer || document;

    const cards = Array.from(scope.querySelectorAll(".movie-card"));
    cards.forEach((card) => {
      const blob = normalizeSearchText(card.getAttribute("data-search") || "");
      const visible = !query || blob.includes(query);
      card.classList.toggle("search-hidden", !visible);
    });

    const rows = Array.from(scope.querySelectorAll(".row-section"));
    let anyVisible = false;
    rows.forEach((row) => {
      const visibleCards = row.querySelector(".movie-card:not(.search-hidden)");
      const shouldHide = !visibleCards;
      row.classList.toggle("search-hidden", shouldHide);
      if (!shouldHide) anyVisible = true;
    });

    if (searchEmpty) {
      const shouldShowEmpty = Boolean(query) && !anyVisible;
      searchEmpty.classList.toggle("show", shouldShowEmpty);
    }

    refreshAllRowStripScrollStates();
  }

  function openTopSearch() {
    if (!topSearch) return;
    topSearch.classList.add("open");
    if (topSearchInput) {
      setTimeout(() => {
        topSearchInput.focus();
        topSearchInput.select();
      }, 130);
    }
  }

  function closeTopSearch(options) {
    if (!topSearch) return;
    const shouldClear = Boolean(options && options.clear);
    topSearch.classList.remove("open");
    if (topSearchInput && shouldClear) {
      topSearchInput.value = "";
      applySearchFilter("");
    }
  }

  function wireTopSearch() {
    if (!topSearch || !topSearchToggle || !topSearchInput) return;

    topSearchToggle.addEventListener("click", () => {
      if (!topSearch.classList.contains("open")) {
        openTopSearch();
        return;
      }
      if (topSearchInput.value.trim()) {
        topSearchInput.focus();
        return;
      }
      closeTopSearch({ clear: true });
    });

    let _searchDebounce = 0;
    topSearchInput.addEventListener("input", () => {
      clearTimeout(_searchDebounce);
      _searchDebounce = setTimeout(() => applySearchFilter(topSearchInput.value), 90);
    });

    topSearchInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTopSearch({ clear: true });
        topSearchToggle.focus();
      }
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (topSearch.contains(target)) return;
      if (!topSearch.classList.contains("open")) return;
      closeTopSearch({ clear: false });
    });
  }

  let viewLoadToken = 0;

  async function fetchViewDataWithTimeout(viewName) {
    const view = normalizeViewName(viewName);
    const nonce = Date.now().toString(36);
    const url = `/api/view-data?view=${encodeURIComponent(view)}&_=${encodeURIComponent(nonce)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  function applyViewPayload(data, fallbackView) {
    const payload = data && typeof data === "object" ? data : {};
    const resolvedView = normalizeViewName(payload.view || fallbackView || currentView);
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const hero = payload.hero && typeof payload.hero === "object" ? payload.hero : {};
    currentView = resolvedView;
    syncNavigationState();
    catalogState = { hero, rows };
    rebuildCatalogIndexes();
    currentHeroItemKey = "";
    renderRowsForCurrentView();
    refreshHeroForActiveProfile();
    hydrateSearchFromUrl();
  }

  async function loadViewData(viewName) {
    const targetView = normalizeViewName(viewName || currentView);
    const token = ++viewLoadToken;
    try {
      const res = await fetchViewDataWithTimeout(targetView);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (token !== viewLoadToken) return;
      applyViewPayload(data, targetView);
    } catch (e) {
      if (token !== viewLoadToken) return;
      catalogState = { hero: {}, rows: fallbackRows };
      rebuildCatalogIndexes();
      currentHeroItemKey = "";
      renderRowsForCurrentView();
      refreshHeroForActiveProfile();
      hydrateSearchFromUrl();
      console.error(e);
    }
  }

  async function startAuthenticatedSession() {
    if (!Array.isArray(profiles) || !profiles.length) {
      await fetchProfilesFromServer();
    }
    await syncActiveProfileToServer(activeProfileId);
    await loadFavoritesState();
    await loadProgressState();
    syncActiveProfileAvatar();
    currentView = normalizeViewName(initialViewFromServer);
    syncNavigationState();
    await loadViewData(currentView);
  }

  function wireAuthGate() {
    if (!authForm || !authUsernameInput || !authPasswordInput) return;

    if (authLoginBtn) {
      authLoginBtn.addEventListener("click", () => {
        authMode = "login";
      });
    }

    if (authRegisterBtn) {
      authRegisterBtn.addEventListener("click", () => {
        authMode = "register";
      });
    }

    authForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const username = String(authUsernameInput.value || "").trim().toLowerCase();
      const password = String(authPasswordInput.value || "");
      if (!username || !password) {
        showAuthGate("Renseigne ton identifiant et ton mot de passe.");
        return;
      }

      const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      try {
        const data = await apiJson(endpoint, {
          method: "POST",
          body: JSON.stringify({ username, password })
        });
        authUser = data && data.user ? data.user : null;
        applyServerProfiles(
          data && data.profiles ? data.profiles : [],
          data && data.active_profile_id ? String(data.active_profile_id) : ""
        );
        hideAuthGate();
        await startAuthenticatedSession();
      } catch (error) {
        showAuthGate(String(error.message || "Connexion impossible."));
      }
    });
  }

  async function bootstrapApp() {
    const ok = await ensureAuthenticated();
    if (!ok) return;
    await startAuthenticatedSession();
  }

  loadThemeState();
  loadProfilesState();
  wireAuthGate();
  wireAvatarMenu();
  wireProfileSwitcher();
  wireMobileMenu();
  wireNavigation();
  wireFavoriteActions();
  wireHeroActions();
  wireCardInteractions();
  wireTopSearch();
  wireRowStripPointerUi();
  wireRowStripResize();
  bootstrapApp();
})();

