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

// Initial update
updateAllSidebars();
