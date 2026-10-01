// ==UserScript==
// @name                Instahancer
// @namespace           https://github.com/schalkburger/instahancer
// @version             1.12.8
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
    title: "Instahancer Settings",
    fields: configDesc,
  });

  GM_registerMenuCommand("Instahancer Settings", () => {
    config.open();
  });

  // ========== STATE MANAGEMENT ==========
  const state = {
    currentPage: location.pathname,
    processedVideos: new WeakSet(),
  };

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
        if (!video.dataset.autoplayPrevented) {
          e.preventDefault();
          e.stopImmediatePropagation();

          video.pause();
          video.dataset.autoplayPrevented = "true";

          logger("Initial auto-play prevented.");
          video.removeEventListener("play", handleAutoPlayBlock, true);
          video.removeEventListener("playing", handleAutoPlayBlock, true);
        }
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

  function handleReelClick(e) {
    const interactable =
      e.target.closest('[data-interactable="|click|"]') ||
      e.target.closest('[role="button"]');
    if (!interactable) return;

    const buttonWithLabel =
      interactable.getAttribute("role") === "button"
        ? interactable
        : interactable.querySelector('[role="button"]');

    const ariaLabel = buttonWithLabel?.getAttribute("aria-label") || "";
    const isReel = ariaLabel.toLowerCase().startsWith("video");

    if (!isReel) return;

    // Block IG navigation
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const reelContainer = interactable.closest(".wbloks_1") || interactable;
    const video =
      reelContainer.querySelector("video") || document.querySelector("video");

    if (video) {
      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
      logger("Reel click intercepted: play/pause toggled");
    }
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

  logger("Script initialization complete");
})();