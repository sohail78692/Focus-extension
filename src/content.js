/* global chrome, browser */
const contentApi = typeof browser !== 'undefined' ? browser : chrome;

let blockedSites = [];
let overlayRoot = null;
let blockApplied = false;

const storageSync = {
  async get(key) {
    return new Promise((resolve) => contentApi.storage.local.get(key, resolve));
  }
};

function hostnameMatches(hostname, candidate) {
  return hostname === candidate || hostname.endsWith(`.${candidate}`);
}

function isBlocked(hostname) {
  return blockedSites.some((site) => hostnameMatches(hostname, site));
}

function applyBlock(hostname) {
  if (blockApplied) return;
  blockApplied = true;
  document.documentElement.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Inter,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#f8fafc;padding:24px;box-sizing:border-box;';
  wrapper.innerHTML = `
    <div style="max-width:480px;text-align:center">
      <h1 style="font-size:32px;margin-bottom:12px;">Stay Focused</h1>
      <p style="font-size:16px;line-height:1.6;margin-bottom:24px;">
        <strong>${hostname}</strong> is on your blocked list. Take a breath and reconnect with your focus tasks.
      </p>
      <div style="display:flex;gap:12px;justify-content:center;">
        <button id="focus-open-popup" style="padding:10px 18px;border-radius:999px;border:none;background:#14b8a6;color:#04121f;font-weight:600;cursor:pointer;">
          Open focus board
        </button>
        <button id="focus-close-tab" style="padding:10px 18px;border-radius:999px;border:1px solid #475569;background:transparent;color:#e2e8f0;font-weight:600;cursor:pointer;">
          Close tab
        </button>
      </div>
    </div>
  `;
  const host = document.body || document.documentElement;
  host.appendChild(wrapper);
  document.getElementById('focus-close-tab').addEventListener('click', () => {
    contentApi.runtime.sendMessage({ type: 'focus:closeTab' });
  });
  document.getElementById('focus-open-popup').addEventListener('click', () => {
    contentApi.runtime.sendMessage({ type: 'focus:showPopup' });
  });
}

function teardownOverlay() {
  overlayRoot?.remove();
  overlayRoot = null;
}

function renderOverlay(tasks = []) {
  teardownOverlay();
  overlayRoot = document.createElement('aside');
  overlayRoot.id = 'focus-overlay';
  overlayRoot.style.cssText =
    'position:fixed;top:24px;right:24px;width:280px;max-height:80vh;overflow:auto;background:#020617;color:#e2e8f0;border:1px solid #1e293b;border-radius:16px;box-shadow:0 20px 60px rgba(2,6,23,0.6);z-index:2147483647;padding:16px;font-family:Inter,Segoe UI,Roboto,sans-serif;';
  const items = tasks.length
    ? tasks.map((task) => `<li style="margin-bottom:8px;display:flex;align-items:center;gap:8px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${task.completed ? '#64748b' : '#22d3ee'};"></span>
          <span style="text-decoration:${task.completed ? 'line-through' : 'none'}">${task.title}</span>
        </li>`).join('')
    : '<li style="color:#94a3b8;">No focus tasks yet.</li>';
  overlayRoot.innerHTML = `
    <header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div>
        <p style="font-size:12px;color:#94a3b8;margin:0;">Focus Tasks</p>
        <h2 style="font-size:18px;margin:0;">Stay on track</h2>
      </div>
      <button id="focus-overlay-close" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;">×</button>
    </header>
    <ul style="list-style:none;padding:0;margin:0;">${items}</ul>
  `;
  const host = document.body || document.documentElement;
  host.appendChild(overlayRoot);
  document.getElementById('focus-overlay-close').addEventListener('click', teardownOverlay);
}

let pomodoroState = null;

async function initBlocker() {
  const data = await storageSync.get(['blockedSites', 'pomodoro']);
  blockedSites = data.blockedSites || [];
  pomodoroState = data.pomodoro || null;
  checkAndApplyBlock();
}

function checkAndApplyBlock() {
  const isFocusPhase = pomodoroState?.phase === 'focus';
  if (isFocusPhase && isBlocked(window.location.hostname)) {
    applyBlock(window.location.hostname);
  } else if (!isFocusPhase && blockApplied) {
    // If we are no longer in focus phase, we should probably reload to unblock
    // or just remove the overlay if we can restore the original content.
    // For now, reloading is the safest way to restore the original page content
    // if we nuked document.documentElement.innerHTML.
    window.location.reload();
  }
}

contentApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'focus:blocklistUpdated') {
    blockedSites = message.payload || [];
    checkAndApplyBlock();
  } else if (message?.type === 'focus:pomodoroUpdate') {
    pomodoroState = message.payload;
    checkAndApplyBlock();
  } else if (message?.type === 'focus:showOverlay') {
    renderOverlay(message.payload || []);
  } else if (message?.type === 'focus:hideOverlay') {
    teardownOverlay();
  }
  sendResponse?.({ ok: true });
  return true;
});

initBlocker();

