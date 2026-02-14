// Vertical Tabs - Popup settings
let currentSite = '';

async function loadSettings() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  
  try {
    const url = new URL(tab.url);
    currentSite = url.hostname;
  } catch (e) {
    currentSite = 'this page';
  }
  
  document.getElementById('current-site-name').textContent = currentSite;
  
  const settings = await chrome.storage.sync.get({
    enabled: true,
    mode: 'push',
    siteSettings: {}
  });
  
  document.getElementById('enabled-global').checked = settings.enabled;
  document.getElementById('mode-global').value = settings.mode;
  
  const siteConfig = settings.siteSettings[currentSite] || {};
  document.getElementById('enabled-site').checked = siteConfig.enabled !== false;
  document.getElementById('mode-site').value = siteConfig.mode || 'default';
}

document.getElementById('save-btn').addEventListener('click', async () => {
  const settings = await chrome.storage.sync.get({ siteSettings: {} });
  
  const newSettings = {
    enabled: document.getElementById('enabled-global').checked,
    mode: document.getElementById('mode-global').value,
    siteSettings: { ...settings.siteSettings }
  };
  
  newSettings.siteSettings[currentSite] = {
    enabled: document.getElementById('enabled-site').checked,
    mode: document.getElementById('mode-site').value
  };
  
  await chrome.storage.sync.set(newSettings);
  
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.reload(tabs[0].id);
  
  window.close();
});

loadSettings();