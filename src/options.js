/* global chrome, browser */
const optionsApi = typeof browser !== 'undefined' ? browser : chrome;

const els = {
  form: document.getElementById('pomodoro-form'),
  focusMinutes: document.getElementById('focus-minutes'),
  breakMinutes: document.getElementById('break-minutes'),
  autoStartBreaks: document.getElementById('auto-start-breaks'),
  autoStartFocus: document.getElementById('auto-start-focus'),
  status: document.getElementById('save-status')
};

let pomodoroState = null;

function sendMessage(type, payload) {
  return new Promise((resolve, reject) => {
    optionsApi.runtime.sendMessage({ type, payload }, (response) => {
      const error = optionsApi.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}

async function load() {
  const { pomodoro } = await sendMessage('focus:getState');
  pomodoroState = pomodoro;
  els.focusMinutes.value = pomodoro.focusDuration;
  els.breakMinutes.value = pomodoro.breakDuration;
  els.autoStartBreaks.checked = pomodoro.autoStartBreaks;
  els.autoStartFocus.checked = pomodoro.autoStartFocus;
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!pomodoroState) return;
  const focusDuration = Number(els.focusMinutes.value);
  const breakDuration = Number(els.breakMinutes.value);
  const autoStartBreaks = els.autoStartBreaks.checked;
  const autoStartFocus = els.autoStartFocus.checked;
  const nextState = {
    ...pomodoroState,
    focusDuration,
    breakDuration,
    autoStartBreaks,
    autoStartFocus
  };
  if (nextState.phase === 'idle') {
    nextState.remainingSeconds = focusDuration * 60;
  }
  await sendMessage('focus:updatePomodoroSettings', nextState);
  els.status.textContent = 'Saved!';
  setTimeout(() => {
    els.status.textContent = '';
  }, 2000);
}

els.form.addEventListener('submit', handleSubmit);
load();

