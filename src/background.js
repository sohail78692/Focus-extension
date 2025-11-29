/* global chrome, browser */
const browserApi = typeof browser !== 'undefined' ? browser : chrome;

const DEFAULT_STATE = {
  blockedSites: [
    'www.youtube.com',
    'youtube.com',
    'twitter.com',
    'x.com',
    'facebook.com',
    'instagram.com',
    'reddit.com'
  ],
  focusTasks: [],
  pomodoro: {
    phase: 'idle',
    focusDuration: 25,
    breakDuration: 5,
    remainingSeconds: 25 * 60,
    endTimestamp: null,
    cyclesCompleted: 0,
    autoStartBreaks: true,
    autoStartFocus: true
  }
};

const STORAGE_KEYS = Object.keys(DEFAULT_STATE);
const POMODORO_TICK_ALARM = 'focus_pomodoro_tick';
const POMODORO_END_ALARM = 'focus_pomodoro_end';

const storage = {
  async get(keys) {
    return new Promise((resolve) => browserApi.storage.local.get(keys, resolve));
  },
  async set(values) {
    return new Promise((resolve) => browserApi.storage.local.set(values, resolve));
  }
};

async function ensureDefaults() {
  const current = await storage.get(null);
  const next = {};
  STORAGE_KEYS.forEach((key) => {
    if (typeof current[key] === 'undefined') {
      next[key] = DEFAULT_STATE[key];
    }
  });
  if (Object.keys(next).length) {
    await storage.set(next);
  }
}

async function readState() {
  const state = await storage.get(STORAGE_KEYS);
  return {
    blockedSites: state.blockedSites || DEFAULT_STATE.blockedSites,
    focusTasks: state.focusTasks || [],
    pomodoro: state.pomodoro || DEFAULT_STATE.pomodoro
  };
}

async function writeBlockedSites(sites) {
  await storage.set({ blockedSites: sites });
  return sites;
}

async function writeTasks(tasks) {
  await storage.set({ focusTasks: tasks });
  return tasks;
}

async function writePomodoro(pomodoro) {
  await storage.set({ pomodoro });
  return pomodoro;
}

function remainingSeconds(endTimestamp) {
  if (!endTimestamp) return 0;
  return Math.max(0, Math.round((endTimestamp - Date.now()) / 1000));
}

async function updatePomodoroBadge(pomodoro) {
  if (!browserApi.action || !browserApi.action.setBadgeText) return;
  if (pomodoro.phase === 'idle') {
    browserApi.action.setBadgeText({ text: '' });
    return;
  }
  const minutes = Math.floor(pomodoro.remainingSeconds / 60);
  const seconds = pomodoro.remainingSeconds % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  browserApi.action.setBadgeBackgroundColor({ color: pomodoro.phase === 'focus' ? '#0a8754' : '#1c6dd0' });
  browserApi.action.setBadgeText({ text: display });
}

function schedulePomodoroAlarms(pomodoro) {
  if (!browserApi.alarms) return;
  const delayInMinutes = Math.max((pomodoro.endTimestamp - Date.now()) / 60000, 0.1);
  browserApi.alarms.create(POMODORO_END_ALARM, { delayInMinutes });
  browserApi.alarms.create(POMODORO_TICK_ALARM, { periodInMinutes: 0.5, delayInMinutes: 0.5 });
}

function clearPomodoroAlarms() {
  if (!browserApi.alarms) return;
  browserApi.alarms.clear(POMODORO_END_ALARM);
  browserApi.alarms.clear(POMODORO_TICK_ALARM);
}

async function startPhase(phase) {
  const state = await readState();
  const durationMinutes = phase === 'focus' ? state.pomodoro.focusDuration : state.pomodoro.breakDuration;
  const endTimestamp = Date.now() + durationMinutes * 60 * 1000;
  const next = {
    ...state.pomodoro,
    phase,
    endTimestamp,
    remainingSeconds: durationMinutes * 60
  };
  await writePomodoro(next);
  schedulePomodoroAlarms(next);
  await updatePomodoroBadge(next);
  broadcastPomodoro(next);
}

async function stopPomodoro() {
  clearPomodoroAlarms();
  const state = await readState();
  const next = {
    ...state.pomodoro,
    phase: 'idle',
    endTimestamp: null,
    remainingSeconds: state.pomodoro.focusDuration * 60
  };
  await writePomodoro(next);
  await updatePomodoroBadge(next);
  broadcastPomodoro(next);
}

