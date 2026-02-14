// Horizontal Tabs - Content script
let sidebar = null;
let currentTabs = { pinned: [], regular: [] };

async function shouldEnableExtension() {
  const hostname = window.location.hostname;
  
  const settings = await chrome.storage.sync.get({
    enabled: true,
    mode: 'push',
    siteSettings: {}
  });
  
  if (!settings.enabled) return { enabled: false };
  
  const siteConfig = settings.siteSettings[hostname];
  if (siteConfig && siteConfig.enabled === false) {
    return { enabled: false };
  }
  
  const mode = (siteConfig && siteConfig.mode && siteConfig.mode !== 'default')
    ? siteConfig.mode
    : settings.mode;
  
  return { enabled: true, mode };
}

async function createSidebar() {
  if (sidebar) return;
  
  const config = await shouldEnableExtension();
  if (!config.enabled) {
    console.log('Horizontal Tabs: Disabled on this site');
    return;
  }
  
  sidebar = document.createElement('div');
  sidebar.id = 'ht-sidebar';
  sidebar.className = 'ht-sidebar';
  sidebar.setAttribute('role', 'navigation');
  sidebar.setAttribute('aria-label', 'Open tabs sidebar');
  
  document.body.appendChild(sidebar);
  
  const style = document.createElement('style');
  style.id = 'ht-style-override';
  
  if (config.mode === 'push') {
    style.textContent = `
      html {
        transform: translateX(50px) !important;
        width: calc(100vw - 50px) !important;
      }
      body {
        margin-left: 0 !important;
        padding-left: 0 !important;
      }
      #ht-sidebar {
        transform: translateX(-50px) !important;
      }
    `;
  } else {
    style.textContent = `
      #ht-sidebar {
        position: fixed;
        left: 0;
      }
    `;
  }
  
  document.head.appendChild(style);
  
  // Close context menu when clicking outside
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.ht-context-menu')) {
      const menu = document.querySelector('.ht-context-menu');
      if (menu) menu.remove();
    }
  }, true);
  
  renderTabs();
}

function renderTabs() {
  if (!sidebar) return;
  
  sidebar.innerHTML = '';
  
  if (currentTabs.pinned && currentTabs.pinned.length > 0) {
    const pinnedSection = document.createElement('div');
    pinnedSection.className = 'ht-tab-section ht-pinned-section';
    pinnedSection.setAttribute('role', 'list');
    pinnedSection.setAttribute('aria-label', 'Pinned tabs');
    
    currentTabs.pinned.forEach(tab => {
      pinnedSection.appendChild(createTabElement(tab, true));
    });
    
    sidebar.appendChild(pinnedSection);
    
    const divider = document.createElement('div');
    divider.className = 'ht-tab-divider';
    divider.setAttribute('role', 'separator');
    sidebar.appendChild(divider);
  }
  
  if (currentTabs.regular && currentTabs.regular.length > 0) {
    const regularSection = document.createElement('div');
    regularSection.className = 'ht-tab-section ht-regular-section';
    regularSection.setAttribute('role', 'list');
    regularSection.setAttribute('aria-label', 'Regular tabs');
    
    currentTabs.regular.forEach(tab => {
      regularSection.appendChild(createTabElement(tab, false));
    });
    
    sidebar.appendChild(regularSection);
  }
}

function createTabElement(tab, isPinned) {
  const tabEl = document.createElement('div');
  tabEl.className = 'ht-tab-item' + (tab.active ? ' ht-active' : '');
  tabEl.title = tab.title;
  tabEl.setAttribute('role', 'listitem');
  tabEl.setAttribute('aria-label', tab.title);
  
  if (tab.active) {
    tabEl.setAttribute('aria-current', 'page');
  }
  
  // Right-click context menu
  tabEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const existingMenu = document.querySelector('.ht-context-menu');
    if (existingMenu) existingMenu.remove();
    
    const menu = document.createElement('div');
    menu.className = 'ht-context-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Tab actions');
    
    const menuWidth = 140;
    const menuHeight = 80;
    let left = e.pageX;
    let top = e.pageY;
    
    if (left + menuWidth > window.innerWidth + window.scrollX) {
      left = window.innerWidth + window.scrollX - menuWidth - 10;
    }
    if (top + menuHeight > window.innerHeight + window.scrollY) {
      top = window.innerHeight + window.scrollY - menuHeight - 10;
    }
    if (left < window.scrollX) left = window.scrollX + 10;
    if (top < window.scrollY) top = window.scrollY + 10;
    
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    
    const pinItem = document.createElement('div');
    pinItem.className = 'ht-context-menu-item';
    pinItem.textContent = isPinned ? '📌 Unpin Tab' : '📌 Pin Tab';
    pinItem.setAttribute('role', 'menuitem');
    pinItem.onclick = (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({
        type: 'PIN_TAB',
        tabId: tab.id,
        pin: !isPinned
      });
      menu.remove();
    };
    
    const closeItem = document.createElement('div');
    closeItem.className = 'ht-context-menu-item';
    closeItem.textContent = '✕ Close Tab';
    closeItem.setAttribute('role', 'menuitem');
    closeItem.onclick = (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({
        type: 'CLOSE_TAB',
        tabId: tab.id
      });
      menu.remove();
    };
    
    menu.appendChild(pinItem);
    menu.appendChild(closeItem);
    document.body.appendChild(menu);
  });
  
  if (tab.favIconUrl && tab.favIconUrl !== 'default') {
    const favicon = document.createElement('img');
    favicon.className = 'ht-tab-favicon';
    favicon.src = tab.favIconUrl;
    favicon.alt = '';
    favicon.setAttribute('aria-hidden', 'true');
    
    favicon.onerror = () => {
      try {
        const fallbackUrl = `https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=32`;
        if (favicon.src !== fallbackUrl) {
          favicon.src = fallbackUrl;
        } else {
          favicon.replaceWith(createLetterIcon(tab.title));
        }
      } catch (e) {
        favicon.replaceWith(createLetterIcon(tab.title));
      }
    };
    
    tabEl.appendChild(favicon);
  } else {
    tabEl.appendChild(createLetterIcon(tab.title));
  }
  
  tabEl.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'SWITCH_TAB',
      tabId: tab.id
    });
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
    width: 20px;
    height: 20px;
    background: ${colors[colorIndex]};
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
    border-radius: 3px;
  `;
  
  return icon;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_TABS') {
    currentTabs = message.data;
    renderTabs();
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createSidebar);
} else {
  createSidebar();
}