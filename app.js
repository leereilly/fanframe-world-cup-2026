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
  const fileInput = document.getElementById("file-input");
  const dropZone = document.getElementById("drop-zone");
  const uploadLink = document.getElementById("upload-link");
  const squareOpt = document.getElementById("opt-square");
  const textOpt = document.getElementById("opt-text");
  const colorsOpt = document.getElementById("opt-colors");

  // Holds a locally uploaded/dropped image; takes precedence over the text input.
  let uploadedImage = null;

  // Remember the last rendered avatar so option toggles can re-render instantly.
  let lastImg = null;
  let lastTeam = null;

  // Populate team dropdown
  TEAMS.forEach((team) => {
    const opt = document.createElement("option");
    opt.value = team.code;
    opt.textContent = `${team.name} ${team.flag} (${team.code})`;
    teamSelect.appendChild(opt);
  });

  // Allow URLs and usernames — no character restriction.
  // Typing overrides any previously uploaded/dropped image.
  usernameInput.addEventListener("input", () => {
    uploadedImage = null;
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
      // Prefer the API so we can surface a precise "user not found" message, but
      // fall back to GitHub's direct avatar endpoint when the API is unavailable
      // (the unauthenticated 60-req/hour rate limit returns 403) so the avatar
      // still loads instead of silently failing.
      const directUrl = `https://avatars.githubusercontent.com/${encodeURIComponent(source.user)}?size=512`;
      try {
        const apiRes = await fetch(`https://api.github.com/users/${encodeURIComponent(source.user)}`);
        if (apiRes.status === 404) throw new Error("User not found");
        if (apiRes.ok) {
          const userData = await apiRes.json();
          return loadImage(userData.avatar_url + "&s=512");
        }
        // Non-OK, non-404 (e.g. 403 rate limit) — fall through to the direct endpoint.
      } catch (err) {
        if (err.message === "User not found") throw err;
        // Network error reaching the API — fall through to the direct endpoint.
      }
      return loadImage(directUrl);
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

  // --- Local image upload + drag & drop (no server; everything stays in-browser) ---
  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that image file."));
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("That file isn't a valid image."));
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(file) {
    clearError();

    if (!file || !file.type.startsWith("image/")) {
      return showError("Please choose an image file (PNG, JPG, GIF, or WebP).");
    }

    let img;
    try {
      img = await loadImageFromFile(file);
    } catch (err) {
      return showError(err.message || "Could not read that image file.");
    }

    if (img.naturalWidth !== img.naturalHeight) {
      return showError(
        `Image must be square. That one is ${img.naturalWidth}×${img.naturalHeight} — crop it to a 1:1 ratio and try again.`
      );
    }

    uploadedImage = img;
    usernameInput.value = file.name.replace(/\.[^.\\/]+$/, "");

    // If a team is already selected, render right away.
    if (teamSelect.value) generateBtn.click();
  }

  uploadLink.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) handleFile(file);
    fileInput.value = ""; // allow re-selecting the same file
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
        e.preventDefault();
        dropZone.classList.add("drag-over");
      }
    });
  });

  ["dragleave", "dragend", "drop"].forEach((evt) => {
    dropZone.addEventListener(evt, () => dropZone.classList.remove("drag-over"));
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // Stop the browser from opening an image dropped anywhere outside the zone.
  ["dragover", "drop"].forEach((evt) => {
    window.addEventListener(evt, (e) => e.preventDefault());
  });

  generateBtn.addEventListener("click", async () => {
    const teamCode = teamSelect.value;

    clearError();

    if (!teamCode) return showError("Please select a team.");

    const team = TEAMS.find((t) => t.code === teamCode);
    if (!team) return showError("Team not found.");

    generateBtn.disabled = true;
    generateBtn.textContent = "Loading…";

    try {
      let img;
      if (uploadedImage) {
        img = uploadedImage;
      } else {
        const input = usernameInput.value.trim();
        if (!input) {
          showError("Please enter a username or profile URL, or drop an image.");
          return;
        }
        const source = detectAvatarSource(input);
        if (!source) {
          showError("Could not detect a profile from the input.");
          return;
        }
        img = await fetchAvatarImage(source);
      }
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

  function readOptions() {
    return {
      square: squareOpt.checked,
      showText: textOpt.checked,
      showColors: colorsOpt.checked,
    };
  }

  function drawAvatar(img, team) {
    lastImg = img;
    lastTeam = team;
    renderAvatar(ctx, img, team, SIZE, readOptions());
  }

  // Re-render live when options change (only after an avatar has been generated).
  [squareOpt, textOpt, colorsOpt].forEach((el) => {
    el.addEventListener("change", () => {
      if (lastImg && lastTeam) drawAvatar(lastImg, lastTeam);
    });
  });

  // Unified renderer: circular avatar + LinkedIn #OPENTOWORK-style color band + styled code.
  // The band hugs the lower-left perimeter and fades to transparent at both ends.
  function renderAvatar(c, img, team, size, opts) {
    const { square = false, showText = true, showColors = true } = opts || {};
    const cx = size / 2;
    const cy = size / 2;
    const colors = team.colors;

    c.clearRect(0, 0, size, size);

    const R = size / 2;
    const bandWidth = Math.max(size * 0.13, 8);
    const outerR = R;
    const innerR = R - bandWidth;

    // Band placement mirrors LinkedIn's #OPENTOWORK coverage: lower-left arc, ~165°.
    const D = Math.PI / 180;
    const startAngle = 38 * D;
    const endAngle = 203 * D;
    const fadeIn = 16 * D;
    const fadeOut = 13 * D;

    // Avatar fills the whole frame; the band overlays its edge.
    c.save();
    c.beginPath();
    if (square) {
      c.rect(0, 0, size, size);
    } else {
      c.arc(cx, cy, R, 0, Math.PI * 2);
    }
    c.closePath();
    c.clip();
    c.drawImage(img, 0, 0, size, size);

    const vignette = c.createRadialGradient(cx, cy, R * 0.62, cx, cy, R);
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

    // Country-color band along the lower-left arc, fading to transparent at the ends
    if (showColors) {
      if (square) {
        drawColorBandSquare(c, size, bandWidth, colors);
      } else {
        drawColorRing(c, cx, cy, outerR, innerR, colors, startAngle, endAngle, fadeIn, fadeOut);
      }
    }

    // Subtle hairline keeps the avatar defined on light backgrounds
    c.strokeStyle = "rgba(0,0,0,0.18)";
    c.lineWidth = Math.max(size * 0.004, 1);
    c.beginPath();
    if (square) {
      const inset = c.lineWidth / 2;
      c.rect(inset, inset, size - c.lineWidth, size - c.lineWidth);
    } else {
      c.arc(cx, cy, R - c.lineWidth / 2, 0, Math.PI * 2);
    }
    c.stroke();

    if (showText) {
      drawCountryCode(c, cx, cy, R, team, size);
    }
  }

  // Partial color band that hugs the lower-left perimeter and fades to transparent at
  // both ends — modeled on LinkedIn's #OPENTOWORK ribbon. Team colors split into equal
  // arcs across the solid core so the flag identity is preserved.
  function drawColorRing(c, cx, cy, outerR, innerR, colors, startAngle, endAngle, fadeIn, fadeOut) {
    const count = colors.length;
    const span = endAngle - startAngle;
    const steps = Math.max(72, Math.ceil(span / (Math.PI / 180)));
    const overlap = (span / steps) * 0.6;

    for (let i = 0; i < steps; i++) {
      const a0 = startAngle + span * (i / steps);
      const a1 = startAngle + span * ((i + 1) / steps) + overlap;
      const mid = (a0 + a1) / 2;

      const t = (mid - startAngle) / span;
      const ci = Math.min(count - 1, Math.max(0, Math.floor(t * count)));

      const dStart = mid - startAngle;
      const dEnd = endAngle - mid;
      let alpha = 1;
      if (dStart < fadeIn) alpha = Math.min(alpha, dStart / fadeIn);
      if (dEnd < fadeOut) alpha = Math.min(alpha, dEnd / fadeOut);
      alpha = Math.max(0, Math.min(1, alpha));
      if (alpha <= 0.01) continue;

      c.globalAlpha = alpha;
      c.beginPath();
      c.arc(cx, cy, outerR, a0, a1);
      c.arc(cx, cy, innerR, a1, a0, true);
      c.closePath();
      c.fillStyle = colors[ci];
      c.fill();

      // Glossy sheen: shade the inner edge (separates band from photo) and lift the outer half
      const gloss = c.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
      gloss.addColorStop(0, "rgba(0,0,0,0.22)");
      gloss.addColorStop(0.4, "rgba(255,255,255,0.04)");
      gloss.addColorStop(0.78, "rgba(255,255,255,0.16)");
      gloss.addColorStop(1, "rgba(255,255,255,0.03)");
      c.fillStyle = gloss;
      c.fill();
    }
    c.globalAlpha = 1;

    // Subtle dividers between color segments, only within the solid core
    if (count > 1) {
      c.strokeStyle = "rgba(255,255,255,0.25)";
      c.lineWidth = Math.max((outerR - innerR) * 0.03, 1);
      for (let i = 1; i < count; i++) {
        const angle = startAngle + span * (i / count);
        if (angle - startAngle > fadeIn && endAngle - angle > fadeOut) {
          c.beginPath();
          c.moveTo(cx + innerR * Math.cos(angle), cy + innerR * Math.sin(angle));
          c.lineTo(cx + outerR * Math.cos(angle), cy + outerR * Math.sin(angle));
          c.stroke();
        }
      }
    }
  }

  // Square sibling of drawColorRing: a band that hugs the square's lower-left perimeter
  // (right edge -> bottom-right corner -> bottom -> bottom-left corner -> left edge) and
  // fades to transparent at both ends, mirroring the circular band's coverage and sheen.
  function drawColorBandSquare(c, size, bandWidth, colors) {
    const R = size / 2;
    const bw = bandWidth;

    // Endpoints mirror the circular sweep (38deg start, 203deg end) projected onto the edges.
    const startY = R + 0.782 * R;
    const endY = R - 0.424 * R;

    const outer = [
      [size, startY],
      [size, size],
      [0, size],
      [0, endY],
    ];
    const inner = [
      [size - bw, startY],
      [size - bw, size - bw],
      [bw, size - bw],
      [bw, endY],
    ];

    const cum = [0];
    for (let k = 0; k < outer.length - 1; k++) {
      cum.push(cum[k] + Math.hypot(outer[k + 1][0] - outer[k][0], outer[k + 1][1] - outer[k][1]));
    }
    const total = cum[cum.length - 1];

    const count = colors.length;
    const fadeInLen = total * (16 / 165);
    const fadeOutLen = total * (13 / 165);

    function pointAt(poly, s) {
      let seg = 0;
      while (seg < poly.length - 2 && s > cum[seg + 1]) seg++;
      const segLen = cum[seg + 1] - cum[seg];
      const t = segLen ? (s - cum[seg]) / segLen : 0;
      return [
        poly[seg][0] + t * (poly[seg + 1][0] - poly[seg][0]),
        poly[seg][1] + t * (poly[seg + 1][1] - poly[seg][1]),
      ];
    }

    // Uniform samples plus exact corner break-points so no quad spans a corner.
    const steps = 200;
    const marks = new Set([0, total]);
    for (let k = 1; k < cum.length - 1; k++) marks.add(cum[k]);
    for (let i = 1; i < steps; i++) marks.add((total * i) / steps);
    const stops = Array.from(marks).sort((a, b) => a - b);
    const overlap = (total / steps) * 0.5;

    for (let i = 0; i < stops.length - 1; i++) {
      const sA = stops[i];
      const mid = (sA + stops[i + 1]) / 2;

      let seg = 0;
      while (seg < cum.length - 2 && mid > cum[seg + 1]) seg++;
      const sB = Math.min(stops[i + 1] + overlap, cum[seg + 1]);

      let alpha = 1;
      if (mid < fadeInLen) alpha = Math.min(alpha, mid / fadeInLen);
      if (total - mid < fadeOutLen) alpha = Math.min(alpha, (total - mid) / fadeOutLen);
      if (alpha <= 0.01) continue;

      const oA = pointAt(outer, sA);
      const oB = pointAt(outer, sB);
      const iB = pointAt(inner, sB);
      const iA = pointAt(inner, sA);
      const ci = Math.min(count - 1, Math.max(0, Math.floor((mid / total) * count)));

      c.globalAlpha = Math.max(0, Math.min(1, alpha));
      c.beginPath();
      c.moveTo(oA[0], oA[1]);
      c.lineTo(oB[0], oB[1]);
      c.lineTo(iB[0], iB[1]);
      c.lineTo(iA[0], iA[1]);
      c.closePath();
      c.fillStyle = colors[ci];
      c.fill();

      // Glossy sheen: dark inner edge, lifted outer edge — perpendicular across the band.
      const gloss = c.createLinearGradient(
        (iA[0] + iB[0]) / 2, (iA[1] + iB[1]) / 2,
        (oA[0] + oB[0]) / 2, (oA[1] + oB[1]) / 2
      );
      gloss.addColorStop(0, "rgba(0,0,0,0.22)");
      gloss.addColorStop(0.4, "rgba(255,255,255,0.04)");
      gloss.addColorStop(0.78, "rgba(255,255,255,0.16)");
      gloss.addColorStop(1, "rgba(255,255,255,0.03)");
      c.fillStyle = gloss;
      c.fill();
    }
    c.globalAlpha = 1;

    // Subtle dividers between color segments, only within the solid (non-faded) core.
    if (count > 1) {
      c.strokeStyle = "rgba(255,255,255,0.25)";
      c.lineWidth = Math.max(bw * 0.03, 1);
      for (let i = 1; i < count; i++) {
        const s = (total * i) / count;
        if (s > fadeInLen && total - s > fadeOutLen) {
          const o = pointAt(outer, s);
          const inn = pointAt(inner, s);
          c.beginPath();
          c.moveTo(inn[0], inn[1]);
          c.lineTo(o[0], o[1]);
          c.stroke();
        }
      }
    }
  }

  // Country code styled from the flag: tricolor flags get one color per letter,
  // others use the most vivid flag color. Large size + adaptive outline keep it readable.
  function drawCountryCode(c, cx, cy, baseR, team, size) {
    const colors = team.colors;
    const code = team.code;
    const fontSize = Math.max(Math.round(baseR * 0.46), 16);
    const textY = cy + baseR * 0.5;

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
      c.shadowColor = "rgba(0,0,0,0.7)";
      c.shadowBlur = Math.max(size * 0.03, 5);
      c.shadowOffsetY = Math.max(size * 0.006, 1);
      c.fillStyle = fill;
      c.fillText(letter, x, textY);
      c.restore();

      // Outline — light on dark fills, dark on light fills
      c.lineJoin = "round";
      c.lineWidth = Math.max(fontSize * 0.18, 3);
      c.strokeStyle = luminance(fill) > 0.5 ? "rgba(0,0,0,0.92)" : "rgba(255,255,255,0.95)";
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

  // Synthesize a referee's whistle (two short trilled toots) via Web Audio — no asset needed.
  let whistleCtx = null;
  function blowWhistle() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      whistleCtx = whistleCtx || new AC();
      if (whistleCtx.state === "suspended") whistleCtx.resume();

      const now = whistleCtx.currentTime;
      const master = whistleCtx.createGain();
      master.connect(whistleCtx.destination);

      const osc = whistleCtx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 3300;

      // The "pea" rattle — a fast frequency wobble.
      const lfo = whistleCtx.createOscillator();
      lfo.frequency.value = 28;
      const lfoGain = whistleCtx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain).connect(osc.frequency);
      osc.connect(master);

      const g = master.gain;
      g.setValueAtTime(0.0001, now);
      g.exponentialRampToValueAtTime(0.22, now + 0.02);
      g.exponentialRampToValueAtTime(0.1, now + 0.18);
      g.exponentialRampToValueAtTime(0.22, now + 0.23);
      g.exponentialRampToValueAtTime(0.0001, now + 0.5);

      osc.start(now);
      lfo.start(now);
      osc.stop(now + 0.52);
      lfo.stop(now + 0.52);
    } catch {
      // Audio is a nice-to-have; never let it block the error message.
    }
  }

  function showError(msg) {
    clearError();
    const el = document.createElement("div");
    el.className = "error-msg";
    el.setAttribute("role", "alert");

    const heading = document.createElement("p");
    heading.className = "var-heading";
    heading.textContent = "VAR CHECK COMPLETE";

    const decision = document.createElement("p");
    decision.className = "var-decision";
    const label = document.createElement("span");
    label.className = "var-decision-label";
    label.textContent = "DECISION: ";
    decision.appendChild(label);
    decision.appendChild(document.createTextNode(msg));

    el.appendChild(heading);
    el.appendChild(decision);
    document.querySelector(".controls").appendChild(el);
    blowWhistle();
  }

  function clearError() {
    const existing = document.querySelector(".error-msg");
    if (existing) existing.remove();
  }

  // --- Example avatars from GitHub public events ---
  // A small curated fallback so the grid still renders when the public events
  // API is unavailable (the unauthenticated rate limit returns 403).
  const FALLBACK_EXAMPLE_USERS = [
    "octocat", "defunkt", "mojombo", "pjhyett", "torvalds",
    "gaearon", "holman", "dannygreg", "leereilly",
  ];

  function addExampleCard(grid, avatarUrl) {
    return loadImage(avatarUrl).then((img) => {
      if (isDefaultAvatar(img)) return;
      const team = TEAMS[Math.floor(Math.random() * TEAMS.length)];

      const card = document.createElement("div");
      card.className = "example-card";

      const miniCanvas = document.createElement("canvas");
      miniCanvas.width = 200;
      miniCanvas.height = 200;
      card.appendChild(miniCanvas);

      grid.appendChild(card);
      drawMiniAvatar(miniCanvas, img, team);
    }).catch(() => {
      // skip failed loads
    });
  }

  async function loadExamples() {
    const grid = document.getElementById("examples-grid");

    // Collect candidate avatar URLs from the public events feed when available.
    let avatarUrls = [];
    try {
      const res = await fetch("https://api.github.com/events");
      if (res.ok) {
        const events = await res.json();
        const seen = new Set();
        for (const event of events) {
          const login = event.actor?.login;
          const avatar = event.actor?.avatar_url;
          if (login && avatar && !seen.has(login)) {
            seen.add(login);
            avatarUrls.push(avatar + "&s=200");
          }
        }
      }
    } catch {
      // network error — fall back below
    }

    // Fall back to a curated list so the section never renders empty.
    if (avatarUrls.length === 0) {
      avatarUrls = FALLBACK_EXAMPLE_USERS.map(
        (login) => `https://avatars.githubusercontent.com/${login}?size=200`
      );
    }

    for (const avatarUrl of avatarUrls) {
      await addExampleCard(grid, avatarUrl);
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

  // Render PR promo avatars with flag rings. Load straight from GitHub's avatar
  // endpoint (no API call) so these aren't subject to the unauthenticated rate limit.
  document.querySelectorAll(".pr-promo .pr-avatar[data-user]").forEach(async (cvs) => {
    const user = cvs.dataset.user;
    const teamCode = cvs.dataset.team;
    const team = TEAMS.find(t => t.code === teamCode);
    if (!team) return;
    try {
      const img = await loadImage(`https://avatars.githubusercontent.com/${user}?size=200`);
      drawMiniAvatar(cvs, img, team);
    } catch { /* skip */ }
  });
})();
