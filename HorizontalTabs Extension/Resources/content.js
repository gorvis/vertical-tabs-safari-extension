// Content script - injects the sidebar
let sidebar = null;
let currentTabs = { pinned: [], regular: [] };

// Create sidebar on page load
function createSidebar() {
  if (sidebar) return;
  
  sidebar = document.createElement('div');
  sidebar.id = 'horizontal-tabs-sidebar';
  sidebar.className = 'horizontal-tabs-sidebar';
  
  document.body.appendChild(sidebar);
  
  // Adjust viewport and transform everything
  const style = document.createElement('style');
  style.id = 'horizontal-tabs-style-override';
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
    #horizontal-tabs-sidebar {
      transform: translateX(-50px) !important;
    }
  `;
  document.head.appendChild(style);
  
  renderTabs();
}

// Render tabs in sidebar
function renderTabs() {
  if (!sidebar) return;
  
  sidebar.innerHTML = '';
  
  // Pinned tabs section
  if (currentTabs.pinned && currentTabs.pinned.length > 0) {
    const pinnedSection = document.createElement('div');
    pinnedSection.className = 'tab-section pinned-section';
    
    currentTabs.pinned.forEach(tab => {
      pinnedSection.appendChild(createTabElement(tab));
    });
    
    sidebar.appendChild(pinnedSection);
    
    // Divider
    const divider = document.createElement('div');
    divider.className = 'tab-divider';
    sidebar.appendChild(divider);
  }
  
  // Regular tabs section
  if (currentTabs.regular && currentTabs.regular.length > 0) {
    const regularSection = document.createElement('div');
    regularSection.className = 'tab-section regular-section';
    
    currentTabs.regular.forEach(tab => {
      regularSection.appendChild(createTabElement(tab));
    });
    
    sidebar.appendChild(regularSection);
  }
}

// Create individual tab element
function createTabElement(tab) {
  const tabEl = document.createElement('div');
  tabEl.className = 'tab-item' + (tab.active ? ' active' : '');
  tabEl.title = tab.title;
  
  // Create favicon with fallback
  if (tab.favIconUrl && tab.favIconUrl !== 'default') {
    const favicon = document.createElement('img');
    favicon.className = 'tab-favicon';
    favicon.src = tab.favIconUrl;
    
    favicon.onerror = () => {
      // Try Google's favicon service
      try {
        const fallbackUrl = `https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=32`;
        if (favicon.src !== fallbackUrl) {
          favicon.src = fallbackUrl;
        } else {
          // Final fallback to letter
          favicon.replaceWith(createLetterIcon(tab.title));
        }
      } catch (e) {
        // URL parsing failed, use letter icon
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
  icon.className = 'tab-favicon tab-letter-icon';
  icon.textContent = letter;
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
