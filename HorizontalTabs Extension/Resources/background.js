// Background service worker
let tabData = [];

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  updateAllSidebars();
});

chrome.tabs.onCreated.addListener(() => {
  updateAllSidebars();
});

chrome.tabs.onRemoved.addListener(() => {
  updateAllSidebars();
});

chrome.tabs.onActivated.addListener(() => {
  updateAllSidebars();
});

chrome.tabs.onMoved.addListener(() => {
  updateAllSidebars();
});

// Listen for switch tab requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SWITCH_TAB') {
    chrome.tabs.update(message.tabId, { active: true });
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

    // First, pin/unpin if requested
    const ensurePinState = typeof pin === 'boolean'
      ? chrome.tabs.update(tabId, { pinned: !!pin })
      : Promise.resolve();

    ensurePinState.then(async () => {
      // Re-query tabs to compute correct index within the intended section
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const pinnedTabs = tabs.filter(t => t.pinned);
      const regularTabs = tabs.filter(t => !t.pinned);

      const targetList = (typeof pin === 'boolean' ? pin : (tabs.find(t => t.id === tabId)?.pinned)) ? pinnedTabs : regularTabs;

      // Clamp newIndex within bounds
      const clampedIndex = Math.max(0, Math.min(newIndex ?? 0, targetList.length - 1));

      // Compute absolute index among all tabs
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
});

// Function to get all tabs and send to content scripts
async function updateAllSidebars() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  
  // Separate pinned and regular tabs
  const pinnedTabs = tabs.filter(t => t.pinned);
  const regularTabs = tabs.filter(t => !t.pinned);
  
  const tabInfo = {
    pinned: await Promise.all(pinnedTabs.map(formatTab)),
    regular: await Promise.all(regularTabs.map(formatTab))
  };
  
  // Send to all tabs
  tabs.forEach(tab => {
    chrome.tabs.sendMessage(tab.id, {
      type: 'UPDATE_TABS',
      data: tabInfo
    }).catch(() => {
      // Tab might not be ready yet
    });
  });
}

async function formatTab(tab) {
  let faviconUrl = tab.favIconUrl;
  
  // If no favicon, try to construct one from the URL
  if (!faviconUrl && tab.url) {
    try {
      const url = new URL(tab.url);
      faviconUrl = `${url.origin}/favicon.ico`;
    } catch (e) {
      faviconUrl = '';
    }
  }
  
  // For chrome:// or file:// URLs, use a default
  if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('file://') || tab.url.startsWith('about:'))) {
    faviconUrl = 'default';
  }
  
  return {
    id: tab.id,
    title: tab.title || 'Untitled',
    url: tab.url,
    favIconUrl: faviconUrl,
    active: tab.active,
    pinned: tab.pinned
  };
}

// Inject content.js into all existing tabs on install/startup
async function enableOnAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    if (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('safari-web-extension://')
    ) {
      continue;
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: false },
        files: ['content.js']
      });
    } catch (e) {
      // Injection may fail on some pages
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  enableOnAllTabs();
});

chrome.runtime.onStartup.addListener(() => {
  enableOnAllTabs();
});

// Initial update
updateAllSidebars();

