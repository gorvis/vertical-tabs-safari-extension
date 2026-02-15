// Vertical Tabs - Content script (Shadow DOM isolated)
let shadowHost = null;
let shadowRoot = null;
let sidebar = null;
let currentTabs = { pinned: [], regular: [] };

function createSidebar() {
  if (shadowHost) return;

  // Host element — sits in page DOM, only used for positioning
  shadowHost = document.createElement('div');
  shadowHost.id = 'ht-sidebar-host';
  shadowHost.style.cssText = `
    position: fixed !important;
    left: 0 !important;
    top: 0 !important;
    width: 50px !important;
    height: 100vh !important;
    z-index: 2147483647 !important;
    pointer-events: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    background: none !important;
    transform: none !important;
    opacity: 1 !important;
    visibility: visible !important;
    display: block !important;
    overflow: visible !important;
  `;
  document.body.appendChild(shadowHost);

  // Shadow root — completely isolates our styles
  shadowRoot = shadowHost.attachShadow({ mode: 'open' });

  // Inject our CSS into the shadow root
  const style = document.createElement('style');
  style.textContent = SIDEBAR_CSS;
  shadowRoot.appendChild(style);

  // The actual sidebar container
  sidebar = document.createElement('div');
  sidebar.className = 'ht-sidebar';
  sidebar.setAttribute('role', 'navigation');
  sidebar.setAttribute('aria-label', 'Open tabs sidebar');
  shadowRoot.appendChild(sidebar);

  // Push page content over
  const pageStyle = document.createElement('style');
  pageStyle.id = 'ht-style-override';
  pageStyle.textContent = `
    html {
      margin-left: 50px !important;
      width: calc(100% - 50px) !important;
    }
  `;
  document.head.appendChild(pageStyle);

  // Delegated click handler on shadow root — failsafe for tab switching
  shadowRoot.addEventListener('click', (e) => {
    const tabItem = e.target.closest('.ht-tab-item');
    if (tabItem && tabItem._tabId) {
      e.stopPropagation();
      e.preventDefault();
      tabItem.style.opacity = '0.5';
      setTimeout(() => { tabItem.style.opacity = ''; }, 200);
      try {
        chrome.runtime.sendMessage({
          type: 'SWITCH_TAB',
          tabId: tabItem._tabId,
          url: tabItem._tabUrl || ''
        });
      } catch (err) {}
    }
  });

  // Close context menu and settings panel when clicking outside
  document.addEventListener('mousedown', (e) => {
    if (!shadowHost.contains(e.target)) {
      const menu = shadowRoot.querySelector('.ht-context-menu');
      if (menu) menu.remove();
      const panel = shadowRoot.querySelector('.ht-settings-panel');
      if (panel) panel.remove();
    }
  }, true);

  renderTabs();
}

function renderTabs() {
  if (!sidebar) return;

  sidebar.innerHTML = '';

  // Tab sections wrapper (scrollable area)
  const tabsWrapper = document.createElement('div');
  tabsWrapper.className = 'ht-tabs-wrapper';

  if (currentTabs.pinned && currentTabs.pinned.length > 0) {
    const pinnedSection = document.createElement('div');
    pinnedSection.className = 'ht-tab-section ht-pinned-section';
    pinnedSection.setAttribute('role', 'list');
    pinnedSection.setAttribute('aria-label', 'Pinned tabs');

    currentTabs.pinned.forEach(tab => {
      pinnedSection.appendChild(createTabElement(tab, true));
    });

    tabsWrapper.appendChild(pinnedSection);

    const divider = document.createElement('div');
    divider.className = 'ht-tab-divider';
    divider.setAttribute('role', 'separator');
    tabsWrapper.appendChild(divider);
  }

  if (currentTabs.regular && currentTabs.regular.length > 0) {
    const regularSection = document.createElement('div');
    regularSection.className = 'ht-tab-section ht-regular-section';
    regularSection.setAttribute('role', 'list');
    regularSection.setAttribute('aria-label', 'Regular tabs');

    currentTabs.regular.forEach(tab => {
      regularSection.appendChild(createTabElement(tab, false));
    });

    tabsWrapper.appendChild(regularSection);
  }

  sidebar.appendChild(tabsWrapper);

  // Settings gear icon at bottom
  const settingsBtn = document.createElement('div');
  settingsBtn.className = 'ht-settings-btn';
  settingsBtn.title = 'Settings';
  settingsBtn.setAttribute('aria-label', 'Settings');
  settingsBtn.textContent = '\u2699';
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSettingsPanel();
  });
  sidebar.appendChild(settingsBtn);
}

