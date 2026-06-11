// Today's Matches widget.
//
// Data sources (static JSON in a third-party repo, served via jsDelivr CDN with
// CORS enabled — no API key, no backend, no rate-limit concerns):
//   https://github.com/rezarahiminia/worldcup2026
//
// jsDelivr aggressively caches these files, so we also fall back to localStorage
// when the network is unreachable so the widget keeps rendering offline.

(function () {
  "use strict";

  const DATA_BASE = "https://cdn.jsdelivr.net/gh/rezarahiminia/worldcup2026@main";
  const MATCHES_URL = `${DATA_BASE}/football.matches.json`;
  const TEAMS_URL = `${DATA_BASE}/football.teams.json`;
  const STADIUMS_URL = `${DATA_BASE}/football.stadiums.json`;
  const CACHE_KEY = "fanframe-matches-cache-v1";
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

  // Map source-side FIFA codes → codes used in this project's teams.js.
  // Most match already; only a handful differ.
  const CODE_ALIASES = {
    BIH: "BIH",     // not currently in teams.js (Bosnia) — handled gracefully
    KOR: "KOR",
    RSA: "RSA",
    CZE: "CZE",
  };

  async function fetchJson(url) {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.json();
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.savedAt !== "number") return null;
      if (Date.now() - parsed.savedAt > CACHE_TTL_MS * 4) return null; // hard cap 24h
      return parsed;
    } catch { return null; }
  }

  function saveCache(payload) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), ...payload }));
    } catch { /* quota / privacy mode — ignore */ }
  }

  async function loadAllData() {
    const cached = loadCache();
    const fresh = cached && (Date.now() - cached.savedAt) < CACHE_TTL_MS;
    if (fresh) return cached;

    try {
      const [matches, teams, stadiums] = await Promise.all([
        fetchJson(MATCHES_URL),
        fetchJson(TEAMS_URL),
        fetchJson(STADIUMS_URL),
      ]);
      const payload = { matches, teams, stadiums };
      saveCache(payload);
      return payload;
    } catch (err) {
      // Network failed — fall back to stale cache if we have one.
      if (cached) return cached;
      throw err;
    }
  }

  // Source dates look like "06/11/2026 13:00" with no timezone. Treat them as
  // local time at the stadium. Without per-stadium TZ data we display the raw
  // kickoff time and label it "local" so we don't lie to the viewer.
  function parseKickoff(localDate) {
    if (!localDate) return null;
    const m = localDate.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!m) return null;
    const [, mm, dd, yyyy, hh, min] = m;
    return { yyyy, mm, dd, hh, min };
  }

  function todayKeyPT() {
    // GitHub Pages users span timezones, but "today's matches" should reflect
    // the FIFA tournament day. We bucket by tournament-local US date.
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric", month: "2-digit", day: "2-digit",
    });
    const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
    return `${parts.month}/${parts.day}/${parts.year}`;
  }

  function getTodayMatches({ matches }) {
    const today = todayKeyPT();
    return matches.filter(m => (m.local_date || "").startsWith(today));
  }

  function getUpcomingMatches({ matches }, limit = 3) {
    // Find the next N upcoming matches as a fallback when today has none.
    const upcoming = matches
      .map(m => ({ m, k: parseKickoff(m.local_date) }))
      .filter(x => x.k)
      .map(({ m, k }) => ({ m, ts: new Date(`${k.yyyy}-${k.mm}-${k.dd}T${k.hh}:${k.min}:00`).getTime() }))
      .filter(x => x.ts >= Date.now() - 3 * 60 * 60 * 1000) // include in-progress (<3h old)
      .sort((a, b) => a.ts - b.ts)
      .slice(0, limit)
      .map(x => x.m);
    return upcoming;
  }

  function teamByMatchId(teams, id) {
    return teams.find(t => String(t.id) === String(id));
  }

  function stadiumById(stadiums, id) {
    return stadiums.find(s => String(s.id) === String(id));
  }

  // Look up the team in this project's TEAMS[] (defined in teams.js) by FIFA code.
  // The source data uses a slightly different code set in a few cases.
  function localTeam(code) {
    if (!code) return null;
    const aliased = CODE_ALIASES[code] || code;
    const list = (typeof TEAMS !== "undefined" && TEAMS) || window.TEAMS || [];
    return list.find(t => t.code === aliased) || null;
  }

  // Render kickoff in the viewer's local timezone. We treat the source string
  // as local-at-stadium and use it directly when no offset is known.
  function formatKickoff(localDate) {
    const k = parseKickoff(localDate);
    if (!k) return "";
    return `${k.hh}:${k.min} local`;
  }

  function flagFor(code) {
    const team = localTeam(code);
    return team ? team.flag : "🏳️";
  }

  function buildMatchRow(match, data) {
    const homeSrc = teamByMatchId(data.teams, match.home_team_id);
    const awaySrc = teamByMatchId(data.teams, match.away_team_id);
    const homeCode = homeSrc?.fifa_code || "?";
    const awayCode = awaySrc?.fifa_code || "?";
    const stadium = stadiumById(data.stadiums, match.stadium_id);
    const finished = String(match.finished).toUpperCase() === "TRUE";
    const inProgress = !finished && match.time_elapsed && match.time_elapsed !== "notstarted";

    const homeName = homeSrc?.name_en || homeCode;
    const awayName = awaySrc?.name_en || awayCode;

    const scoreOrTime = finished || inProgress
      ? `<span class="match-score">${match.home_score} – ${match.away_score}</span>`
      : `<span class="match-time">${formatKickoff(match.local_date)}</span>`;

    const statusBadge = finished
      ? `<span class="match-status match-status-ft">FT</span>`
      : inProgress
        ? `<span class="match-status match-status-live">LIVE</span>`
        : "";

    const groupLabel = match.type === "group"
      ? `Group ${match.group}`
      : (match.type || "").toUpperCase();

    const venue = stadium ? `${stadium.name_en}, ${stadium.city_en}` : "";

    return `
      <div class="match-row">
        <div class="match-teams">
          <button class="match-team" data-team-code="${homeCode}" title="Generate ${homeName} avatar">
            <span class="match-flag">${flagFor(homeCode)}</span>
            <span class="match-code">${homeCode}</span>
          </button>
          <span class="match-vs">vs</span>
          <button class="match-team" data-team-code="${awayCode}" title="Generate ${awayName} avatar">
            <span class="match-flag">${flagFor(awayCode)}</span>
            <span class="match-code">${awayCode}</span>
          </button>
        </div>
        <div class="match-meta">
          ${scoreOrTime}
          ${statusBadge}
        </div>
        <div class="match-sub">
          <span>${groupLabel}</span>${venue ? ` · <span>${venue}</span>` : ""}
        </div>
      </div>
    `;
  }

  function render(container, data) {
    const today = getTodayMatches(data);
    const list = today.length > 0 ? today : getUpcomingMatches(data, 3);
    const headerLabel = today.length > 0 ? "Today" : "Up next";

    if (list.length === 0) {
      container.innerHTML = `
        <div class="matches-header">
          <span class="matches-title">World Cup 2026</span>
        </div>
        <p class="matches-empty">No upcoming matches.</p>
        ${attribution()}
      `;
      return;
    }

    container.innerHTML = `
      <div class="matches-header">
        <span class="matches-title">${headerLabel} · World Cup 2026</span>
      </div>
      ${list.map(m => buildMatchRow(m, data)).join("")}
      ${attribution()}
    `;

    // Wire click-to-prefill: pressing a team in the widget sets it in the
    // generator dropdown and focuses the username input.
    container.querySelectorAll(".match-team[data-team-code]").forEach(btn => {
      btn.addEventListener("click", () => {
        const code = btn.getAttribute("data-team-code");
        const team = localTeam(code);
        if (!team) return;
        const select = document.getElementById("team");
        const username = document.getElementById("username");
        if (select) {
          select.value = team.code;
          select.dispatchEvent(new Event("change"));
        }
        if (username) {
          username.focus();
        }
        container.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function attribution() {
    return `
      <p class="matches-attribution">
        Schedule data from
        <a href="https://github.com/rezarahiminia/worldcup2026" target="_blank" rel="noopener">rezarahiminia/worldcup2026</a>
      </p>
    `;
  }

  function renderError(container, err) {
    console.warn("[fanframe] matches widget failed:", err);
    container.innerHTML = `
      <div class="matches-header">
        <span class="matches-title">World Cup 2026</span>
      </div>
      <p class="matches-empty">Schedule unavailable right now.</p>
      ${attribution()}
    `;
  }

  async function init() {
    const container = document.getElementById("matches-widget");
    if (!container) return;
    container.classList.add("matches-loading");
    try {
      const data = await loadAllData();
      container.classList.remove("matches-loading");
      render(container, data);
    } catch (err) {
      container.classList.remove("matches-loading");
      renderError(container, err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
