import { getOptions, saveOptions } from './shared.js';

const serviceUrlInput = document.getElementById('service-url');
const notifyInput = document.getElementById('notify');
const saveBtn = document.getElementById('save-options');
const msg = document.getElementById('options-msg');

async function init() {
  const { service = 'https://bsky.social', notify = true } = await getOptions();
  serviceUrlInput.value = service;
  notifyInput.checked = !!notify;
}

saveBtn.addEventListener('click', async () => {
  const service = serviceUrlInput.value.trim() || 'https://bsky.social';
  const notify = !!notifyInput.checked;
  await saveOptions({ service, notify });
  msg.textContent = 'Salvo!';
});

init();
