(function () {
  "use strict";

  const SIZE = 600;
  const RING_WIDTH = 40;
  const BADGE_HEIGHT = 72;
  const AVATAR_PADDING = 8;

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
    const outerR = SIZE / 2;
    const innerR = outerR - RING_WIDTH;

    ctx.clearRect(0, 0, SIZE, SIZE);

    // --- Draw color ring ---
    const colors = team.colors;
    const segmentAngle = (Math.PI * 2) / colors.length;

    colors.forEach((color, i) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, segmentAngle * i - Math.PI / 2, segmentAngle * (i + 1) - Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    });

    // --- Cut inner circle for avatar ---
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.clip();

    // Draw avatar image
    const avatarSize = innerR * 2;
    const avatarOffset = cx - innerR;
    ctx.drawImage(img, avatarOffset, avatarOffset, avatarSize, avatarSize);
    ctx.restore();

    // --- Draw badge at bottom ---
    drawBadge(cx, cy, outerR, team);
  }

  function drawBadge(cx, cy, outerR, team) {
    const badgeHeight = BADGE_HEIGHT;
    const badgePadding = 24;
    const badgeR = 8;

    // Measure text to center with equal padding
    const badgeLabel = `${team.flag} ${team.code}`;
    ctx.font = "bold 60px 'Inter', sans-serif";
    const textWidth = ctx.measureText(badgeLabel).width;
    const badgeWidth = textWidth + badgePadding * 2;
    const badgeX = cx - badgeWidth / 2;
    const badgeY = cy + outerR - badgeHeight - 16;

    // Badge background
    ctx.beginPath();
    ctx.moveTo(badgeX + badgeR, badgeY);
    ctx.lineTo(badgeX + badgeWidth - badgeR, badgeY);
    ctx.quadraticCurveTo(badgeX + badgeWidth, badgeY, badgeX + badgeWidth, badgeY + badgeR);
    ctx.lineTo(badgeX + badgeWidth, badgeY + badgeHeight - badgeR);
    ctx.quadraticCurveTo(badgeX + badgeWidth, badgeY + badgeHeight, badgeX + badgeWidth - badgeR, badgeY + badgeHeight);
    ctx.lineTo(badgeX + badgeR, badgeY + badgeHeight);
    ctx.quadraticCurveTo(badgeX, badgeY + badgeHeight, badgeX, badgeY + badgeHeight - badgeR);
    ctx.lineTo(badgeX, badgeY + badgeR);
    ctx.quadraticCurveTo(badgeX, badgeY, badgeX + badgeR, badgeY);
    ctx.closePath();

    // Use first team color as badge bg, ensure contrast
    const bgColor = getBadgeBg(team.colors);
    ctx.fillStyle = bgColor;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Badge text — precisely centered in badge
    ctx.fillStyle = getContrastText(bgColor);
    ctx.font = "bold 60px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const metrics = ctx.measureText(badgeLabel);
    const textH = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const textY = badgeY + (badgeHeight + textH) / 2 - metrics.actualBoundingBoxDescent;
    ctx.fillText(badgeLabel, cx, textY);
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
    const ringWidth = 14;
    const c = cvs.getContext("2d");
    const cx = size / 2;
    const cy = size / 2;
    const outerR = size / 2;
    const innerR = outerR - ringWidth;
    const colors = team.colors;
    const segmentAngle = (Math.PI * 2) / colors.length;

    colors.forEach((color, i) => {
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, outerR, segmentAngle * i - Math.PI / 2, segmentAngle * (i + 1) - Math.PI / 2);
      c.closePath();
      c.fillStyle = color;
      c.fill();
    });

    c.save();
    c.beginPath();
    c.arc(cx, cy, innerR, 0, Math.PI * 2);
    c.clip();
    const avatarSize = innerR * 2;
    const offset = cx - innerR;
    c.drawImage(img, offset, offset, avatarSize, avatarSize);
    c.restore();

    // Country code badge
    const miniBadgeLabel = `${team.flag} ${team.code}`;
    const badgeH = 44;
    const badgePad = 12;
    c.font = "bold 36px 'Inter', sans-serif";
    const tw = c.measureText(miniBadgeLabel).width;
    const bw = tw + badgePad * 2;
    const bx = cx - bw / 2;
    const by = size - badgeH - 2;
    const br = 4;
    c.beginPath();
    c.moveTo(bx + br, by);
    c.lineTo(bx + bw - br, by);
    c.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
    c.lineTo(bx + bw, by + badgeH - br);
    c.quadraticCurveTo(bx + bw, by + badgeH, bx + bw - br, by + badgeH);
    c.lineTo(bx + br, by + badgeH);
    c.quadraticCurveTo(bx, by + badgeH, bx, by + badgeH - br);
    c.lineTo(bx, by + br);
    c.quadraticCurveTo(bx, by, bx + br, by);
    c.closePath();
    const bgColor = getBadgeBg(team.colors);
    c.fillStyle = bgColor;
    c.fill();
    c.fillStyle = getContrastText(bgColor);
    c.textAlign = "center";
    c.textBaseline = "alphabetic";
    const miniMetrics = c.measureText(miniBadgeLabel);
    const miniTextH = miniMetrics.actualBoundingBoxAscent + miniMetrics.actualBoundingBoxDescent;
    const miniTextY = by + (badgeH + miniTextH) / 2 - miniMetrics.actualBoundingBoxDescent;
    c.fillText(miniBadgeLabel, cx, miniTextY);
  }

  loadExamples();
})();
