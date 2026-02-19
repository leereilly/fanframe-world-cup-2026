(async function () {
  "use strict";

  // Wait for Tiny5 font to load before any canvas drawing
  await document.fonts.load("16px 'Tiny5'");

  const SIZE = 600;
  const OUTER_MARGIN = 12;        // safe margin so glow isn't cropped
  const RING_WIDTH = 18;          // slim color ring
  const WHITE_STROKE = 4;         // thin white outer stroke
  const INNER_SHADOW_WIDTH = 6;   // subtle shadow between ring and avatar

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
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const avatarR = SIZE / 2;

    ctx.clearRect(0, 0, SIZE, SIZE);

    // --- Avatar image (square, full bleed) ---
    ctx.drawImage(img, 0, 0, SIZE, SIZE);

    // --- Ribbon banner at bottom ---
    drawRibbon(ctx, cx, cy, avatarR, team, SIZE);
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

    // Thin divider lines between segments for crispness
    if (count > 1) {
      c.strokeStyle = "rgba(255,255,255,0.15)";
      c.lineWidth = 1;
      for (let i = 0; i < count; i++) {
        const angle = segmentAngle * i - Math.PI / 2;
        c.beginPath();
        c.moveTo(cx + innerR * Math.cos(angle), cy + innerR * Math.sin(angle));
        c.lineTo(cx + outerR * Math.cos(angle), cy + outerR * Math.sin(angle));
        c.stroke();
      }
    }
  }

  function drawRibbon(c, cx, cy, outerR, team, size) {
    const scale = size / SIZE;
    const colors = team.colors;

    // Compute text position first, then size ribbon to cover it
    const baseRibbonH = size * 0.28;
    const fontSize = Math.max(Math.round(baseRibbonH * 1.0), 10);
    const textY = size - baseRibbonH + baseRibbonH * 0.55 - 20;
    const padding = Math.max(16 * scale, 4);
    const ribbonY = textY - fontSize / 2 - padding;
    const ribbonH = size - ribbonY;

    // Filter out white from gradient for teams with 3+ colors
    let gradColors = colors;
    if (colors.length > 2) {
      const filtered = colors.filter(c => c.toUpperCase() !== "#FFFFFF" && c.toUpperCase() !== "#FFF");
      if (filtered.length >= 2) gradColors = filtered;
    }

    // Country code text — Tiny5
    c.font = `${fontSize}px 'Tiny5', monospace`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.letterSpacing = Math.max(Math.round(4 * scale), 1) + "px";

    // White drop shadow — soft glow behind text
    c.save();
    c.shadowColor = "rgba(255,255,255,0.8)";
    c.shadowBlur = 20;
    c.fillStyle = "rgba(255,255,255,0.6)";
    for (let i = 0; i < 5; i++) {
      c.fillText(team.code, cx, textY);
    }
    c.restore();

    // Black text layer — 2px up and 2px right
    c.fillStyle = "#000000";
    c.fillText(team.code, cx + 2, textY - 2);

    // Black text layer — 2px down and 2px left
    c.fillStyle = "#000000";
    c.fillText(team.code, cx - 2, textY + 2);

    // Country color text layer — centered on top
    // If 3 colors, assign one per letter; otherwise use the main color
    if (colors.length >= 3 && team.code.length === 3) {
      const letters = team.code.split("");
      const totalWidth = c.measureText(team.code).width;
      let curX = cx - totalWidth / 2;
      c.textAlign = "left";
      letters.forEach((letter, i) => {
        c.fillStyle = lightenIfDark(colors[i]);
        const lw = c.measureText(letter).width;
        c.fillText(letter, curX, textY);
        curX += lw;
      });
      c.textAlign = "center";
    } else {
      c.fillStyle = lightenIfDark(colors[0]);
      c.fillText(team.code, cx, textY);
    }
    c.letterSpacing = "0px";
  }

  function getBadgeBg(colors) {
    // Pick the darkest color for better badge appearance
    let darkest = colors[0];
    let minLum = luminance(darkest);
    for (let i = 1; i < colors.length; i++) {
      const lum = luminance(colors[i]);
      if (lum < minLum) {
        minLum = lum;
        darkest = colors[i];
      }
    }
    // If darkest is too close to black, use the first color instead
    if (minLum < 0.02 && colors.length > 1) {
      return colors.find(c => luminance(c) > 0.05) || darkest;
    }
    return darkest;
  }

  function luminance(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function lightenIfDark(hex) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    if (luminance(hex) < 0.25) {
      const amt = 60;
      r = Math.min(255, r + amt);
      g = Math.min(255, g + amt);
      b = Math.min(255, b + amt);
    }
    return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
  }

  function getContrastText(bgHex) {
    return luminance(bgHex) > 0.4 ? "#000000" : "#FFFFFF";
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
    const size = cvs.width;
    const c = cvs.getContext("2d");
    const cx = size / 2;
    const cy = size / 2;

    c.clearRect(0, 0, size, size);

    // Avatar (square, full bleed)
    c.drawImage(img, 0, 0, size, size);

    // Ribbon banner at bottom
    drawRibbon(c, cx, cy, size / 2, team, size);
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
