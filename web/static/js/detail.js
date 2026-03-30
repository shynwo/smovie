(function () {
  const detailDataNode = document.getElementById("detail-data");
  const detailWatchBtn = document.getElementById("detail-watch-btn");
  const detailResumeFill = document.getElementById("detail-resume-fill");
  const detailFavoriteBtn = document.getElementById("detail-favorite-btn");
  const actionButtons = Array.from(document.querySelectorAll("[data-detail-url], [data-watch-url]"));

  const detailTabButtons = Array.from(document.querySelectorAll(".detail-tab-btn[data-tab-target]"));
  const detailTabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));
  const seasonSelectButtons = Array.from(document.querySelectorAll(".season-select-btn[data-season-target]"));
  const seasonPanels = Array.from(document.querySelectorAll(".season-panel[data-season-panel]"));

  const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
  const mobileDropdown = document.getElementById("mobile-dropdown");
  const topSearch = document.getElementById("top-search");
  const topSearchToggle = document.getElementById("top-search-toggle");
  const topSearchInput = document.getElementById("top-search-input");
  let searchOverlay = document.getElementById("search-overlay");
  let searchOverlayInput = document.getElementById("search-overlay-input");
  let searchOverlayKeyboard = document.getElementById("search-tv-keyboard");
  let searchOverlayResults = document.getElementById("search-overlay-results");
  let searchOverlayCloseTriggers = Array.from(document.querySelectorAll("[data-search-overlay-close]"));

  const profileAvatarButton = document.getElementById("profile-avatar-btn");
  const avatarHub = document.getElementById("avatar-hub");
  const avatarHubCloseTriggers = document.querySelectorAll("[data-close-avatar-hub]");
  const avatarMenuSwitchProfileBtn = document.getElementById("avatar-menu-switch-profile");
  const avatarMenuSettingsBtn = document.getElementById("avatar-menu-settings");
  const avatarMenuLogoutBtn = document.getElementById("avatar-menu-logout");

  const castRailWraps = Array.from(document.querySelectorAll("[data-cast-rail-wrap]"));
  const castRailRefreshers = [];

  const profileId = String((document.body && document.body.getAttribute("data-active-profile-id")) || "").trim();
  const initialView = String((document.body && document.body.getAttribute("data-current-view")) || "home").trim();

  const RESUME_MIN_SECONDS = 8;
  const RESUME_END_BUFFER_SECONDS = 20;
  const RESUME_END_RATIO = 0.97;

  const VIEW_ROUTES = {
    home: "/accueil",
    films: "/films",
    series: "/series",
    documentaires: "/documentaires",
    "my-list": "/ma-liste"
  };

  let progressMap = {};
  let searchOverlayKeyboardBuilt = false;
  let searchOverlayResultPool = [];
  let searchOverlayPoolPromise = null;

  const SEARCH_TV_KEYS = [
    ["A", "Z", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["Q", "S", "D", "F", "G", "H", "J", "K", "L", "M"],
    ["W", "X", "C", "V", "B", "N", "0", "1", "2", "3"],
    ["4", "5", "6", "7", "8", "9", "-", "'"]
  ];
  const searchOverlayTvMode = detectSearchOverlayTvMode();

  function detectSearchOverlayTvMode() {
    const params = new URLSearchParams(window.location.search || "");
    const forcedMode = String(params.get("tv") || params.get("device") || "").trim().toLowerCase();
    if (forcedMode === "1" || forcedMode === "true" || forcedMode === "tv") return true;
    if (forcedMode === "0" || forcedMode === "false" || forcedMode === "desktop" || forcedMode === "mobile") return false;

    const ua = `${navigator.userAgent || ""} ${navigator.vendor || ""}`;
    return /(smart-tv|smarttv|hbbtv|appletv|googletv|android tv|aft[bmst]|bravia|web0s|webos|tizen|netcast|viera|roku|xbox|playstation)/i.test(
      ua
    );
  }

  function esc(value) {
    return String(value == null ? "" : value)
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

  function normalizeSearchText(value) {
    const input = String(value || "").toLowerCase();
    if (typeof input.normalize === "function") {
      return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    }
    return input.trim();
  }

  function normalizeKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^\w-]+/g, "");
  }

  function kindLabelForSearch(kind) {
    const value = String(kind || "").trim().toLowerCase();
    if (value === "series") return "Serie";
    if (value === "documentary" || value === "documentaire" || value === "documentaires") return "Documentaire";
    return "Film";
  }

  function buildSearchDetailUrl(item) {
    const source = item && typeof item === "object" ? item : {};
    const kind = String(source.kind || "movie").trim().toLowerCase();
    const raw = String(source.detail_url || source.detailUrl || "").trim();
    if (raw) return raw;
    const slugSeed = String(source.slug || `${String(source.title || "").trim()}-${String(source.year || "").trim()}`).trim();
    const slug = normalizeKey(slugSeed);
    if (!slug) return "";
    if (kind === "series") return `/serie/${encodeURIComponent(slug)}`;
    return `/film/${encodeURIComponent(slug)}`;
  }

  function scoreSearchResult(item, query) {
    const titleNorm = item && item.titleNorm ? item.titleNorm : "";
    const searchBlob = item && item.searchBlob ? item.searchBlob : "";
    if (!query || !searchBlob.includes(query)) return -1;
    let score = 12;
    if (titleNorm.startsWith(query)) score += 130;
    else if (titleNorm.includes(query)) score += 92;
    const indexInBlob = searchBlob.indexOf(query);
    if (indexInBlob >= 0) score += Math.max(0, 28 - indexInBlob);
    if (item.kind === "movie") score += 4;
    if (item.kind === "series") score += 3;
    return score;
  }

  function collectSearchOverlayMatches(rawQuery, limit) {
    const query = normalizeSearchText(rawQuery);
    if (!query) return [];
    const capped = Number.isFinite(limit) ? Math.max(1, limit) : 9;
    const scored = [];
    searchOverlayResultPool.forEach((item) => {
      const score = scoreSearchResult(item, query);
      if (score < 0) return;
      scored.push({ item, score });
    });
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.title.localeCompare(b.item.title, "fr", { sensitivity: "base" });
    });
    return scored.slice(0, capped).map((entry) => entry.item);
  }

  function resultCardMarkup(item) {
    const title = esc(String(item.title || "Sans titre"));
    const frameClass = item.cardFit === "contain" ? "search-result-frame fit-contain" : "search-result-frame fit-cover";
    const showLogo = Boolean(item.showLogo && item.logo);
    const logoBlock = showLogo
      ? `    <span class="search-result-logo" aria-hidden="true"><img loading="lazy" src="${safeUrl(item.logo)}" alt="" /></span>`
      : "";
    return [
      `<button type="button" class="search-result-card" data-search-result-url="${esc(item.detailUrl || "")}" aria-label="Ouvrir ${title}">`,
      `  <span class="${frameClass}" style="--search-result-pos:${esc(item.imagePos || "50% 50%")}">`,
      `    <img class="search-result-image" loading="lazy" src="${safeUrl(item.image || "")}" alt="" />`,
      logoBlock,
      "  </span>",
      "</button>"
    ].join("\n");
  }

  function buildSearchOverlayResultPool(payloads) {
    const seen = new Set();
    const pool = [];
    const marketingThumbTypes = new Set(["thumb", "moviethumb", "tvthumb"]);
    (Array.isArray(payloads) ? payloads : []).forEach((payload) => {
      const rows = Array.isArray(payload && payload.rows) ? payload.rows : [];
      rows.forEach((row) => {
        const items = Array.isArray(row && row.items) ? row.items : [];
        items.forEach((entry) => {
          if (!entry || typeof entry !== "object") return;
          const title = String(entry.title || "").trim();
          if (!title) return;
          const kind = String(entry.kind || "movie").trim().toLowerCase();
          const year = String(entry.year || "").trim();
          const genre = String(entry.genre || "").trim();
          const cardImageType = String(entry.card_image_type || entry.cardImageType || "fallback").trim().toLowerCase();
          const logo = String(entry.logo || "").trim();
          const showLogo = Boolean(logo && (kind === "series" || kind === "documentary" || (kind === "movie" && !marketingThumbTypes.has(cardImageType))));
          const cardFit = cardImageType === "poster" || cardImageType === "banner" ? "contain" : "cover";
          const detailUrl = buildSearchDetailUrl(entry);
          if (!detailUrl || seen.has(detailUrl)) return;
          seen.add(detailUrl);
          pool.push({
            title,
            titleNorm: normalizeSearchText(title),
            kind,
            kindLabel: kindLabelForSearch(kind),
            year,
            image: entry.card_image || entry.cardImage || entry.image || "/static/template-assets/movie-1.jpg",
            imagePos: String(entry.card_image_position || entry.cardImagePosition || "50% 50%").trim() || "50% 50%",
            cardFit,
            logo,
            showLogo,
            detailUrl,
            searchBlob: normalizeSearchText([title, kindLabelForSearch(kind), kind, year, genre].join(" "))
          });
        });
      });
    });
    searchOverlayResultPool = pool;
  }

  function ensureSearchOverlayPoolLoaded() {
    if (searchOverlayResultPool.length) return Promise.resolve(searchOverlayResultPool);
    if (searchOverlayPoolPromise) return searchOverlayPoolPromise;
    const views = ["home", "films", "series", "documentaires"];
    const nonce = Date.now().toString(36);
    searchOverlayPoolPromise = Promise.all(
      views.map((view) =>
        apiJson(`/api/view-data?view=${encodeURIComponent(view)}&_=${encodeURIComponent(`${nonce}-${view}`)}`).catch(
          () => ({ rows: [] })
        )
      )
    )
      .then((payloads) => {
        buildSearchOverlayResultPool(payloads);
        return searchOverlayResultPool;
      })
      .catch(() => {
        searchOverlayResultPool = [];
        return searchOverlayResultPool;
      })
      .finally(() => {
        searchOverlayPoolPromise = null;
      });
    return searchOverlayPoolPromise;
  }

  function renderSearchOverlayResults(rawQuery) {
    if (!(searchOverlayResults instanceof HTMLElement)) return;
    const query = normalizeSearchText(rawQuery);
    if (!query) {
      searchOverlayResults.classList.remove("show");
      searchOverlayResults.innerHTML = "";
      return;
    }

    if (!searchOverlayResultPool.length) {
      searchOverlayResults.classList.add("show");
      searchOverlayResults.innerHTML = '<p class="search-results-empty">Chargement du catalogue...</p>';
      void ensureSearchOverlayPoolLoaded().then(() => {
        if (normalizeSearchText(readSearchValue()) !== query) return;
        renderSearchOverlayResults(query);
      });
      return;
    }

    const matches = collectSearchOverlayMatches(query, 9);
    searchOverlayResults.classList.add("show");
    if (!matches.length) {
      searchOverlayResults.innerHTML = '<p class="search-results-empty">Aucun titre trouve.</p>';
      return;
    }
    searchOverlayResults.innerHTML = `
      <div class="search-results-grid">
        ${matches.map((item) => resultCardMarkup(item)).join("\n")}
      </div>
    `;
  }

  function parseDetailData() {
    if (!detailDataNode) return {};
    try {
      return JSON.parse(detailDataNode.textContent || "{}") || {};
    } catch (_error) {
      return {};
    }
  }

  function detailItemKey() {
    const detail = parseDetailData();
    return String((detail && detail.item_key) || "").trim();
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
      throw new Error((data && data.message) || `HTTP ${response.status}`);
    }

    return data || {};
  }

  function shouldClearProgress(positionSeconds, durationSeconds) {
    const position = Number(positionSeconds);
    const duration = Number(durationSeconds);
    if (!Number.isFinite(position) || position < RESUME_MIN_SECONDS) return true;
    if (!Number.isFinite(duration) || duration <= 0) return false;
    const nearEnd = Math.max(duration * RESUME_END_RATIO, duration - RESUME_END_BUFFER_SECONDS);
    return position >= nearEnd;
  }

  function getProgress(itemKey) {
    const key = String(itemKey || "").trim();
    if (!key) return 0;
    const entry = progressMap[key];
    if (!entry || typeof entry !== "object") return 0;

    const position = Number(entry.position_seconds);
    const duration = Number(entry.duration_seconds);
    if (!Number.isFinite(position) || position <= 0) return 0;
    if (shouldClearProgress(position, duration)) return 0;
    return position;
  }

  function getProgressEntry(itemKey) {
    const key = String(itemKey || "").trim();
    if (!key) return null;
    const entry = progressMap[key];
    if (!entry || typeof entry !== "object") return null;
    return entry;
  }

  async function loadProgress() {
    if (!profileId) {
      progressMap = {};
      syncDetailWatchButton();
      return;
    }

    try {
      const data = await apiJson(`/api/progress?profile_id=${encodeURIComponent(profileId)}`);
      progressMap = data && data.items && typeof data.items === "object" ? data.items : {};
    } catch (_error) {
      progressMap = {};
    }

    syncDetailWatchButton();
  }

  function syncDetailWatchButton() {
    if (!(detailWatchBtn instanceof HTMLButtonElement)) return;
    const itemKey = String(detailWatchBtn.getAttribute("data-item-key") || detailItemKey()).trim();
    const resumeSeconds = getProgress(itemKey);

    detailWatchBtn.textContent = resumeSeconds > 0 ? "Reprendre" : "Regarder";
    detailWatchBtn.setAttribute("aria-label", resumeSeconds > 0 ? "Reprendre" : "Regarder");

    if (detailResumeFill instanceof HTMLElement) {
      const entry = getProgressEntry(itemKey);
      const duration = entry ? Number(entry.duration_seconds) : 0;
      const ratio = Number.isFinite(duration) && duration > 0 ? Math.max(0, Math.min(1, resumeSeconds / duration)) : 0;
      detailResumeFill.style.width = `${ratio * 100}%`;
    }
  }

  function syncDetailFavoriteButton(isFavorite) {
    if (!(detailFavoriteBtn instanceof HTMLButtonElement)) return;
    const active = Boolean(isFavorite);
    detailFavoriteBtn.classList.toggle("active", active);
    detailFavoriteBtn.textContent = active ? "Retirer de ma liste" : "Ajouter a ma liste";
    detailFavoriteBtn.setAttribute("aria-label", active ? "Retirer de ma liste" : "Ajouter a ma liste");
    detailFavoriteBtn.setAttribute("title", active ? "Retirer de ma liste" : "Ajouter a ma liste");
  }

  function wireDetailFavorite() {
    if (!(detailFavoriteBtn instanceof HTMLButtonElement)) return;

    const itemKey = String(detailFavoriteBtn.getAttribute("data-item-key") || "").trim();
    const detail = parseDetailData();
    syncDetailFavoriteButton(Boolean(detail && detail.is_favorite));

    if (!profileId || !itemKey) {
      detailFavoriteBtn.disabled = true;
      return;
    }

    detailFavoriteBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        const payload = await apiJson("/api/favorites/toggle", {
          method: "POST",
          body: JSON.stringify({
            profile_id: profileId,
            item_key: itemKey
          })
        });
        syncDetailFavoriteButton(Boolean(payload && payload.active));
      } catch (_error) {
        // Keep page interactive on API error.
      }
    });
  }

  function setActiveDetailTab(target) {
    const wanted = String(target || "").trim().toLowerCase();
    if (!wanted || !detailTabButtons.length || !detailTabPanels.length) return;

    detailTabButtons.forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      const tab = String(btn.dataset.tabTarget || "").trim().toLowerCase();
      const active = tab === wanted;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    detailTabPanels.forEach((panel) => {
      if (!(panel instanceof HTMLElement)) return;
      const panelName = String(panel.getAttribute("data-tab-panel") || "").trim().toLowerCase();
      panel.hidden = panelName !== wanted;
    });

    if (wanted === "details" && castRailRefreshers.length) {
      const run = () => {
        castRailRefreshers.forEach((fn) => {
          if (typeof fn === "function") fn();
        });
      };
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(run);
      });
      window.setTimeout(run, 120);
    }
  }

  function wireDetailTabs() {
    if (!detailTabButtons.length || !detailTabPanels.length) return;

    let initial = "related";
    detailTabButtons.forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      if (btn.classList.contains("active")) {
        initial = String(btn.dataset.tabTarget || initial);
      }
      btn.addEventListener("click", () => {
        setActiveDetailTab(btn.dataset.tabTarget || "");
      });
    });

    setActiveDetailTab(initial);
  }

  function setActiveSeason(target) {
    const wanted = String(target || "").trim().toLowerCase();
    if (!wanted || !seasonSelectButtons.length || !seasonPanels.length) return;

    seasonSelectButtons.forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      const current = String(btn.dataset.seasonTarget || "").trim().toLowerCase();
      const active = current === wanted;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
      btn.setAttribute("tabindex", active ? "0" : "-1");
    });

    seasonPanels.forEach((panel) => {
      if (!(panel instanceof HTMLElement)) return;
      const current = String(panel.getAttribute("data-season-panel") || "").trim().toLowerCase();
      panel.hidden = current !== wanted;
    });
  }

  function wireSeasonSelector() {
    if (!seasonSelectButtons.length || !seasonPanels.length) return;

    let initial = "";
    seasonSelectButtons.forEach((btn, index) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      const target = String(btn.dataset.seasonTarget || "").trim();
      if (!initial && (btn.classList.contains("active") || index === 0)) {
        initial = target;
      }

      btn.addEventListener("click", () => {
        setActiveSeason(target);
      });

      btn.addEventListener("keydown", (event) => {
        const key = String(event.key || "");
        if (key !== "ArrowRight" && key !== "ArrowLeft") return;
        event.preventDefault();
        const currentIndex = seasonSelectButtons.indexOf(btn);
        if (currentIndex < 0) return;
        const nextIndex = key === "ArrowRight"
          ? Math.min(seasonSelectButtons.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
        const nextBtn = seasonSelectButtons[nextIndex];
        if (!(nextBtn instanceof HTMLButtonElement)) return;
        setActiveSeason(String(nextBtn.dataset.seasonTarget || "").trim());
        nextBtn.focus();
      });
    });

    if (!initial && seasonSelectButtons[0] instanceof HTMLButtonElement) {
      initial = String(seasonSelectButtons[0].dataset.seasonTarget || "").trim();
    }
    if (initial) {
      setActiveSeason(initial);
    }
  }

  function wireActionButtons() {
    if (!actionButtons.length) return;
    actionButtons.forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener("click", (event) => {
        const watchUrl = String(btn.getAttribute("data-watch-url") || "").trim();
        const detailUrl = String(btn.getAttribute("data-detail-url") || "").trim();
        const targetUrl = watchUrl || detailUrl;
        if (!targetUrl || targetUrl === "#") return;
        const currentUrl = `${window.location.pathname}${window.location.search}`;
        if (targetUrl === currentUrl || targetUrl === window.location.pathname) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        window.location.href = targetUrl;
      });
    });
  }

  function wireMobileMenu() {
    if (!(mobileMenuToggle instanceof HTMLButtonElement) || !(mobileDropdown instanceof HTMLElement)) return;

    const closeMenu = () => {
      mobileDropdown.classList.remove("open");
      mobileMenuToggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("mobile-menu-open");
    };

    mobileMenuToggle.addEventListener("click", () => {
      const willOpen = !mobileDropdown.classList.contains("open");
      mobileDropdown.classList.toggle("open", willOpen);
      mobileMenuToggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
      document.body.classList.toggle("mobile-menu-open", willOpen);
    });

    mobileDropdown.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!mobileDropdown.contains(target) && !mobileMenuToggle.contains(target)) {
        closeMenu();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 920) closeMenu();
    });
  }

  function normalizeViewName(view) {
    const value = String(view || "").trim().toLowerCase();
    if (value === "films") return "films";
    if (value === "series") return "series";
    if (value === "documentaires") return "documentaires";
    if (value === "my-list") return "my-list";
    return "home";
  }

  function refreshSearchOverlayRefs() {
    searchOverlay = document.getElementById("search-overlay");
    searchOverlayInput = document.getElementById("search-overlay-input");
    searchOverlayKeyboard = document.getElementById("search-tv-keyboard");
    searchOverlayResults = document.getElementById("search-overlay-results");
    searchOverlayCloseTriggers = Array.from(document.querySelectorAll("[data-search-overlay-close]"));
  }

  function syncSearchOverlayMode() {
    if (!(searchOverlay instanceof HTMLElement)) return;
    searchOverlay.classList.toggle("is-tv", searchOverlayTvMode);
    searchOverlay.dataset.searchDevice = searchOverlayTvMode ? "tv" : "standard";
  }

  function ensureSearchOverlayDom() {
    if (document.getElementById("search-overlay")) {
      refreshSearchOverlayRefs();
      syncSearchOverlayMode();
      return;
    }

    const host = document.createElement("div");
    host.innerHTML = `
      <div class="search-overlay" id="search-overlay" aria-hidden="true">
        <div class="search-overlay-backdrop" data-search-overlay-close></div>
        <section class="search-overlay-panel glass-panel glass-edge" role="dialog" aria-modal="true" aria-labelledby="search-overlay-title">
          <header class="search-overlay-head">
            <button type="button" class="search-overlay-close" data-search-overlay-close aria-label="Fermer la recherche">Fermer</button>
          </header>
          <h2 id="search-overlay-title" class="text-display">Trouver un titre</h2>
          <div class="search-overlay-input-shell">
            <span class="search-overlay-icon" aria-hidden="true">&#8981;</span>
            <input
              id="search-overlay-input"
              class="search-overlay-input"
              type="search"
              inputmode="search"
              autocomplete="off"
              spellcheck="false"
              placeholder="Film, serie, documentaire..."
              aria-label="Recherche globale"
            />
            <button type="button" class="search-overlay-clear" data-search-action="clear">Effacer</button>
          </div>
          <div class="search-overlay-results" id="search-overlay-results" aria-live="polite"></div>
          <div class="search-tv-keyboard" id="search-tv-keyboard" role="group" aria-label="Clavier virtuel TV"></div>
          <div class="search-overlay-footer">
            <button type="button" class="search-tv-action" data-search-action="space">Espace</button>
            <button type="button" class="search-tv-action" data-search-action="backspace">Supprimer</button>
            <button type="button" class="search-tv-action search-tv-action-primary" data-search-action="submit">Rechercher</button>
          </div>
        </section>
      </div>
    `;
    const node = host.firstElementChild;
    if (node) {
      document.body.appendChild(node);
    }
    refreshSearchOverlayRefs();
    syncSearchOverlayMode();
  }

  function syncSearchInputs(rawValue) {
    const value = String(rawValue || "");
    if (topSearchInput instanceof HTMLInputElement && topSearchInput.value !== value) {
      topSearchInput.value = value;
    }
    if (searchOverlayInput instanceof HTMLInputElement && searchOverlayInput.value !== value) {
      searchOverlayInput.value = value;
    }
  }

  function readSearchValue() {
    if (searchOverlayInput instanceof HTMLInputElement) return searchOverlayInput.value;
    if (topSearchInput instanceof HTMLInputElement) return topSearchInput.value;
    return "";
  }

  function setSearchValue(rawValue) {
    const value = String(rawValue || "");
    syncSearchInputs(value);
    renderSearchOverlayResults(value);
  }

  function buildSearchOverlayKeyboard() {
    if (!searchOverlayTvMode) return;
    if (searchOverlayKeyboardBuilt) return;
    if (!(searchOverlayKeyboard instanceof HTMLElement)) return;

    const fragment = document.createDocumentFragment();
    SEARCH_TV_KEYS.forEach((row) => {
      row.forEach((key) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "search-tv-key";
        button.setAttribute("data-search-key", key);
        button.setAttribute("aria-label", `Ajouter ${key}`);
        button.textContent = key;
        fragment.appendChild(button);
      });
    });
    searchOverlayKeyboard.appendChild(fragment);
    searchOverlayKeyboardBuilt = true;
  }

  function openSearchOverlay() {
    if (!(searchOverlay instanceof HTMLElement)) {
      if (topSearchInput instanceof HTMLInputElement) topSearchInput.focus();
      return;
    }
    buildSearchOverlayKeyboard();
    setSearchValue(readSearchValue());
    void ensureSearchOverlayPoolLoaded();
    searchOverlay.classList.add("open");
    searchOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("search-overlay-open");
    setTimeout(() => {
      if (!(searchOverlayInput instanceof HTMLInputElement)) return;
      searchOverlayInput.focus();
      searchOverlayInput.select();
    }, 90);
  }

  function closeSearchOverlay(options) {
    if (!(searchOverlay instanceof HTMLElement)) return;
    const shouldClear = Boolean(options && options.clear);
    const shouldRestoreFocus = !options || options.restoreFocus !== false;
    if (shouldClear) {
      setSearchValue("");
    }
    searchOverlay.classList.remove("open");
    searchOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("search-overlay-open");
    if (shouldRestoreFocus && topSearchToggle instanceof HTMLButtonElement) {
      topSearchToggle.focus();
    }
  }

  function pushSearchCharacter(char) {
    if (!char) return;
    setSearchValue(`${readSearchValue()}${char}`);
    if (searchOverlayInput instanceof HTMLInputElement) searchOverlayInput.focus();
  }

  function popSearchCharacter() {
    const value = readSearchValue();
    if (!value) return;
    setSearchValue(value.slice(0, -1));
    if (searchOverlayInput instanceof HTMLInputElement) searchOverlayInput.focus();
  }

  function navigateToSearch(rawQuery) {
    const query = String(rawQuery || "").trim();
    const view = normalizeViewName(initialView);
    const basePath = VIEW_ROUTES[view] || VIEW_ROUTES.home;
    const target = new URL(basePath, window.location.origin);
    if (query) target.searchParams.set("q", query);
    window.location.href = `${target.pathname}${target.search}`;
  }

  function submitSearchOverlay() {
    const query = readSearchValue().trim();
    if (!query) {
      closeSearchOverlay({ clear: false });
      return;
    }
    navigateToSearch(query);
  }

  function wireTopSearch() {
    if (!(topSearchToggle instanceof HTMLButtonElement)) return;
    ensureSearchOverlayDom();

    topSearchToggle.addEventListener("click", (event) => {
      event.preventDefault();
      openSearchOverlay();
    });

    if (topSearchInput instanceof HTMLInputElement) {
      topSearchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          navigateToSearch(topSearchInput.value);
        }
      });
    }

    if (searchOverlayInput instanceof HTMLInputElement) {
      searchOverlayInput.addEventListener("input", () => setSearchValue(searchOverlayInput.value));
      searchOverlayInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          submitSearchOverlay();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeSearchOverlay({ clear: false });
        }
      });
    }

    searchOverlayCloseTriggers.forEach((trigger) => {
      if (!(trigger instanceof HTMLElement)) return;
      trigger.addEventListener("click", () => closeSearchOverlay({ clear: false }));
    });

    if (searchOverlay instanceof HTMLElement) {
      searchOverlay.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const resultCard = target.closest("[data-search-result-url]");
        if (resultCard instanceof HTMLElement) {
          const targetUrl = String(resultCard.getAttribute("data-search-result-url") || "").trim();
          if (targetUrl) {
            closeSearchOverlay({ clear: false, restoreFocus: false });
            window.location.href = targetUrl;
          }
          return;
        }
        const action = target.getAttribute("data-search-action");
        if (action === "clear") {
          setSearchValue("");
          return;
        }
        if (action === "space") {
          pushSearchCharacter(" ");
          return;
        }
        if (action === "backspace") {
          popSearchCharacter();
          return;
        }
        if (action === "submit") {
          submitSearchOverlay();
          return;
        }
        const key = target.getAttribute("data-search-key");
        if (key) {
          pushSearchCharacter(key);
        }
      });
    }

    document.addEventListener("keydown", (event) => {
      if (!(searchOverlay instanceof HTMLElement) || !searchOverlay.classList.contains("open")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearchOverlay({ clear: false });
      }
    });
  }

  function openAvatarMenu() {
    if (!(avatarHub instanceof HTMLElement)) return;
    avatarHub.classList.add("open");
    avatarHub.setAttribute("aria-hidden", "false");
    document.body.classList.add("avatar-hub-open");
  }

  function closeAvatarMenu() {
    if (!(avatarHub instanceof HTMLElement)) return;
    avatarHub.classList.remove("open");
    avatarHub.setAttribute("aria-hidden", "true");
    document.body.classList.remove("avatar-hub-open");
  }

  function goHome() {
    window.location.href = "/accueil";
  }

  function wireAvatarMenu() {
    if (!(profileAvatarButton instanceof HTMLButtonElement)) return;

    if (!(avatarHub instanceof HTMLElement)) {
      profileAvatarButton.addEventListener("click", (event) => {
        event.preventDefault();
        goHome();
      });
      return;
    }

    profileAvatarButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (avatarHub.classList.contains("open")) {
        closeAvatarMenu();
      } else {
        openAvatarMenu();
      }
    });

    avatarHubCloseTriggers.forEach((trigger) => {
      trigger.addEventListener("click", closeAvatarMenu);
    });

    if (avatarMenuSwitchProfileBtn instanceof HTMLButtonElement) {
      avatarMenuSwitchProfileBtn.addEventListener("click", () => {
        closeAvatarMenu();
        goHome();
      });
    }

    if (avatarMenuSettingsBtn instanceof HTMLButtonElement) {
      avatarMenuSettingsBtn.addEventListener("click", () => {
        closeAvatarMenu();
        goHome();
      });
    }

    if (avatarMenuLogoutBtn instanceof HTMLButtonElement) {
      avatarMenuLogoutBtn.addEventListener("click", async () => {
        try {
          await apiJson("/api/auth/logout", { method: "POST" });
        } catch (_error) {
          // Keep local logout flow even if API is unavailable.
        } finally {
          closeAvatarMenu();
          goHome();
        }
      });
    }

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!avatarHub.classList.contains("open")) return;
      if (avatarHub.contains(target) || profileAvatarButton.contains(target)) return;
      closeAvatarMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && avatarHub.classList.contains("open")) {
        closeAvatarMenu();
      }
    });
  }

  function wireCastRails() {
    if (!castRailWraps.length) return;

    castRailWraps.forEach((wrap) => {
      if (!(wrap instanceof HTMLElement)) return;
      const rail = wrap.querySelector("[data-cast-rail]");
      const prevBtn = wrap.querySelector('[data-cast-nav="prev"]');
      const nextBtn = wrap.querySelector('[data-cast-nav="next"]');
      if (!(rail instanceof HTMLElement)) return;

      let rafToken = 0;

      const scrollStep = () => {
        const firstCard = rail.querySelector(".detail-cast-card");
        const computed = window.getComputedStyle(rail);
        const gap = parseFloat(computed.gap || computed.columnGap || "12") || 12;
        const w = firstCard instanceof HTMLElement ? firstCard.getBoundingClientRect().width : 0;
        if (w > 0) {
          return Math.max(168, Math.round(w * 2 + gap * 1.25));
        }
        return Math.max(rail.clientWidth * 0.65, 240);
      };

      const updateNavState = () => {
        const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
        const isOverflowing = maxScroll > 2;
        wrap.classList.toggle("is-overflowing", isOverflowing);

        if (prevBtn instanceof HTMLButtonElement) {
          prevBtn.hidden = !isOverflowing;
          prevBtn.disabled = !isOverflowing || rail.scrollLeft <= 4;
        }

        if (nextBtn instanceof HTMLButtonElement) {
          nextBtn.hidden = !isOverflowing;
          nextBtn.disabled = !isOverflowing || rail.scrollLeft >= maxScroll - 4;
        }
      };

      const scheduleUpdate = () => {
        if (rafToken) return;
        rafToken = window.requestAnimationFrame(() => {
          rafToken = 0;
          updateNavState();
        });
      };

      castRailRefreshers.push(scheduleUpdate);

      const scrollRailBy = (delta) => {
        rail.scrollBy({ left: delta, behavior: "smooth" });
      };

      if (prevBtn instanceof HTMLButtonElement) {
        prevBtn.addEventListener("click", () => scrollRailBy(-scrollStep()));
      }

      if (nextBtn instanceof HTMLButtonElement) {
        nextBtn.addEventListener("click", () => scrollRailBy(scrollStep()));
      }

      rail.addEventListener("scroll", scheduleUpdate, { passive: true });

      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(scheduleUpdate);
        observer.observe(rail);
        observer.observe(wrap);
      }

      scheduleUpdate();
      window.setTimeout(scheduleUpdate, 100);
      window.setTimeout(scheduleUpdate, 320);
    });

    if (castRailRefreshers.length) {
      window.addEventListener("resize", () => {
        castRailRefreshers.forEach((fn) => { if (typeof fn === "function") fn(); });
      });
    }
  }

  async function init() {
    await loadProgress();
    wireMobileMenu();
    wireTopSearch();
    wireAvatarMenu();
    wireDetailFavorite();
    wireCastRails();
    wireDetailTabs();
    wireSeasonSelector();
    wireActionButtons();

    const refreshCastRailsLayout = () => {
      castRailRefreshers.forEach((fn) => {
        if (typeof fn === "function") fn();
      });
    };
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(refreshCastRailsLayout);
    });
    window.setTimeout(refreshCastRailsLayout, 200);
  }

  init();
})();
