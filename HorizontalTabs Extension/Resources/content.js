// Content script - injects the sidebar
let sidebar = null;
let currentTabs = { pinned: [], regular: [] };

// Create sidebar on page load
function createSidebar() {
  if (sidebar) return;
  
  sidebar = document.createElement('div');
  sidebar.id = 'ht-sidebar';
  sidebar.className = 'ht-sidebar';
  sidebar.setAttribute('role', 'navigation');
  sidebar.setAttribute('aria-label', 'Open tabs sidebar');
  
  document.body.appendChild(sidebar);
  
  // Adjust viewport and transform everything
  const style = document.createElement('style');
  style.id = 'ht-style-override';
  style.textContent = `
    /* Force the entire page to shift right */
    html {
      transform: translateX(50px) !important;
      width: calc(100vw - 50px) !important;
    }
    
    body {
      margin-left: 0 !important;
      padding-left: 0 !important;
    }
    
    /* Prevent the sidebar from being transformed */
    #ht-sidebar {
      transform: translateX(-50px) !important;
    }
  `;
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

// Render tabs in sidebar
function renderTabs() {
  if (!sidebar) return;
  
  sidebar.innerHTML = '';
  
  // Pinned tabs section
  if (currentTabs.pinned && currentTabs.pinned.length > 0) {
    const pinnedSection = document.createElement('div');
    pinnedSection.className = 'ht-tab-section ht-pinned-section';
    pinnedSection.setAttribute('role', 'list');
    pinnedSection.setAttribute('aria-label', 'Pinned tabs');
    
    currentTabs.pinned.forEach(tab => {
      pinnedSection.appendChild(createTabElement(tab, true));
    });
    
    sidebar.appendChild(pinnedSection);
    
    // Divider
    const divider = document.createElement('div');
    divider.className = 'ht-tab-divider';
    divider.setAttribute('role', 'separator');
    sidebar.appendChild(divider);
  }
  
  // Regular tabs section
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

// Create individual tab element
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
    
    // Remove existing menu
    const existingMenu = document.querySelector('.ht-context-menu');
    if (existingMenu) existingMenu.remove();
    
    // Create new menu
    const menu = document.createElement('div');
    menu.className = 'ht-context-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Tab actions');
    
    // Calculate position with viewport bounds checking
    const menuWidth = 140;
    const menuHeight = 80;
    let left = e.pageX;
    let top = e.pageY;
    
    // Check right edge
    if (left + menuWidth > window.innerWidth + window.scrollX) {
      left = window.innerWidth + window.scrollX - menuWidth - 10;
    }
    
    // Check bottom edge
    if (top + menuHeight > window.innerHeight + window.scrollY) {
      top = window.innerHeight + window.scrollY - menuHeight - 10;
    }
    
    // Ensure not off left/top edges
    if (left < window.scrollX) left = window.scrollX + 10;
    if (top < window.scrollY) top = window.scrollY + 10;
    
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    
    // Pin/Unpin option
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
    
    // Close tab option
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
  
  // Create favicon with fallback
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
  
  // Click to switch tab
  tabEl.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'SWITCH_TAB',
      tabId: tab.id
    });
  });
  
  return tabEl;
}

// Create a letter-based icon as fallback
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

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_TABS') {
    currentTabs = message.data;
    renderTabs();
  }
});

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createSidebar);
} else {
  createSidebar();
}
