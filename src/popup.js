/* global chrome, browser */
const popupApi = typeof browser !== 'undefined' ? browser : chrome;

const state = {
  blockedSites: [],
  focusTasks: [],
  pomodoro: null
};

const els = {
  timerPhase: document.getElementById('timer-phase'),
  timerValue: document.getElementById('timer-value'),
  timerCycles: document.getElementById('timer-cycles'),
  btnStart: document.getElementById('btn-start'),
  btnBreak: document.getElementById('btn-break'),
  btnStop: document.getElementById('btn-stop'),
  taskList: document.getElementById('task-list'),
  taskForm: document.getElementById('task-form'),
  taskInput: document.getElementById('task-input'),
  btnOverlay: document.getElementById('btn-overlay'),
  blockList: document.getElementById('block-list'),
  blockForm: document.getElementById('block-form'),
  blockInput: document.getElementById('block-input'),
  btnOptions: document.getElementById('btn-options')
};

function sendMessage(type, payload) {
  return new Promise((resolve, reject) => {
    popupApi.runtime.sendMessage({ type, payload }, (response) => {
      const error = popupApi.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}

async function loadState() {
  const data = await sendMessage('focus:getState');
  state.blockedSites = data.blockedSites || [];
  state.focusTasks = data.focusTasks || [];
  state.pomodoro = data.pomodoro;
  renderAll();
}

function renderAll() {
  renderPomodoro();
  renderTasks();
  renderBlocks();
}

let timerInterval = null;

function renderPomodoro() {
  const pomodoro = state.pomodoro;
  if (!pomodoro) return;

  els.timerPhase.textContent = pomodoro.phase;
  els.timerCycles.textContent = pomodoro.cyclesCompleted ?? 0;
  els.btnStart.disabled = pomodoro.phase === 'focus';
  els.btnBreak.disabled = pomodoro.phase === 'break';
  els.btnStop.disabled = pomodoro.phase === 'idle';

  if (pomodoro.phase === 'idle' || !pomodoro.endTimestamp) {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    els.timerValue.textContent = formatTime(pomodoro.remainingSeconds || pomodoro.focusDuration * 60);
  } else {
    updateTimerDisplay();
    if (!timerInterval) {
      timerInterval = setInterval(updateTimerDisplay, 1000);
    }
  }
}

function updateTimerDisplay() {
  const pomodoro = state.pomodoro;
  if (!pomodoro || !pomodoro.endTimestamp) return;
  const remaining = Math.max(0, Math.round((pomodoro.endTimestamp - Date.now()) / 1000));
  els.timerValue.textContent = formatTime(remaining);
}

function renderTasks() {
  els.taskList.innerHTML = '';
  if (!state.focusTasks.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No focus tasks yet.';
    empty.style.color = '#94a3b8';
    els.taskList.appendChild(empty);
    return;
  }
  state.focusTasks.forEach((task) => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '8px';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    checkbox.addEventListener('change', () => toggleTask(task.id));
    const span = document.createElement('span');
    span.textContent = task.title;
    if (task.completed) span.style.textDecoration = 'line-through';
    label.append(checkbox, span);
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.classList.add('ghost');
    removeBtn.addEventListener('click', () => removeTask(task.id));
    li.append(label, removeBtn);
    els.taskList.appendChild(li);
  });
}

function renderBlocks() {
  els.blockList.innerHTML = '';
  if (!state.blockedSites.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No blocked sites yet.';
    empty.style.color = '#94a3b8';
    els.blockList.appendChild(empty);
    return;
  }
  state.blockedSites.forEach((site) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = site;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.classList.add('ghost');
    removeBtn.addEventListener('click', () => removeBlockedSite(site));
    li.append(span, removeBtn);
    els.blockList.appendChild(li);
  });
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
}

function createTask(title) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: title.trim(),
    completed: false,
    createdAt: Date.now()
  };
}

async function addTask(event) {
  event.preventDefault();
  const value = els.taskInput.value.trim();
  if (!value) return;
  state.focusTasks = [createTask(value), ...state.focusTasks];
  els.taskInput.value = '';
  renderTasks();
  await sendMessage('focus:updateTasks', state.focusTasks);
}

async function toggleTask(id) {
  state.focusTasks = state.focusTasks.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task));
  renderTasks();
  await sendMessage('focus:updateTasks', state.focusTasks);
}

async function removeTask(id) {
  state.focusTasks = state.focusTasks.filter((task) => task.id !== id);
  renderTasks();
  await sendMessage('focus:updateTasks', state.focusTasks);
}

async function addBlockedSite(event) {
  event.preventDefault();
  const value = els.blockInput.value.trim().replace(/^https?:\/\//i, '');
  if (!value || state.blockedSites.includes(value)) return;
  state.blockedSites = [value, ...state.blockedSites];
  els.blockInput.value = '';
  renderBlocks();
  await sendMessage('focus:updateBlockedSites', state.blockedSites);
}

async function removeBlockedSite(site) {
  state.blockedSites = state.blockedSites.filter((item) => item !== site);
  renderBlocks();
  await sendMessage('focus:updateBlockedSites', state.blockedSites);
}

async function startFocus() {
  await sendMessage('focus:pomodoroStart');
}

async function startBreak() {
  await sendMessage('focus:pomodoroBreak');
}

async function stopPomodoro() {
  await sendMessage('focus:pomodoroStop');
}

function openOptions() {
  if (popupApi.runtime.openOptionsPage) {
    popupApi.runtime.openOptionsPage();
  }
}

async function showOverlay() {
  const [tab] = await new Promise((resolve) => popupApi.tabs.query({ active: true, currentWindow: true }, resolve));
  if (!tab?.id) return;

  popupApi.tabs.sendMessage(tab.id, { type: 'focus:showOverlay', payload: state.focusTasks }, (response) => {
    const error = popupApi.runtime.lastError;
    if (error) {
      console.error('Overlay error:', error);
      // If the content script isn't ready, it usually means the extension was just installed/reloaded
      // and the page hasn't been refreshed.
      alert('Please reload the page to use the overlay.');
    }
  });
}

function registerEvents() {
  els.taskForm.addEventListener('submit', addTask);
  els.blockForm.addEventListener('submit', addBlockedSite);
  els.btnStart.addEventListener('click', startFocus);
  els.btnBreak.addEventListener('click', startBreak);
  els.btnStop.addEventListener('click', stopPomodoro);
  els.btnOptions.addEventListener('click', openOptions);
  els.btnOverlay.addEventListener('click', showOverlay);

  popupApi.runtime.onMessage.addListener((message) => {
    if (message?.type === 'focus:pomodoroUpdate') {
      state.pomodoro = message.payload;
      renderPomodoro();
    }
  });
}

registerEvents();
loadState();