function broadcastPomodoro(pomodoro) {
  const result = browserApi.runtime.sendMessage({ type: 'focus:pomodoroUpdate', payload: pomodoro }, () => {
    void browserApi.runtime?.lastError;
  });
  if (result && typeof result.catch === 'function') {
    result.catch(() => { });
  }
}

async function advancePhase() {
  const state = await readState();
  if (state.pomodoro.phase === 'focus') {
    const cyclesCompleted = state.pomodoro.cyclesCompleted + 1;
    const next = { ...state.pomodoro, cyclesCompleted };
    await writePomodoro(next);
    await maybeNotify('Focus complete', 'Great work! Time for a break.');
    if (next.autoStartBreaks) {
      await startPhase('break');
    } else {
      await stopPomodoro();
    }
  } else if (state.pomodoro.phase === 'break') {
    await maybeNotify('Break complete', 'Ready for the next focus session?');
    if (state.pomodoro.autoStartFocus) {
      await startPhase('focus');
    } else {
      await stopPomodoro();
    }
  }
}

async function tickPomodoro() {
  const state = await readState();
  if (state.pomodoro.phase === 'idle' || !state.pomodoro.endTimestamp) {
    clearPomodoroAlarms();
    return;
  }
  const remaining = remainingSeconds(state.pomodoro.endTimestamp);
  const next = { ...state.pomodoro, remainingSeconds: remaining };
  await writePomodoro(next);
  await updatePomodoroBadge(next);
  broadcastPomodoro(next);
}

async function maybeNotify(title, message) {
  if (!browserApi.notifications) return;
  const iconUrl = browserApi.runtime.getURL('src/assets/icon128.png');
  browserApi.notifications.create({
    type: 'basic',
    iconUrl,
    title,
    message
  });
}

async function handleMessage(message, sender) {
  switch (message?.type) {
    case 'focus:getState':
      return readState();
    case 'focus:updateBlockedSites':
      return { blockedSites: await writeBlockedSites(message.payload || []) };
    case 'focus:updateTasks':
      return { focusTasks: await writeTasks(message.payload || []) };
    case 'focus:updatePomodoroSettings':
      return { pomodoro: await writePomodoro({ ...message.payload }) };
    case 'focus:pomodoroStart':
      await startPhase('focus');
      return { ok: true };
    case 'focus:pomodoroBreak':
      await startPhase('break');
      return { ok: true };
    case 'focus:pomodoroStop':
      await stopPomodoro();
      return { ok: true };
    case 'focus:closeTab':
      if (sender?.tab?.id && browserApi.tabs?.remove) {
        browserApi.tabs.remove(sender.tab.id);
      }
      return { ok: true };
    case 'focus:showPopup':
      if (browserApi.runtime.openOptionsPage) {
        browserApi.runtime.openOptionsPage();
      }
      return { ok: true };
    default:
      return null;
  }
}

browserApi.runtime.onInstalled.addListener(() => {
  ensureDefaults();
});

browserApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((result) => sendResponse(result))
    .catch((err) => {
      console.error('Focus extension message error', err);
      sendResponse({ error: err.message });
    });
  return true;
});

if (browserApi.alarms) {
  browserApi.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POMODORO_TICK_ALARM) {
      tickPomodoro();
    } else if (alarm.name === POMODORO_END_ALARM) {
      advancePhase();
    }
  });
}

browserApi.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.blockedSites) {
    broadcastBlockedSites(changes.blockedSites.newValue || []);
  }
});

async function broadcastBlockedSites(blockedSites) {
  if (!browserApi.tabs) return;
  const tabs = await new Promise((resolve) => browserApi.tabs.query({}, resolve));
  tabs.forEach((tab) => {
    if (!tab.id) return;
    browserApi.tabs.sendMessage(tab.id, { type: 'focus:blocklistUpdated', payload: blockedSites }, () => void browserApi.runtime.lastError);
  });
}

ensureDefaults()
  .then(readState)
  .then(({ pomodoro }) => {
    if (pomodoro.phase !== 'idle' && pomodoro.endTimestamp) {
      schedulePomodoroAlarms(pomodoro);
      updatePomodoroBadge(pomodoro);
    } else {
      clearPomodoroAlarms();
    }
  })
  .catch((err) => console.error('Failed to initialise focus extension', err));

