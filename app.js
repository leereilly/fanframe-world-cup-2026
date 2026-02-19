(function () {
  "use strict";

  const SIZE = 600;
  const OUTER_MARGIN = 12;        // safe margin so glow isn't cropped
  const RING_WIDTH = 36;          // thick color ring
  const WHITE_STROKE = 4;         // thin white outer stroke
  const INNER_SHADOW_WIDTH = 6;   // subtle shadow between ring and avatar
  const BADGE_HEIGHT = 64;
  const BADGE_RADIUS = BADGE_HEIGHT / 2; // full pill shape

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
    const colors = team.colors;

    // Radii
    const outerR = SIZE / 2 - OUTER_MARGIN;
    const ringInnerR = outerR - RING_WIDTH;
    const avatarR = ringInnerR - 2; // tiny gap for shadow

    ctx.clearRect(0, 0, SIZE, SIZE);

    // --- Outer glow ---
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, outerR + 6, 0, Math.PI * 2);
    ctx.shadowColor = colors[0];
    ctx.shadowBlur = 24;
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fill();
    ctx.restore();

    // --- White outer stroke ---
    ctx.beginPath();
    ctx.arc(cx, cy, outerR + WHITE_STROKE / 2, 0, Math.PI * 2);
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = WHITE_STROKE;
    ctx.stroke();

    // --- Color ring (segmented for multi-color flags) ---
    drawColorRing(ctx, cx, cy, outerR, ringInnerR, colors);

    // --- Inner white border between ring and avatar ---
    ctx.beginPath();
    ctx.arc(cx, cy, ringInnerR, 0, Math.PI * 2);
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 3;
    ctx.stroke();

    // --- Avatar image (circular clip) ---
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, avatarR, 0, Math.PI * 2);
    ctx.clip();
    const avatarSize = avatarR * 2;
    const avatarOffset = cx - avatarR;
    ctx.drawImage(img, avatarOffset, avatarOffset, avatarSize, avatarSize);
    ctx.restore();

    // --- Badge at bottom (clipped to circle) ---
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.clip();
    drawBadge(ctx, cx, cy, outerR, team, SIZE);
    ctx.restore();
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

  function drawBadge(c, cx, cy, outerR, team, size) {
    const badgeLabel = team.code;
    const fontSize = Math.round(size * 0.085);
    c.font = `800 ${fontSize}px 'Inter', -apple-system, sans-serif`;

    const badgeW = size - OUTER_MARGIN * 2;
    const badgeH = BADGE_HEIGHT;
    const badgeX = OUTER_MARGIN;
    const badgeY = cy + outerR - badgeH * 0.55 - 80;

    // Badge shadow
    c.save();
    c.shadowColor = "rgba(0,0,0,0.35)";
    c.shadowBlur = 8;
    c.shadowOffsetY = 3;

    // Full-width banner background
    drawPill(c, badgeX, badgeY, badgeW, badgeH, BADGE_RADIUS);
    const bgColor = getBadgeBg(team.colors);
    c.fillStyle = bgColor;
    c.fill();
    c.restore();

    // Badge border
    drawPill(c, badgeX, badgeY, badgeW, badgeH, BADGE_RADIUS);
    c.strokeStyle = "#000000";
    c.lineWidth = 2;
    c.stroke();

    // Badge text — precisely centered
    c.fillStyle = getContrastText(bgColor);
    c.font = `800 ${fontSize}px 'Inter', -apple-system, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "alphabetic";
    c.letterSpacing = "2px";
    const metrics = c.measureText(badgeLabel);
    const textH = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const textY = badgeY + (badgeH + textH) / 2 - metrics.actualBoundingBoxDescent;
    c.fillText(badgeLabel, cx, textY);
    c.letterSpacing = "0px";
  }

  function drawPill(c, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h);
    c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
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
    const scale = size / SIZE;
    const margin = Math.round(OUTER_MARGIN * scale);
    const ringW = Math.max(Math.round(RING_WIDTH * scale), 6);
    const outerR = size / 2 - margin;
    const innerR = outerR - ringW;
    const avatarR = innerR - 1;

    c.clearRect(0, 0, size, size);

    // Outer glow
    c.save();
    c.beginPath();
    c.arc(cx, cy, outerR + 3, 0, Math.PI * 2);
    c.shadowColor = team.colors[0];
    c.shadowBlur = 10 * scale;
    c.fillStyle = "rgba(0,0,0,0)";
    c.fill();
    c.restore();

    // White outer stroke
    c.beginPath();
    c.arc(cx, cy, outerR + 1, 0, Math.PI * 2);
    c.strokeStyle = "#FFFFFF";
    c.lineWidth = Math.max(2, WHITE_STROKE * scale);
    c.stroke();

    // Color ring
    drawColorRing(c, cx, cy, outerR, innerR, team.colors);

    // Avatar
    c.save();
    c.beginPath();
    c.arc(cx, cy, avatarR, 0, Math.PI * 2);
    c.clip();
    const avatarSize = avatarR * 2;
    const offset = cx - avatarR;
    c.drawImage(img, offset, offset, avatarSize, avatarSize);
    c.restore();

    // Badge (clipped to circle)
    c.save();
    c.beginPath();
    c.arc(cx, cy, outerR, 0, Math.PI * 2);
    c.clip();

    const badgeLabel = team.code;
    const fontSize = Math.max(Math.round(size * 0.15), 12);
    const badgeH = Math.max(Math.round(BADGE_HEIGHT * scale), 20);
    const badgePillR = badgeH / 2;

    const badgeMargin = Math.round(OUTER_MARGIN * scale);
    const bw = size - badgeMargin * 2;
    const bx = badgeMargin;
    const by = cy + outerR - badgeH * 0.55 - (80 * scale);

    c.font = `800 ${fontSize}px 'Inter', -apple-system, sans-serif`;

    c.save();
    c.shadowColor = "rgba(0,0,0,0.3)";
    c.shadowBlur = 4;
    c.shadowOffsetY = 2;
    drawPill(c, bx, by, bw, badgeH, badgePillR);
    const bgColor = getBadgeBg(team.colors);
    c.fillStyle = bgColor;
    c.fill();
    c.restore();

    drawPill(c, bx, by, bw, badgeH, badgePillR);
    c.strokeStyle = "#000000";
    c.lineWidth = 1;
    c.stroke();

    c.fillStyle = getContrastText(bgColor);
    c.font = `800 ${fontSize}px 'Inter', -apple-system, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "alphabetic";
    const miniMetrics = c.measureText(badgeLabel);
    const miniTextH = miniMetrics.actualBoundingBoxAscent + miniMetrics.actualBoundingBoxDescent;
    const miniTextY = by + (badgeH + miniTextH) / 2 - miniMetrics.actualBoundingBoxDescent;
    c.fillText(badgeLabel, cx, miniTextY);
    c.restore();
  }

  loadExamples();
})();
