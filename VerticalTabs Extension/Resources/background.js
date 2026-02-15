// Background service worker
const faviconCache = new Map(); // origin -> data URL
const faviconPendingFetches = new Map(); // origin -> Promise (deduplicates in-flight fetches)

// --- Debounced broadcast ---
let broadcastTimer = null;
const DEBOUNCE_MS = 100;

function scheduleBroadcast() {
  if (broadcastTimer) clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    updateAllSidebars();
  }, DEBOUNCE_MS);
}

// --- Helpers ---
function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

// Fetch favicon from Google S2 service and return as data URL
async function fetchGoogleFavicon(hostname) {
  try {
    const response = await fetch(`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`);
    if (!response.ok) return null;
    const blob = await response.blob();
    // Google S2 returns a default globe icon for unknown domains — check size
    // A 1x1 or very small blob likely means "no favicon found"
    if (blob.size < 100) return null;
    return await blobToDataUrl(blob);
  } catch (e) {
    return null;
  }
}

// Fetch any URL as a data URL
async function fetchUrlAsDataUrl(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (blob.size < 10) return null;
    return await blobToDataUrl(blob);
  } catch (e) {
    return null;
  }
}

// Resolve favicon for an origin — tries multiple sources, caches result
async function resolveOriginFavicon(origin) {
  // Already resolved
  if (faviconCache.has(origin)) {
    const cached = faviconCache.get(origin);
    if (cached && cached !== 'pending') return;
  }

  // Deduplicate: if already fetching, wait for it
  if (faviconPendingFetches.has(origin)) {
    return faviconPendingFetches.get(origin);
  }

  const promise = (async () => {
    try {
      const hostname = new URL(origin).hostname;

      // Strategy 1: Try origin/favicon.ico directly (background isn't subject to CSP)
      const directUrl = await fetchUrlAsDataUrl(`${origin}/favicon.ico`);
      if (directUrl) {
        faviconCache.set(origin, directUrl);
        return;
      }

      // Strategy 2: Google S2 favicon service
      const googleUrl = await fetchGoogleFavicon(hostname);
      if (googleUrl) {
        faviconCache.set(origin, googleUrl);
        return;
      }

      // Nothing found
      faviconCache.set(origin, 'none');
    } catch (e) {
      faviconCache.set(origin, 'none');
    }
  })();

  faviconPendingFetches.set(origin, promise);
  try {
    await promise;
  } finally {
    faviconPendingFetches.delete(origin);
  }
}

// After broadcasting, resolve any 'pending' favicons in the background
async function resolvePendingFavicons(tabInfo) {
  const allTabs = [...(tabInfo.pinned || []), ...(tabInfo.regular || [])];
  const originsToResolve = new Set();

  for (const tab of allTabs) {
    if (tab.favIconUrl === 'pending' && tab.url) {
      try {
        originsToResolve.add(new URL(tab.url).origin);
      } catch (e) {}
    }
  }

  if (originsToResolve.size === 0) return;

  await Promise.allSettled(
    [...originsToResolve].map(origin => resolveOriginFavicon(origin))
  );

  // Re-broadcast with resolved favicons
  // Safe from infinite loop: cached values replace 'pending', so next call finds nothing to resolve
  updateAllSidebars();
}

// Pre-warm: eagerly resolve favicons for all open tabs
async function prewarmFaviconCache() {
  const tabs = await chrome.tabs.query({});
  const origins = new Set();

  for (const tab of tabs) {
    if (!tab.url) continue;
    try {
      const url = new URL(tab.url);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        const origin = url.origin;

        // If browser already has a favicon URL, convert it to data URL
        if (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://')) {
          if (tab.favIconUrl.startsWith('data:')) {
            faviconCache.set(origin, tab.favIconUrl);
          } else {
            // Cache raw URL immediately so formatTab picks it up
            faviconCache.set(origin, tab.favIconUrl);
            // Then convert to data URL in background
            fetchUrlAsDataUrl(tab.favIconUrl).then(dataUrl => {
              if (dataUrl) {
                faviconCache.set(origin, dataUrl);
              }
            });
          }
        } else {
          origins.add(origin);
        }
      }
    } catch (e) {}
  }

  // Resolve any origins that didn't have a browser favicon
  if (origins.size > 0) {
    await Promise.allSettled(
      [...origins].map(origin => resolveOriginFavicon(origin))
    );
    updateAllSidebars();
  }
}

// --- Tab event listeners ---
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Cache favicon when browser provides it
  if (changeInfo.favIconUrl && tab.url) {
    try {
      const origin = new URL(tab.url).origin;

      if (changeInfo.favIconUrl.startsWith('data:')) {
        faviconCache.set(origin, changeInfo.favIconUrl);
      } else {
        // Store raw URL immediately for fast first paint
        faviconCache.set(origin, changeInfo.favIconUrl);
        // Convert to data URL in background for CSP safety, then re-broadcast
        fetchUrlAsDataUrl(changeInfo.favIconUrl).then(dataUrl => {
          if (dataUrl) {
            faviconCache.set(origin, dataUrl);
            updateAllSidebars();
          }
        });
      }
    } catch (e) {}
    // Favicon just arrived — broadcast immediately
    updateAllSidebars();
    return;
  }

  scheduleBroadcast();

  // Delayed re-broadcasts to catch late favicon URLs
  if (changeInfo.status === 'complete') {
    setTimeout(() => scheduleBroadcast(), 1000);
    setTimeout(() => scheduleBroadcast(), 3500);
  }
});

