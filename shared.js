// Utilitários compartilhados entre popup, options e background

export async function getOptions() {
  return new Promise(resolve => {
    chrome.storage.local.get(['options'], data => {
      resolve(data.options || {});
    });
  });
}

export async function saveOptions(options) {
  return new Promise(resolve => {
    chrome.storage.local.set({ options }, resolve);
  });
}

export async function getAuth() {
  return new Promise(resolve => {
    chrome.storage.local.get(['auth'], data => resolve(data.auth || {}));
  });
}

export async function saveAuth(auth) {
  return new Promise(resolve => {
    chrome.storage.local.set({ auth }, resolve);
  });
}

export async function ensureLoggedIn() {
  return sendMessage({ type: 'ensureLoggedIn' });
}

export async function uploadMediaFiles(files, alts) {
  if (!files || files.length === 0) return [];
  const payloads = await Promise.all(files.map(async (file, index) => ({
    name: file.name,
    type: file.type,
    alt: alts?.[index] || '',
    dataUrl: await fileToDataUrl(file),
  })));
  return sendMessage({ type: 'uploadMedia', payloads });
}

export async function schedulePosts({ text, media, date, times }) {
  return sendMessage({ type: 'schedulePosts', text, media, date, times });
}

export async function postNow({ text, media }) {
  return sendMessage({ type: 'postNow', text, media });
}

export async function refreshQueueList(ulElement) {
  const queue = await sendMessage({ type: 'getQueue' });
  ulElement.innerHTML = '';
  queue.forEach(item => {
    const li = document.createElement('li');
    li.className = 'queue-item';
    const when = new Date(item.when).toLocaleString();
    const mediaCount = (item.mediaRaw?.length || item.media?.length || 0);
    const mediaIndicator = mediaCount > 0 ? ` 📎${mediaCount}` : '';
    li.innerHTML = `<div class="when">${when}${mediaIndicator}</div><div class="text">${escapeHtml(item.text).slice(0, 200)}</div>`;
    ulElement.appendChild(li);
  });
}

export function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      const lastError = chrome.runtime.lastError;
      if (lastError) return reject(lastError);
      if (response && response.error) return reject(new Error(response.error));
      resolve(response?.data);
    });
  });
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(str) {
  return (str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
