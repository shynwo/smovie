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

  function openTopSearch() {
    if (!(topSearch instanceof HTMLElement) || !(topSearchInput instanceof HTMLInputElement)) return;
    topSearch.classList.add("open");
    setTimeout(() => {
      topSearchInput.focus();
      topSearchInput.select();
    }, 120);
  }

  function closeTopSearch(clear) {
    if (!(topSearch instanceof HTMLElement) || !(topSearchInput instanceof HTMLInputElement)) return;
    topSearch.classList.remove("open");
    if (clear) {
      topSearchInput.value = "";
    }
  }

  function navigateToSearch(rawQuery) {
    const query = String(rawQuery || "").trim();
    const view = normalizeViewName(initialView);
    const basePath = VIEW_ROUTES[view] || VIEW_ROUTES.home;
    const target = new URL(basePath, window.location.origin);
    if (query) target.searchParams.set("q", query);
    window.location.href = `${target.pathname}${target.search}`;
  }

  function wireTopSearch() {
    if (
      !(topSearch instanceof HTMLElement) ||
      !(topSearchToggle instanceof HTMLButtonElement) ||
      !(topSearchInput instanceof HTMLInputElement)
    ) {
      return;
    }

    topSearchToggle.addEventListener("click", (event) => {
      event.preventDefault();
      if (!topSearch.classList.contains("open")) {
        openTopSearch();
        return;
      }

      const query = topSearchInput.value.trim();
      if (!query) {
        closeTopSearch(true);
        return;
      }
      navigateToSearch(query);
    });

    topSearchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        navigateToSearch(topSearchInput.value);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeTopSearch(true);
        topSearchToggle.focus();
      }
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (topSearch.contains(target)) return;
      if (!topSearch.classList.contains("open")) return;
      closeTopSearch(false);
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