chrome.tabs.onCreated.addListener(() => scheduleBroadcast());
chrome.tabs.onRemoved.addListener(() => scheduleBroadcast());
chrome.tabs.onActivated.addListener(() => scheduleBroadcast());
chrome.tabs.onMoved.addListener(() => scheduleBroadcast());

// --- Message handlers ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ pong: true });
    return;
  }

  if (message.type === 'SWITCH_TAB') {
    chrome.tabs.update(message.tabId, { active: true }).catch(async () => {
      if (message.url && sender.tab) {
        try {
          const tabs = await chrome.tabs.query({ windowId: sender.tab.windowId });
          const match = tabs.find(t => t.url === message.url);
          if (match) {
            chrome.tabs.update(match.id, { active: true }).catch(() => {});
          }
        } catch (e) {}
      }
    });
    return;
  }

  if (message.type === 'PIN_TAB') {
    const { tabId, pin } = message;
    chrome.tabs.update(tabId, { pinned: !!pin }).then(() => {
      updateAllSidebars();
    });
    return;
  }

  if (message.type === 'CLOSE_TAB') {
    const { tabId } = message;
    chrome.tabs.remove(tabId).then(() => {
      updateAllSidebars();
    });
    return;
  }

  if (message.type === 'MOVE_TAB') {
    const { tabId, newIndex, pin } = message;

    const ensurePinState = typeof pin === 'boolean'
      ? chrome.tabs.update(tabId, { pinned: !!pin })
      : Promise.resolve();

    ensurePinState.then(async () => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const pinnedTabs = tabs.filter(t => t.pinned);
      const regularTabs = tabs.filter(t => !t.pinned);

      const targetList = (typeof pin === 'boolean' ? pin : (tabs.find(t => t.id === tabId)?.pinned)) ? pinnedTabs : regularTabs;

      const clampedIndex = Math.max(0, Math.min(newIndex ?? 0, targetList.length - 1));

      let absoluteIndex = clampedIndex;
      if (targetList === regularTabs) {
        absoluteIndex = pinnedTabs.length + clampedIndex;
      }

      chrome.tabs.move(tabId, { index: absoluteIndex }).then(() => {
        updateAllSidebars();
      });
    });

    return;
  }

  // Reload all tabs on a specific hostname
  if (message.type === 'RELOAD_SITE') {
    const { hostname } = message;
    chrome.tabs.query({ currentWindow: true }).then(tabs => {
      for (const tab of tabs) {
        try {
          if (new URL(tab.url).hostname === hostname) {
            chrome.tabs.reload(tab.id);
          }
        } catch (e) {}
      }
    });
    return;
  }

  // Fetch favicon via background (kept for backward compatibility)
  if (message.type === 'FETCH_FAVICON') {
    const { hostname } = message;
    fetchGoogleFavicon(hostname).then(dataUrl => {
      if (dataUrl) {
        try {
          faviconCache.set(`https://${hostname}`, dataUrl);
        } catch (e) {}
      }
      sendResponse({ dataUrl });
    });
    return true;
  }
});

// --- Core: format tab data and broadcast ---
async function formatTab(tab) {
  let faviconUrl = '';

  // First: check our cache (most reliable — contains data URLs)
  if (tab.url) {
    try {
      const origin = new URL(tab.url).origin;
      const cached = faviconCache.get(origin);
      if (cached && cached !== 'none' && cached !== 'pending') {
        faviconUrl = cached;
      }
    } catch (e) {}
  }

  // Second: use browser-provided favicon if cache is empty
  if (!faviconUrl && tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://')) {
    faviconUrl = tab.favIconUrl;
  }

  // Special URLs get 'default'
  if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('file://') || tab.url.startsWith('about:'))) {
    return {
      id: tab.id,
      title: tab.title || 'Untitled',
      url: tab.url,
      favIconUrl: 'default',
      active: tab.active,
      pinned: tab.pinned
    };
  }

  // Normal URL with no favicon yet — mark as 'pending' for background resolution
  if (!faviconUrl && tab.url) {
    try {
      const url = new URL(tab.url);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        faviconUrl = 'pending';
      }
    } catch (e) {
      faviconUrl = 'default';
    }
  }

  return {
    id: tab.id,
    title: tab.title || 'Untitled',
    url: tab.url,
    favIconUrl: faviconUrl || 'default',
    active: tab.active,
    pinned: tab.pinned
  };
}

async function updateAllSidebars() {
  const tabs = await chrome.tabs.query({});

  const pinnedTabs = tabs.filter(t => t.pinned);
  const regularTabs = tabs.filter(t => !t.pinned);

  const tabInfo = {
    pinned: await Promise.all(pinnedTabs.map(formatTab)),
    regular: await Promise.all(regularTabs.map(formatTab))
  };

  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'UPDATE_TABS',
      data: tabInfo
    }).catch(() => {});
  }

  resolvePendingFavicons(tabInfo);
}

function isSpecialUrl(url) {
  return url.startsWith('chrome://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('safari-web-extension://');
}

// On install/startup, ensure all tabs have the content script
async function enableOnAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    if (isSpecialUrl(tab.url)) continue;

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
      if (response && response.pong) continue;
    } catch (e) {}

    try {
      await chrome.tabs.reload(tab.id);
    } catch (e) {}
  }

  setTimeout(() => updateAllSidebars(), 2000);
}

chrome.runtime.onInstalled.addListener(() => {
  prewarmFaviconCache().then(() => enableOnAllTabs());
});

chrome.runtime.onStartup.addListener(() => {
  prewarmFaviconCache().then(() => enableOnAllTabs());
});

// Initial update — prewarm cache first, then broadcast
prewarmFaviconCache().then(() => updateAllSidebars());