async function toggleSettingsPanel() {
  const existing = shadowRoot.querySelector('.ht-settings-panel');
  if (existing) {
    existing.remove();
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'ht-settings-panel';

  const title = document.createElement('div');
  title.className = 'ht-settings-title';
  title.textContent = 'Vertical Tab Settings';
  panel.appendChild(title);

  const { disabledSites = [] } = await chrome.storage.sync.get({ disabledSites: [] });

  if (disabledSites.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ht-settings-empty';
    empty.textContent = 'No hidden sites';
    panel.appendChild(empty);
  } else {
    disabledSites.forEach(site => {
      const row = document.createElement('div');
      row.className = 'ht-settings-row';

      const name = document.createElement('span');
      name.className = 'ht-settings-site-name';
      name.textContent = site;

      const removeBtn = document.createElement('span');
      removeBtn.className = 'ht-settings-remove';
      removeBtn.textContent = '\u2715';
      removeBtn.title = 'Re-enable on ' + site;
      removeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const { disabledSites = [] } = await chrome.storage.sync.get({ disabledSites: [] });
        const updated = disabledSites.filter(s => s !== site);
        await chrome.storage.sync.set({ disabledSites: updated });
        row.remove();
        chrome.runtime.sendMessage({ type: 'RELOAD_SITE', hostname: site });
        if (updated.length === 0) {
          panel.remove();
        }
      });

      row.appendChild(name);
      row.appendChild(removeBtn);
      panel.appendChild(row);
    });
  }

  const currentHostname = window.location.hostname;
  const hideBtn = document.createElement('div');
  hideBtn.className = 'ht-settings-hide-btn';
  hideBtn.textContent = 'Hide on this site';
  hideBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await disableCurrentSite();
  });
  panel.appendChild(hideBtn);

  shadowRoot.appendChild(panel);
}

async function disableCurrentSite() {
  const hostname = window.location.hostname;
  const { disabledSites = [] } = await chrome.storage.sync.get({ disabledSites: [] });
  if (!disabledSites.includes(hostname)) {
    disabledSites.push(hostname);
  }
  await chrome.storage.sync.set({ disabledSites });
  chrome.runtime.sendMessage({ type: 'RELOAD_SITE', hostname });
}

function createTabElement(tab, isPinned) {
  const tabEl = document.createElement('div');
  tabEl.className = 'ht-tab-item' + (tab.active ? ' ht-active' : '');
  tabEl.title = tab.title;
  tabEl.setAttribute('role', 'listitem');
  tabEl.setAttribute('aria-label', tab.title);

  // Store tab data on element for delegated click handler
  tabEl._tabId = tab.id;
  tabEl._tabUrl = tab.url;

  if (tab.active) {
    tabEl.setAttribute('aria-current', 'page');
  }

  // Right-click context menu
  tabEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const existingMenu = shadowRoot.querySelector('.ht-context-menu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.className = 'ht-context-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Tab actions');

    // Position relative to the shadow host
    const hostRect = shadowHost.getBoundingClientRect();
    let left = e.clientX - hostRect.left;
    let top = e.clientY - hostRect.top;

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    const pinItem = document.createElement('div');
    pinItem.className = 'ht-context-menu-item';
    pinItem.textContent = isPinned ? '\uD83D\uDCCC Unpin Tab' : '\uD83D\uDCCC Pin Tab';
    pinItem.setAttribute('role', 'menuitem');
    pinItem.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({
        type: 'PIN_TAB',
        tabId: tab.id,
        pin: !isPinned
      });
      menu.remove();
    });

    const closeItem = document.createElement('div');
    closeItem.className = 'ht-context-menu-item';
    closeItem.textContent = '\u2715 Close Tab';
    closeItem.setAttribute('role', 'menuitem');
    closeItem.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({
        type: 'CLOSE_TAB',
        tabId: tab.id
      });
      menu.remove();
    });

    menu.appendChild(pinItem);
    menu.appendChild(closeItem);

    let hideHostname = '';
    try { hideHostname = new URL(tab.url).hostname; } catch (e) {}
    if (hideHostname) {
      const divider = document.createElement('hr');
      divider.className = 'ht-context-divider';
      menu.appendChild(divider);

      const hideItem = document.createElement('div');
      hideItem.className = 'ht-context-menu-item';
      hideItem.textContent = 'Hide on ' + hideHostname;
      hideItem.setAttribute('role', 'menuitem');
      hideItem.addEventListener('click', async (e) => {
        e.stopPropagation();
        menu.remove();
        const { disabledSites = [] } = await chrome.storage.sync.get({ disabledSites: [] });
        if (!disabledSites.includes(hideHostname)) {
          disabledSites.push(hideHostname);
        }
        await chrome.storage.sync.set({ disabledSites });
        chrome.runtime.sendMessage({ type: 'RELOAD_SITE', hostname: hideHostname });
      });
      menu.appendChild(hideItem);
    }

    shadowRoot.appendChild(menu);

    // Close menu on click outside (within shadow)
    const closeMenu = (evt) => {
      if (!menu.contains(evt.target)) {
        menu.remove();
        shadowRoot.removeEventListener('mousedown', closeMenu);
      }
    };
    // Delay to avoid catching the current right-click
    setTimeout(() => shadowRoot.addEventListener('mousedown', closeMenu), 0);
  });

  // Favicon
  const faviconUrl = tab.favIconUrl;
  if (faviconUrl && faviconUrl !== 'default' && faviconUrl !== 'none' && faviconUrl !== 'pending') {
    const favicon = document.createElement('img');
    favicon.className = 'ht-tab-favicon';
    favicon.src = faviconUrl;
    favicon.alt = '';
    favicon.setAttribute('aria-hidden', 'true');

    if (!faviconUrl.startsWith('data:')) {
      favicon.onerror = () => {
        favicon.replaceWith(createLetterIcon(tab.title));
      };
    }

    tabEl.appendChild(favicon);
  } else {
    tabEl.appendChild(createLetterIcon(tab.title));
  }

  function switchToTab() {
    // Visual feedback — flash the item
    tabEl.style.opacity = '0.5';
    setTimeout(() => { tabEl.style.opacity = ''; }, 200);

    try {
      chrome.runtime.sendMessage({
        type: 'SWITCH_TAB',
        tabId: tab.id,
        url: tab.url
      });
    } catch (err) {
      // Extension context may be invalidated — try reloading
      console.error('[VerticalTabs] sendMessage failed:', err);
    }
  }

  tabEl.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    switchToTab();
  });

  // Backup: mousedown fires before click and isn't blocked by some Safari quirks
  tabEl.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // left click only
      e.stopPropagation();
      e.preventDefault();
      switchToTab();
    }
  });

  return tabEl;
}

