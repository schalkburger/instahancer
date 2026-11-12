// ==UserScript==
// @name                Instahancer
// @namespace           https://github.com/schalkburger/instahancer
// @version             1.14.12
// @description         Instagram Reels Enhancements: HTML5 controller, volume control, RAM saver, and more.
// @author              Schalk Burger <schalkb@gmail.com>
// @match               https://*.instagram.com/*
// @exclude             https://*.instagram.com/stories/*/*/
// @require             https://openuserjs.org/src/libs/sizzle/GM_config.js
// @grant               GM_info
// @grant               GM_setValue
// @grant               GM_getValue
// @grant               GM_addStyle
// @grant               GM_deleteValue
// @grant               GM_registerMenuCommand
// @grant               GM_unregisterMenuCommand
// @grant               GM_addValueChangeListener
// @icon                https://www.google.com/s2/favicons?domain=www.instagram.com&sz=32
// @license             MIT
// @run-at              document-idle
// ==/UserScript==

(function () {
  "use strict";

  const version = GM_info.script.version;
  const name = GM_info.script.name;
  console.log(`[IH] ${name} ${version} initializing`);

  // ========== HARDCODED SETTINGS ==========
  const SETTINGS = {
    DISABLE_VIDEO_LOOPING: true,
    HTML5_VIDEO_CONTROL: true,
    MODIFY_VIDEO_VOLUME: true,
    SCROLL_BUTTON: true,
    PREVENT_AUTOPLAY: true,
  };

  // ========== CONFIG MENU SETUP ==========
  const configDesc = {
    videoVolume: {
      label: "Default Video Volume (0.0 to 1.0)",
      type: "float",
      default: 0.2,
    },
    preventAutoplay: {
      label: "Prevent Video Autoplay",
      type: "checkbox",
      default: true,
    },
  };

  const config = new GM_config({
    id: "Instahancer_Config",
    title: `Instahancer Settings ${version}`,
    fields: configDesc,
    frameStyle:
      "border: 1px solid #363636; border-radius: 12px; background: #212121;" +
      " box-shadow: 0 12px 32px rgba(0,0,0,.6); width: min(375px, 92vw);" +
      " height: auto; max-height: 90vh; min-height: 215px; overflow: auto; padding: 0;" +
      " position: fixed; z-index: 9999; display: none; opacity: 0;",
    css: `
    #Instahancer_Config {
      background: #181c20;
      color: #f5f5f5;
      padding: 20px;
      font-family: system-ui, sans-serif;
    }
    #Instahancer_Config_header {
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 16px;
      text-align: left;
    }
    #Instahancer_Config .config_var {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    #Instahancer_Config .field_label {
      font-size: 13px;
      font-weight: 400;
      color: #f5f5f5;
    }
    #Instahancer_Config input[type="text"] {
      background: #1a1a1a;
      border: 1px solid #363636;
      border-radius: 6px;
      color: #f5f5f5;
      padding: 6px 8px;
      width: 50px;
    }
    #Instahancer_Config input[type="checkbox"] {
      accent-color: #1a1a1a;
      width: 16px;
      height: 16px;
    }
    #Instahancer_Config_buttons_holder {
      display: flex;
      justify-content: start;
      align-items: center;
      gap: 8px;
      margin-top: 18px;
    }
    #Instahancer_Config .saveclose_buttons {
      background: #1a1a1a;
      border: 1px solid #363636;
      border-radius: 8px;
      color: #f5f5f5;
      font-size: 13px;
      padding: 8px 16px;
      margin: 0;
      cursor: pointer;
    }
    #Instahancer_Config .saveclose_buttons:hover {
      background: #262626;
    }
    #Instahancer_Config .reset {
      color: #a8a8a8;
      font-size: 11px;
      margin-left: 4px;
    }
    #Instahancer_Config .config_header {
      text-align: left;
      font-size: 1.2rem;
      margin-bottom: 1rem;
    }
  `,
    events: {
      // Library builds handler as "on" + capitalized key
      Save: () => config.close(),
    },
  });

  GM_registerMenuCommand("Instahancer Settings", () => {
    config.open();
  });

  // ========== STATE MANAGEMENT ==========
  const state = {
    currentPage: location.pathname,
    processedVideos: new WeakSet(),
  };

  // Autoplay gate: play() allowed only shortly after a real user gesture.
  let lastUserGesture = 0;
  ["pointerdown", "keydown", "touchstart"].forEach((type) => {
    document.addEventListener(
      type,
      () => {
        lastUserGesture = Date.now();
      },
      true
    );
  });

  // ========== UTILITIES ==========
  function logger(...args) {
    console.log("[IH]", ...args);
  }

  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // ========== INLINE STYLES ==========
  const styles = `
    [aria-label="Video player"] {
      display: none;
    }

    /* Force HTML5 video controls top layer, let pointer through IG click masks */
    video::-webkit-media-controls {
      z-index: 2147483647 !important;
    }

    div[role="button"][aria-label="Control"],
    div[aria-label="Control"] {
      pointer-events: none !important;
    }

    [role="main"] {
      padding: 0;
    }
    
    [role="main"] > div {
        max-width: 85vw !important;        
        margin: 0 auto;
    }

    [role="main"] > div > div {
        --x-maxWidth: 70vw;
        max-width: var(--x-maxWidth) !important;
    }
    
    // [role="main"] > div > div:nth-child(1) > div > div:nth-child(2) {
    //   max-height: 96vh;
    // }

    video[controlslist="nodownload"] {
      max-height: 96vh;
    }
  `;

  GM_addStyle(styles);
  logger("Styles loaded");

  // ========== PROTOTYPE OVERRIDES FOR INSTAGRAM RECT STATE ==========
  const nativeMutedDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "muted");
  const nativeVolumeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume");

  Object.defineProperty(HTMLMediaElement.prototype, "muted", {
    get: function () {
      return nativeMutedDescriptor.get.call(this);
    },
    set: function (val) {
      if (SETTINGS.MODIFY_VIDEO_VOLUME) {
        nativeMutedDescriptor.set.call(this, false);
      } else {
        nativeMutedDescriptor.set.call(this, val);
      }
    },
    configurable: true,
  });

  Object.defineProperty(HTMLMediaElement.prototype, "volume", {
    get: function () {
      return nativeVolumeDescriptor.get.call(this);
    },
    set: function (val) {
      if (SETTINGS.MODIFY_VIDEO_VOLUME) {
        const targetVolume = parseFloat(config.get("videoVolume")) || 0.2;
        nativeVolumeDescriptor.set.call(this, targetVolume);
      } else {
        nativeVolumeDescriptor.set.call(this, val);
      }
    },
    configurable: true,
  });

  // ========== VIDEO PLAYBACK CONTROL ==========
  function setupVideoEventListeners(video) {
    if (state.processedVideos.has(video)) return;
    state.processedVideos.add(video);

    if (SETTINGS.HTML5_VIDEO_CONTROL) {
      video.controls = true;
      video.controlsList.add("nodownload");
      video.style.zIndex = "999";
      video.style.position = "relative";
      logger("HTML5 video controls enabled");
    }

    if (SETTINGS.MODIFY_VIDEO_VOLUME) {
      const targetVolume = parseFloat(config.get("videoVolume")) || 0.2;
      nativeVolumeDescriptor.set.call(video, targetVolume);
      nativeMutedDescriptor.set.call(video, false);

      video.addEventListener("volumechange", (e) => {
        e.stopPropagation();
      }, true);
    }

    if (config.get("preventAutoplay")) {
      video.removeAttribute("autoplay");

      const handleAutoPlayBlock = (e) => {
        // Allow play() triggered by an actual user gesture (click, key, touch).
        if (Date.now() - lastUserGesture < 500) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        video.pause();
        logger("Auto-play prevented.");
      };

      video.addEventListener("play", handleAutoPlayBlock, true);
      video.addEventListener("playing", handleAutoPlayBlock, true);
    }

    if (SETTINGS.DISABLE_VIDEO_LOOPING) {
      video.addEventListener("ended", () => {
        if (!video.dataset.loopDisabled) {
          video.dataset.loopDisabled = "true";
          video.pause();
          logger("Video loop disabled");
        }
      });
    }
  }

  // ========== VIDEO OBSERVER ==========
  function observeVideos() {
    const videos = document.querySelectorAll("video");
    videos.forEach(setupVideoEventListeners);
  }

  const debouncedObserveVideos = debounce(observeVideos, 150);

  const videoObserver = new MutationObserver(() => {
    debouncedObserveVideos();
  });

  videoObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  observeVideos();

  // ========== REELS RAM SAVER ==========
  function cleanupOffscreenReels() {
    if (!location.pathname.startsWith("/reels/")) return;

    const videos = document.querySelectorAll("video");
    const DISTANCE_THRESHOLD = 1000;

    videos.forEach((video) => {
      const rect = video.getBoundingClientRect();

      if (rect.bottom < -DISTANCE_THRESHOLD) {
        if (video.src || video.querySelector("source")) {
          video.pause();
          video.removeAttribute("src");
          video.querySelectorAll("source").forEach((source) => source.remove());
          video.load();
          logger("Cleaned up off-screen Reel from memory");
        }
      }
    });
  }

  let reelsCleanupInterval = null;

  const checkReelsCleanup = debounce(() => {
    if (location.pathname.startsWith("/reels/") && !reelsCleanupInterval) {
      reelsCleanupInterval = setInterval(cleanupOffscreenReels, 2000);
      logger("Started Reels RAM cleanup");
    } else if (
      !location.pathname.startsWith("/reels/") &&
      reelsCleanupInterval
    ) {
      clearInterval(reelsCleanupInterval);
      reelsCleanupInterval = null;
      logger("Stopped Reels RAM cleanup");
    }
  }, 200);

  const reelsCleanupObserver = new MutationObserver(() => {
    checkReelsCleanup();
  });

  reelsCleanupObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  if (location.pathname.startsWith("/reels/")) {
    reelsCleanupInterval = setInterval(cleanupOffscreenReels, 2000);
  }

  // ========== REEL CLICK HANDLER ==========
  function setupReelClickInterception() {
    document.removeEventListener("click", handleReelClick, true);
    document.addEventListener("click", handleReelClick, true);
  }

  function interceptClick(e, video) {
    if (!video) return;

    // Block IG navigation
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
    logger("Reel click intercepted: play/pause toggled");
  }

  function videoFromPoint(x, y) {
    const videos = document.querySelectorAll("video");
    for (const video of videos) {
      const rect = video.getBoundingClientRect();
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      ) {
        return video;
      }
    }
    return null;
  }

  function isPassThrough(target, video) {
    const el = target.closest('[role="button"], [aria-label], time, a[href]');
    if (!el || el === video) return false;
    if (el.tagName === "TIME") return true;

    const label = (el.getAttribute("aria-label") || "").toLowerCase();
    if (label) return !label.includes("video");

    const href = el.getAttribute("href");
    if (href) {
      // Media wrapper (/reel/<code>, /p/<code>) = video surface.
      // Anything else (profile, comments, external) navigates normally.
      return !/^\/(?:reels?|p)\/[A-Za-z0-9_-]{7,}\/?$/.test(href);
    }
    return false;
  }

  function handleReelClick(e) {
    const target = e.target;

    // Modals (Share, Comments, ...) float above the video; never intercept
    // clicks inside them even when the video rect contains the click point.
    if (target.closest('[role="dialog"], [aria-modal="true"]')) return;

    // Button overlay path (/reels/ page).
    const interactable =
      target.closest('[data-interactable="|click|"]') ||
      target.closest('[role="button"]');
    if (interactable) {
      const buttonWithLabel =
        interactable.getAttribute("role") === "button"
          ? interactable
          : interactable.querySelector('[role="button"]');

      const ariaLabel = buttonWithLabel?.getAttribute("aria-label") || "";
      if (ariaLabel.toLowerCase().startsWith("video")) {
        const reelContainer =
          interactable.closest(".wbloks_1") || interactable;
        return interceptClick(
          e,
          reelContainer.querySelector("video") || document.querySelector("video")
        );
      }
    }

    // Feed path: click landed on a video surface.
    const video =
      target.closest("video") || videoFromPoint(e.clientX, e.clientY);
    if (!video) return;
    if (isPassThrough(target, video)) return;

    interceptClick(e, video);
  }

  function checkPageAndSetupReels() {
    state.currentPage = location.pathname;
    setupReelClickInterception();
  }

  window.addEventListener("popstate", checkPageAndSetupReels);

  const debouncedCheckPage = debounce(checkPageAndSetupReels, 150);
  const navigationObserver = new MutationObserver(() => {
    if (location.pathname !== state.currentPage) {
      debouncedCheckPage();
    }
  });

  navigationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  if (SETTINGS.SCROLL_BUTTON) {
    checkPageAndSetupReels();
  }


  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  // ---------- Shortcode conversion ----------

  function idToShortcode(idStr) {
    try {
      let id = BigInt(idStr);
      if (id <= 0n) return null;
      let shortcode = '';
      while (id > 0n) {
        shortcode = ALPHABET[Number(id % 64n)] + shortcode;
        id = id / 64n;
      }
      return shortcode;
    } catch (e) {
      return null;
    }
  }

  // Sanity check: known-good pair from the likes page.
  (function selfTest() {
    if (idToShortcode('4012431098281424326') !== 'DevBNM6y3XG') {
      console.warn('[Likes Helper] idToShortcode self-test FAILED');
    }
  })();

  // ---------- ig_cache_key decoding ----------
  //
  // Decoded keys can appear as:
  //   "<mediaId>"                         -> standard
  //   "<mediaId>_<userId>"                -> underscore separator
  //   "<mediaId><userId>"                 -> concatenated digits (reels!)
  //   base64 of any of the above
  //
  // Instagram shortcodes are exactly 11 chars. We use that as ground
  // truth: try the whole token, then progressively shorter leading
  // prefixes (17..20 digits) until idToShortcode() yields 11 chars.

  function mediaIdFromBlob(digits) {
    // Fast path: whole token already yields an 11-char shortcode.
    const direct = idToShortcode(digits);
    if (direct && direct.length === 11) return digits;

    // Slow path: try leading prefixes of plausible media-ID lengths.
    const max = Math.min(digits.length, 20);
    for (let len = 17; len <= max; len++) {
      const candidate = digits.substring(0, len);
      const sc = idToShortcode(candidate);
      if (sc && sc.length === 11) return candidate;
    }
    return null;
  }

  function decodeCacheKey(cacheKey) {
    try {
      let raw = decodeURIComponent(cacheKey).split('.')[0];
      if (!/^\d+$/.test(raw)) raw = atob(raw);

      // Try underscore-separated parts first.
      const parts = raw.split('_');
      for (const part of parts) {
        if (!/^\d{10,}$/.test(part)) continue;
        const id = mediaIdFromBlob(part);
        if (id) return id;
      }

      // Try the whole concatenated blob (no separator).
      if (/^\d{10,}$/.test(raw)) {
        const id = mediaIdFromBlob(raw);
        if (id) return id;
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  // ---------- React fiber fallback ----------

  function extractUrlFromFiber(node) {
    let curr = node;
    let depth = 0;
    while (curr && depth < 15) {
      for (const key of Object.keys(curr)) {
        if (key.startsWith('__reactFiber$') || key.startsWith('__reactProps$')) {
          const found = searchFiberProps(curr[key]);
          if (found) return found;
        }
      }
      curr = curr.parentElement;
      depth++;
    }
    return null;
  }

  function searchFiberProps(node, depth = 0) {
    if (!node || depth > 6) return null;
    const props = node.memoizedProps || node.pendingProps;
    if (props) {
      if (props.href && (props.href.includes('/p/') || props.href.includes('/reel/'))) {
        return props.href.startsWith('http')
          ? props.href
          : `https://www.instagram.com${props.href}`;
      }
      const media = props.media || props.item || props.data || props.post;
      if (media) {
        if (media.code) return `https://www.instagram.com/p/${media.code}/`;
        if (media.shortcode) return `https://www.instagram.com/p/${media.shortcode}/`;
        if (media.pk) {
          const sc = idToShortcode(media.pk.toString().split('_')[0]);
          if (sc) return `https://www.instagram.com/p/${sc}/`;
        }
      }
    }
    let child = node.child;
    while (child) {
      const res = searchFiberProps(child, depth + 1);
      if (res) return res;
      child = child.sibling;
    }
    return null;
  }

  // ---------- URL resolution ----------

  function getPostUrlFromImg(img) {
    if (!img || !img.src) return null;

    // PRIMARY: decode ig_cache_key -> media ID -> shortcode.
    const m = img.src.match(/ig_cache_key=([^&.]+)/);
    if (m) {
      const idStr = decodeCacheKey(m[1]);
      if (idStr) {
        const shortcode = idToShortcode(idStr);
        if (shortcode) {
          return `https://www.instagram.com/p/${shortcode}/`;
        }
      }
    }

    // FALLBACK: React fiber — accept only well-formed 11-char shortcodes.
    const fiberUrl = extractUrlFromFiber(img);
    if (fiberUrl && /\/(p|reel)\/[A-Za-z0-9_-]{11}\/?$/.test(fiberUrl)) {
      return fiberUrl;
    }

    return null;
  }

  // ---------- Page / DOM plumbing ----------

  function isLikesPage() {
    return (
      window.location.href.includes('/your_activity/') ||
      window.location.href.includes('/saved/')
    );
  }

  // The grid cell is the nearest ancestor of the button whose inline
  // style declares an aspect-ratio — it wraps both the image and the
  // reel play-icon overlay, so the anchor covers the whole tile.
  function findCell(btn) {
    let el = btn;
    for (let i = 0; i < 8 && el; i++) {
      const s = (el.getAttribute && el.getAttribute('style')) || '';
      if (s.includes('aspect-ratio')) return el;
      el = el.parentElement;
    }
    return btn.parentElement;
  }

  // Force pointer-events through the chain so the anchor wins hit-tests,
  // even when Instagram sets pointer-events: none on the button to route
  // clicks through JS.
  function enablePointerEvents(btn, stopAt) {
    btn.style.pointerEvents = 'auto';
    let p = btn.parentElement;
    for (let i = 0; i < 6 && p && p !== stopAt; i++) {
      if (p.style && p.style.pointerEvents === 'none') {
        p.style.pointerEvents = 'auto';
      }
      p = p.parentElement;
    }
  }

  function processThumbnails() {
    if (!isLikesPage()) return;

    document.querySelectorAll('[role="button"]').forEach(btn => {
      const img = btn.querySelector('img[src*="ig_cache_key="]');
      if (!img) return;

      // Re-process recycled DOM nodes when their image src changes.
      if (btn.dataset.likesHelperProcessed === img.src) return;

      const url = getPostUrlFromImg(img);
      if (!url) return;

      btn.dataset.likesHelperProcessed = img.src;

      // If a valid <a> already wraps this tile, just fix its href.
      const outerA = btn.closest('a[href*="/p/"], a[href*="/reel/"]');
      if (outerA) {
        outerA.href = url;
        outerA.target = '_blank';
        outerA.rel = 'noopener noreferrer';
        enablePointerEvents(btn, outerA);
        return;
      }

      // Otherwise wrap the whole cell (not just the button) so the
      // reel play-icon overlay is also covered by the anchor.
      const cell = findCell(btn);
      if (!cell || !cell.parentElement) return;

      // Remove any prior wrapper from an earlier run (idempotent).
      const prevWrapper = cell.parentElement.closest('a[data-likes-helper="true"]');
      if (prevWrapper) prevWrapper.replaceWith(cell);

      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.display = 'contents';   // preserve layout
      a.dataset.likesHelper = 'true';

      cell.parentElement.insertBefore(a, cell);
      a.appendChild(cell);

      enablePointerEvents(btn, a);
    });
  }

  const observer = new MutationObserver(() => processThumbnails());
  observer.observe(document.body, { childList: true, subtree: true });

  setInterval(processThumbnails, 1000);
  processThumbnails();

  logger("Script initialization complete");
})();