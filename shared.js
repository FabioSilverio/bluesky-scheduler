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
  // Bluesky server-side limit for images is about 976KB; use a safe 950KB.
  const MAX_IMAGE_BYTES = 950 * 1024; // ~0.95 MB (safe below 976KB)
  const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB

  const payloads = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isVideo = file.type.startsWith('video/');
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

    if (isVideo) {
      if (file.size > maxBytes) {
        // Tentar comprimir o vídeo abaixo do limite
        const compressed = await compressVideoIfNeeded(file, MAX_VIDEO_BYTES);
        if (!compressed) {
          throw new Error(`Arquivo muito grande: ${file.name} (${Math.round(file.size/1024/1024)}MB). Limite: 50MB (vídeo)`);
        }
        payloads.push({
          name: file.name.replace(/\.[^.]+$/, '') + '.webm',
          type: compressed.mimeType,
          alt: alts?.[i] || '',
          dataUrl: compressed.dataUrl,
        });
        continue;
      }
      payloads.push({
        name: file.name,
        type: file.type,
        alt: alts?.[i] || '',
        dataUrl: await fileToDataUrl(file),
      });
    } else {
      // Imagem: comprimir se necessário para ficar abaixo de ~950KB
      const { dataUrl, outMimeType } = await compressImageIfNeeded(file, MAX_IMAGE_BYTES);
      payloads.push({
        name: file.name,
        type: outMimeType,
        alt: alts?.[i] || '',
        dataUrl,
      });
    }
  }
  return sendMessage({ type: 'uploadMedia', payloads });
}

/**
 * Compress an image file to be under maxBytes using canvas downscale and JPEG quality adjustments.
 * Returns a dataUrl and mime type used.
 */
async function compressImageIfNeeded(file, maxBytes) {
  const originalDataUrl = await fileToDataUrl(file);
  const originalBytes = estimateDataUrlBytes(originalDataUrl);
  if (originalBytes <= maxBytes) {
    return { dataUrl: originalDataUrl, outMimeType: file.type || 'image/jpeg' };
  }

  const image = await loadHtmlImage(originalDataUrl);
  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  let quality = 0.9;
  let attempts = 0;
  let dataUrl = originalDataUrl;
  const MAX_DIMENSION = 2048; // start with 2048px cap for the largest side

  // Initial downscale if very large
  if (Math.max(width, height) > MAX_DIMENSION) {
    const ratio = MAX_DIMENSION / Math.max(width, height);
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));
  }

  while (attempts < 10) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);

    dataUrl = canvas.toDataURL('image/jpeg', quality);
    const size = estimateDataUrlBytes(dataUrl);
    if (size <= maxBytes) {
      return { dataUrl, outMimeType: 'image/jpeg' };
    }

    // Next attempt: first reduce quality, then reduce dimensions
    if (quality > 0.5) {
      quality -= 0.15;
    } else {
      width = Math.max(320, Math.round(width * 0.85));
      height = Math.max(320, Math.round(height * 0.85));
      quality = 0.9;
    }
    attempts += 1;
  }

  // Fallback: return the last attempt even if over the limit
  return { dataUrl, outMimeType: 'image/jpeg' };
}

function estimateDataUrlBytes(dataUrl) {
  try {
    const base64 = dataUrl.split(',')[1] || '';
    return atob(base64).length;
  } catch {
    return dataUrl.length; // rough fallback
  }
}

function loadHtmlImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Compress video using MediaRecorder + Offscreen/Canvas scaling to WebM.
 * Returns { dataUrl, mimeType } or null if not possible.
 */
async function compressVideoIfNeeded(file, maxBytes) {
  if (!('MediaRecorder' in window)) return null;
  const URL_ = (window.URL || window.webkitURL);
  const objectUrl = URL_.createObjectURL(file);
  try {
    const result1 = await transcodeToWebM(objectUrl, {
      targetWidth: 1280,
      targetHeight: 720,
      fps: 30,
      videoBitsPerSecond: 2_200_000,
      maxDurationSec: 60,
    });
    if (result1.blob.size <= maxBytes) {
      return { dataUrl: await blobToDataUrl(result1.blob), mimeType: result1.mimeType };
    }
    // Retry lower bitrate/resolution
    const result2 = await transcodeToWebM(objectUrl, {
      targetWidth: 854,
      targetHeight: 480,
      fps: 30,
      videoBitsPerSecond: 1_200_000,
      maxDurationSec: 60,
    });
    return { dataUrl: await blobToDataUrl(result2.blob), mimeType: result2.mimeType };
  } catch (e) {
    console.warn('Video compression failed', e);
    return null;
  } finally {
    URL_.revokeObjectURL(objectUrl);
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

async function transcodeToWebM(objectUrl, opts) {
  const { targetWidth, targetHeight, fps, videoBitsPerSecond, maxDurationSec } = opts;
  const video = document.createElement('video');
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  await video.play().catch(() => {});
  await waitForMetadata(video);

  const scale = Math.min(targetWidth / video.videoWidth, targetHeight / video.videoHeight, 1);
  const outW = Math.max(1, Math.round(video.videoWidth * scale));
  const outH = Math.max(1, Math.round(video.videoHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');

  const stream = canvas.captureStream(fps || 30);
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm;codecs=vp8';
  const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond });
  const chunks = [];
  mr.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  const stopped = new Promise(resolve => { mr.onstop = resolve; });
  mr.start(100);

  const start = performance.now();
  let ended = false;
  const draw = () => {
    if (ended) return;
    ctx.drawImage(video, 0, 0, outW, outH);
    const elapsedSec = (performance.now() - start) / 1000;
    if (video.ended || elapsedSec >= maxDurationSec) {
      ended = true;
      mr.stop();
      return;
    }
    requestAnimationFrame(draw);
  };
  draw();
  await stopped;
  const blob = new Blob(chunks, { type: mime });
  return { blob, mimeType: mime };
}

function waitForMetadata(video) {
  return new Promise(resolve => {
    if (video.readyState >= 1) return resolve();
    video.onloadedmetadata = () => resolve();
  });
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
