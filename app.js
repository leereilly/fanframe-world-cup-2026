(async function () {
  "use strict";

  // Wait for Tiny5 font to load before any canvas drawing
  await document.fonts.load("16px 'Tiny5'");

  const SIZE = 600;

  const teamSelect = document.getElementById("team");
  const usernameInput = document.getElementById("username");
  const generateBtn = document.getElementById("generate");
  const previewSection = document.getElementById("preview-section");
  const canvas = document.getElementById("canvas");
  const downloadBtn = document.getElementById("download");
  const ctx = canvas.getContext("2d");

  // Populate team dropdown
  TEAMS.forEach((team) => {
    const opt = document.createElement("option");
    opt.value = team.code;
    opt.textContent = `${team.name} ${team.flag} (${team.code})`;
    teamSelect.appendChild(opt);
  });

  // Allow URLs and usernames — no character restriction
  usernameInput.addEventListener("input", () => {
    // No filtering — accept URLs and usernames
  });

  // Handle Enter key
  usernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") generateBtn.click();
  });

  // Detect platform from input and return avatar image URL
  function detectAvatarSource(input) {
    const val = input.trim();
    if (!val) return null;

    // URL-based detection
    try {
      const url = new URL(val);
      const host = url.hostname.replace("www.", "");
      const path = url.pathname.replace(/\/+$/, "");
      const parts = path.split("/").filter(Boolean);
      const handle = parts[0] || "";

      // GitHub
      if (host === "github.com" && handle) {
        return { platform: "github", user: handle };
      }
      // X / Twitter
      if ((host === "twitter.com" || host === "x.com") && handle) {
        return { platform: "x", user: handle, directUrl: `https://unavatar.io/x/${handle}` };
      }
      // Bluesky — use public API directly
      if (host === "bsky.app" && parts[0] === "profile" && parts[1]) {
        return { platform: "bluesky", user: parts[1] };
      }
      // YouTube
      if (host === "youtube.com" && handle) {
        const ytUser = handle.replace(/^@/, "");
        return { platform: "youtube", user: ytUser, directUrl: `https://unavatar.io/youtube/${ytUser}` };
      }
      // Gravatar
      if (host === "gravatar.com" && handle) {
        return { platform: "gravatar", user: handle, directUrl: `https://unavatar.io/gravatar/${handle}` };
      }
      // Instagram
      if (host === "instagram.com" && handle) {
        return { platform: "unsupported", name: "Instagram" };
      }
      // LinkedIn
      if (host === "linkedin.com") {
        return { platform: "unsupported", name: "LinkedIn" };
      }
      // Facebook
      if (host === "facebook.com" && handle) {
        return { platform: "unsupported", name: "Facebook" };
      }
      // Reddit
      if (host === "reddit.com" && parts[0] === "user" && parts[1]) {
        return { platform: "unsupported", name: "Reddit" };
      }
      // Telegram
      if (host === "t.me" && handle) {
        return { platform: "unsupported", name: "Telegram" };
      }
      // Mastodon
      if (host.includes("mastodon") || host.includes("mstdn") || host.includes("fosstodon")) {
        const mastoHandle = handle.replace(/^@/, "");
        if (mastoHandle) {
          return { platform: "mastodon", user: mastoHandle, mastoHost: host };
        }
      }

      // Direct image URL (by extension or known image CDN hosts)
      const imageHosts = ["media.licdn.com", "pbs.twimg.com", "cdn.bsky.app", "i.imgur.com", "avatars.githubusercontent.com", "gravatar.com", "i.redd.it"];
      if (/\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(path) || imageHosts.some(h => host === h || host.endsWith("." + h))) {
        return { platform: "image", directUrl: val };
      }

      // Unknown URL — try as direct image first, fall back to unavatar
      return { platform: "unknown-url", directUrl: val };
    } catch {
      // Not a URL — treat as GitHub username
      return { platform: "github", user: val };
    }
  }

  async function fetchAvatarImage(source) {
    if (source.platform === "unsupported") {
      throw new Error(`${source.name} doesn't allow public avatar access. Try a GitHub, X, Bluesky, YouTube, or Mastodon URL instead. Or provide an image URL.`);
    }
    if (source.platform === "image") {
      return loadImage(source.directUrl);
    }
    if (source.platform === "unknown-url") {
      // Try loading as image directly; if that fails, try proxying through wsrv.nl
      try {
        return await loadImage(source.directUrl);
      } catch {
        return loadImage(`https://wsrv.nl/?url=${encodeURIComponent(source.directUrl)}&w=512&h=512`);
      }
    }
    if (source.platform === "github") {
      const apiRes = await fetch(`https://api.github.com/users/${encodeURIComponent(source.user)}`);
      if (!apiRes.ok) throw new Error("User not found");
      const userData = await apiRes.json();
      return loadImage(userData.avatar_url + "&s=512");
    }
    if (source.platform === "bluesky") {
      const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(source.user)}`);
      if (!res.ok) throw new Error("Bluesky user not found");
      const profile = await res.json();
      if (!profile.avatar) throw new Error("No Bluesky avatar found");
      return loadImage(profile.avatar);
    }
    if (source.platform === "mastodon") {
      const res = await fetch(`https://${source.mastoHost}/api/v1/accounts/lookup?acct=${encodeURIComponent(source.user)}`);
      if (!res.ok) throw new Error("Mastodon user not found");
      const account = await res.json();
      if (!account.avatar) throw new Error("No Mastodon avatar found");
      return loadImage(account.avatar);
    }
    // X, YouTube, Gravatar, generic — use unavatar.io directly
    try {
      return await loadImage(source.directUrl);
    } catch {
      // Fallback: resolve via JSON API, then proxy through wsrv.nl
      const jsonRes = await fetch(source.directUrl + "?json");
      if (!jsonRes.ok) throw new Error("Could not resolve avatar");
      const data = await jsonRes.json();
      if (!data.url) throw new Error("No avatar found");
      return loadImage(`https://wsrv.nl/?url=${encodeURIComponent(data.url)}&w=512&h=512`);
    }
  }

  generateBtn.addEventListener("click", async () => {
    const input = usernameInput.value.trim();
    const teamCode = teamSelect.value;

    clearError();

    if (!input) return showError("Please enter a username or profile URL.");
    if (!teamCode) return showError("Please select a team.");

    const team = TEAMS.find((t) => t.code === teamCode);
    if (!team) return showError("Team not found.");

    const source = detectAvatarSource(input);
    if (!source) return showError("Could not detect a profile from the input.");

    generateBtn.disabled = true;
    generateBtn.textContent = "Loading…";

    try {
      const img = await fetchAvatarImage(source);
      drawAvatar(img, team);
      previewSection.classList.remove("hidden");
      document.getElementById("examples-section").style.display = "none";
    } catch (err) {
      showError(err.message || "Could not load avatar. Check the username/URL and try again.");
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = "Generate Avatar";
    }
  });

  downloadBtn.addEventListener("click", () => {
    const username = usernameInput.value.trim() || "avatar";
    const teamCode = teamSelect.value || "wc26";
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${username}-${teamCode.toLowerCase()}-wc2026.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  function drawAvatar(img, team) {
    renderAvatar(ctx, img, team, SIZE);
  }

  // Unified renderer: circular avatar + country-color border ring + styled code.
  // Built for GitHub's circular crop — the ring sits flush to the circle edge.
  function renderAvatar(c, img, team, size) {
    const cx = size / 2;
    const cy = size / 2;
    const colors = team.colors;

    c.clearRect(0, 0, size, size);

    const ringOuter = size / 2;
    const ringWidth = Math.max(size * 0.08, 6);
    const ringInner = ringOuter - ringWidth;
    const sep = Math.max(size * 0.0075, 1);

    // Avatar clipped to a circle, with a vignette + bottom scrim for depth and legibility
    c.save();
    c.beginPath();
    c.arc(cx, cy, ringInner, 0, Math.PI * 2);
    c.closePath();
    c.clip();
    c.drawImage(img, 0, 0, size, size);

    const vignette = c.createRadialGradient(cx, cy, ringInner * 0.62, cx, cy, ringInner);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.22)");
    c.fillStyle = vignette;
    c.fillRect(0, 0, size, size);

    const scrim = c.createLinearGradient(0, cy, 0, size);
    scrim.addColorStop(0, "rgba(0,0,0,0)");
    scrim.addColorStop(1, "rgba(0,0,0,0.5)");
    c.fillStyle = scrim;
    c.fillRect(0, cy, size, size - cy);
    c.restore();

    // Country-color border ring
    drawColorRing(c, cx, cy, ringOuter, ringInner, colors);

    // Crisp white separator between avatar and ring
    c.strokeStyle = "rgba(255,255,255,0.95)";
    c.lineWidth = sep * 1.8;
    c.beginPath();
    c.arc(cx, cy, ringInner, 0, Math.PI * 2);
    c.stroke();

    // Thin dark outer rim — keeps the border defined on any background
    c.strokeStyle = "rgba(0,0,0,0.32)";
    c.lineWidth = sep * 1.4;
    c.beginPath();
    c.arc(cx, cy, ringOuter - sep * 0.7, 0, Math.PI * 2);
    c.stroke();

    drawCountryCode(c, cx, cy, ringInner, team, size);
  }

  function drawColorRing(c, cx, cy, outerR, innerR, colors) {
    const count = colors.length;

    if (count === 1) {
      // Solid ring
      c.beginPath();
      c.arc(cx, cy, outerR, 0, Math.PI * 2);
      c.arc(cx, cy, innerR, 0, Math.PI * 2, true);
      c.fillStyle = colors[0];
      c.fill();
      return;
    }

    // Segmented ring — equal segments starting from top
    const segmentAngle = (Math.PI * 2) / count;
    colors.forEach((color, i) => {
      const startAngle = segmentAngle * i - Math.PI / 2;
      const endAngle = segmentAngle * (i + 1) - Math.PI / 2;
      c.beginPath();
      c.arc(cx, cy, outerR, startAngle, endAngle);
      c.arc(cx, cy, innerR, endAngle, startAngle, true);
      c.closePath();
      c.fillStyle = color;
      c.fill();
    });

    // Subtle dividers between segments for crispness
    c.strokeStyle = "rgba(255,255,255,0.22)";
    c.lineWidth = Math.max((outerR - innerR) * 0.04, 1);
    for (let i = 0; i < count; i++) {
      const angle = segmentAngle * i - Math.PI / 2;
      c.beginPath();
      c.moveTo(cx + innerR * Math.cos(angle), cy + innerR * Math.sin(angle));
      c.lineTo(cx + outerR * Math.cos(angle), cy + outerR * Math.sin(angle));
      c.stroke();
    }
  }

  // Country code styled from the flag: tricolor flags get one color per letter,
  // others use the most vivid flag color. Adaptive outline keeps it readable on any avatar.
  function drawCountryCode(c, cx, cy, innerR, team, size) {
    const colors = team.colors;
    const code = team.code;
    const fontSize = Math.max(Math.round(innerR * 0.32), 12);
    const textY = cy + innerR * 0.55;

    c.font = `${fontSize}px 'Tiny5', monospace`;
    c.textBaseline = "middle";
    c.textAlign = "left";
    c.letterSpacing = "0px";

    const letters = code.split("");
    const widths = letters.map((l) => c.measureText(l).width);
    const gap = Math.max(fontSize * 0.1, 2);
    const totalWidth = widths.reduce((a, b) => a + b, 0) + gap * (letters.length - 1);
    let x = cx - totalWidth / 2;

    const perLetter = colors.length >= 3 && letters.length === 3;
    const single = perLetter ? null : pickVividColor(colors);

    letters.forEach((letter, i) => {
      const fill = perLetter ? colors[i] : single;

      // Soft glow for separation from the avatar
      c.save();
      c.shadowColor = "rgba(0,0,0,0.55)";
      c.shadowBlur = Math.max(size * 0.022, 4);
      c.shadowOffsetY = Math.max(size * 0.005, 1);
      c.fillStyle = fill;
      c.fillText(letter, x, textY);
      c.restore();

      // Outline — light on dark fills, dark on light fills
      c.lineJoin = "round";
      c.lineWidth = Math.max(fontSize * 0.16, 2);
      c.strokeStyle = luminance(fill) > 0.5 ? "rgba(0,0,0,0.9)" : "rgba(255,255,255,0.92)";
      c.strokeText(letter, x, textY);

      c.fillStyle = fill;
      c.fillText(letter, x, textY);

      x += widths[i] + gap;
    });
  }

  function luminance(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function saturation(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
  }

  // Most vivid flag color: prefer saturated, mid-luminance, non-white tones
  function pickVividColor(colors) {
    const pool = colors.filter((h) => luminance(h) < 0.82);
    const list = pool.length ? pool : colors;
    let best = list[0];
    let bestScore = -Infinity;
    for (const h of list) {
      const score = saturation(h) - Math.abs(luminance(h) - 0.5) * 0.4;
      if (score > bestScore) {
        bestScore = score;
        best = h;
      }
    }
    return best;
  }

  async function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  function showError(msg) {
    clearError();
    const el = document.createElement("p");
    el.className = "error-msg";
    el.textContent = msg;
    document.querySelector(".controls").appendChild(el);
  }

  function clearError() {
    const existing = document.querySelector(".error-msg");
    if (existing) existing.remove();
  }

  // --- Example avatars from GitHub public events ---
  async function loadExamples() {
    const grid = document.getElementById("examples-grid");
    try {
      const res = await fetch("https://api.github.com/events");
      if (!res.ok) return;
      const events = await res.json();

      // Extract unique usernames with avatar URLs
      const seen = new Set();
      const users = [];
      for (const event of events) {
        const login = event.actor?.login;
        const avatar = event.actor?.avatar_url;
        if (login && avatar && !seen.has(login)) {
          seen.add(login);
          users.push({ login, avatar });
        }
      }

      for (const user of users) {
        const team = TEAMS[Math.floor(Math.random() * TEAMS.length)];
        try {
          const img = await loadImage(user.avatar + "&s=200");
          if (isDefaultAvatar(img)) continue;

          const card = document.createElement("div");
          card.className = "example-card";

          const miniCanvas = document.createElement("canvas");
          miniCanvas.width = 200;
          miniCanvas.height = 200;
          card.appendChild(miniCanvas);

          grid.appendChild(card);
          drawMiniAvatar(miniCanvas, img, team);
        } catch {
          // skip failed loads
        }
      }
    } catch {
      // silently fail — examples are non-critical
    }
  }

  function isDefaultAvatar(img) {
    const tmp = document.createElement("canvas");
    tmp.width = img.width;
    tmp.height = img.height;
    const tc = tmp.getContext("2d");
    tc.drawImage(img, 0, 0);
    const data = tc.getContext ? tc : tmp.getContext("2d");
    const pixels = data.getImageData(0, 0, tmp.width, tmp.height).data;
    const total = pixels.length / 4;
    let match = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] === 240 && pixels[i + 1] === 240 && pixels[i + 2] === 240) match++;
    }
    return match / total >= 0.25;
  }

  function drawMiniAvatar(cvs, img, team) {
    renderAvatar(cvs.getContext("2d"), img, team, cvs.width);
  }

  loadExamples();

  // Render PR promo avatars with flag rings
  document.querySelectorAll(".pr-promo .pr-avatar[data-user]").forEach(async (cvs) => {
    const user = cvs.dataset.user;
    const teamCode = cvs.dataset.team;
    const team = TEAMS.find(t => t.code === teamCode);
    if (!team) return;
    try {
      const res = await fetch(`https://api.github.com/users/${user}`);
      if (!res.ok) return;
      const data = await res.json();
      const img = await loadImage(data.avatar_url + "&s=200");
      drawMiniAvatar(cvs, img, team);
    } catch { /* skip */ }
  });
})();