function createLetterIcon(title) {
  const letter = (title || '?').charAt(0).toUpperCase();
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
  const colorIndex = letter.charCodeAt(0) % colors.length;

  const icon = document.createElement('div');
  icon.className = 'ht-tab-favicon ht-tab-letter-icon';
  icon.textContent = letter;
  icon.setAttribute('aria-hidden', 'true');
  icon.style.cssText = `
    background: ${colors[colorIndex]};
  `;

  return icon;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ pong: true });
    return;
  }
  if (message.type === 'UPDATE_TABS') {
    currentTabs = message.data;
    renderTabs();
  }
});

async function init() {
  try {
    const hostname = window.location.hostname;
    const { disabledSites = [] } = await chrome.storage.sync.get({ disabledSites: [] });
    if (disabledSites.includes(hostname)) {
      return;
    }
  } catch (e) {
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createSidebar);
  } else {
    createSidebar();
  }
}

// All sidebar CSS — embedded in shadow root, completely isolated from page
const SIDEBAR_CSS = `
  .ht-sidebar {
    position: absolute;
    left: 0;
    top: 0;
    width: 50px;
    height: 100vh;
    background: #f5f5f5;
    border-right: 1px solid #ddd;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 2px 0 5px rgba(0,0,0,0.1);
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 14px;
    line-height: normal;
    box-sizing: border-box;
    -webkit-text-size-adjust: none;
  }

  .ht-sidebar *, .ht-sidebar *::before, .ht-sidebar *::after {
    box-sizing: border-box;
    line-height: normal;
  }

  .ht-tabs-wrapper {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .ht-tabs-wrapper::-webkit-scrollbar {
    width: 6px;
  }

  .ht-tabs-wrapper::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 3px;
  }

  .ht-tab-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 0;
    flex-shrink: 0;
  }

  .ht-pinned-section {
    padding-top: 8px;
  }

  .ht-tab-divider {
    height: 1px;
    min-height: 1px;
    max-height: 1px;
    background: #ddd;
    margin: 2px 8px;
    flex-shrink: 0;
  }

  .ht-tab-item {
    width: 34px;
    height: 34px;
    min-width: 34px;
    max-width: 34px;
    min-height: 34px;
    max-height: 34px;
    margin: 0 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    background: white;
    border: 1px solid #e0e0e0;
    padding: 0;
    flex-shrink: 0;
    flex-grow: 0;
  }

  .ht-tab-item:hover {
    background: #e8e8e8;
    transform: scale(1.05);
  }

  .ht-tab-item.ht-active {
    background: #007aff;
    border-color: #007aff;
    box-shadow: 0 2px 8px rgba(0, 122, 255, 0.3);
  }

  .ht-tab-item.ht-active:hover {
    background: #0066dd;
  }

  .ht-tab-favicon {
    width: 20px;
    height: 20px;
    min-width: 20px;
    max-width: 20px;
    min-height: 20px;
    max-height: 20px;
    object-fit: contain;
    filter: none;
    display: block;
    flex-shrink: 0;
    flex-grow: 0;
  }

  .ht-tab-letter-icon {
    width: 20px;
    height: 20px;
    min-width: 20px;
    max-width: 20px;
    min-height: 20px;
    max-height: 20px;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
    border-radius: 3px;
    flex-shrink: 0;
    flex-grow: 0;
  }

  .ht-tab-item.ht-active .ht-tab-favicon {
    filter: brightness(0) invert(1);
  }

  /* Context menu */
  .ht-context-menu {
    position: absolute;
    background: white;
    border: 1px solid #ddd;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    padding: 4px 0;
    z-index: 10;
    min-width: 140px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  }

  .ht-context-menu-item {
    padding: 10px 16px;
    cursor: pointer;
    font-size: 13px;
    color: #333;
    user-select: none;
  }

  .ht-context-menu-item:hover {
    background: #e8f4ff;
  }

  .ht-context-divider {
    border: none;
    border-top: 1px solid #eee;
    margin: 4px 0;
  }

  /* Settings gear button */
  .ht-settings-btn {
    width: 50px;
    height: 36px;
    min-height: 36px;
    max-height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    color: #999;
    cursor: pointer;
    border-top: 1px solid #ddd;
    flex-shrink: 0;
    flex-grow: 0;
    user-select: none;
    transition: color 0.2s;
  }

  .ht-settings-btn:hover {
    color: #555;
  }

  /* Settings panel */
  .ht-settings-panel {
    position: absolute;
    left: 54px;
    bottom: 10px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    padding: 12px;
    z-index: 10;
    min-width: 200px;
    max-width: 280px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  }

  .ht-settings-title {
    font-size: 12px;
    font-weight: 600;
    color: #333;
    margin-bottom: 8px;
  }

  .ht-settings-empty {
    font-size: 11px;
    color: #999;
    padding: 4px 0;
  }

  .ht-settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 0;
    border-bottom: 1px solid #f0f0f0;
  }

  .ht-settings-row:last-of-type {
    border-bottom: none;
  }

  .ht-settings-site-name {
    font-size: 12px;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    margin-right: 8px;
  }

  .ht-settings-remove {
    font-size: 12px;
    color: #999;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .ht-settings-remove:hover {
    color: #ff3b30;
    background: rgba(255, 59, 48, 0.1);
  }

  .ht-settings-hide-btn {
    margin-top: 8px;
    padding: 6px 10px;
    font-size: 12px;
    color: #ff3b30;
    cursor: pointer;
    border-radius: 6px;
    text-align: center;
    border-top: 1px solid #eee;
    padding-top: 10px;
    transition: background 0.2s;
  }

  .ht-settings-hide-btn:hover {
    background: rgba(255, 59, 48, 0.08);
  }

  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .ht-sidebar {
      background: #2a2a2a;
      border-right-color: #444;
    }

    .ht-tab-item {
      background: #3a3a3a;
      border-color: #555;
    }

    .ht-tab-item:hover {
      background: #4a4a4a;
    }

    .ht-tab-divider {
      background: #555;
    }

    .ht-context-menu {
      background: #2a2a2a;
      border-color: #444;
    }

    .ht-context-menu-item {
      color: #eee;
    }

    .ht-context-menu-item:hover {
      background: #3a3a3a;
    }

    .ht-context-divider {
      border-top-color: #444;
    }

    .ht-settings-btn {
      color: #666;
      border-top-color: #444;
    }

    .ht-settings-btn:hover {
      color: #aaa;
    }

    .ht-settings-panel {
      background: #2a2a2a;
      border-color: #444;
    }

    .ht-settings-title {
      color: #eee;
    }

    .ht-settings-row {
      border-bottom-color: #333;
    }

    .ht-settings-site-name {
      color: #eee;
    }

    .ht-settings-remove {
      color: #666;
    }

    .ht-settings-hide-btn {
      border-top-color: #444;
    }
  }
`;

init();
