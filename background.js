// Background service worker (MV3)
// - Gerencia autenticação, uploads e publicação no Bluesky
// - Mantém fila e agendamentos com chrome.alarms

const BLUESKY_DEFAULT_SERVICE = 'https://bsky.social';

// Estados em memória do worker (não persistentes)
let agentSession = null; // { did, handle, accessJwt, refreshJwt }
let logs = []; // Array de logs para mostrar no popup

chrome.runtime.onInstalled.addListener(() => {
  // inicializar estrutura de armazenamento
  chrome.storage.local.get(['queue', 'options'], data => {
    if (!data.queue) chrome.storage.local.set({ queue: [] });
    if (!data.options) chrome.storage.local.set({ options: { service: BLUESKY_DEFAULT_SERVICE, notify: true } });
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(data => sendResponse({ data })).catch(err => sendResponse({ error: err?.message || String(err) }));
  return true;
});

chrome.alarms.onAlarm.addListener(async alarm => {
  console.log('⏰ Alarm triggered:', alarm);
  addLog('info', `⏰ Alarm disparado: ${alarm?.name || 'desconhecido'}`);
  if (!alarm?.name?.startsWith('post:')) {
    console.log('❌ Alarm name does not start with "post:", ignoring');
    addLog('warning', 'Alarm ignorado: nome não inicia com post:');
    return;
  }
  const id = alarm.name.slice('post:'.length);
  console.log('🎯 Processing scheduled post:', id);
  addLog('info', `🎯 Processando agendado: ${id}`);
  await publishScheduled(id);
});

async function handleMessage(message) {
  switch (message.type) {
    case 'ensureLoggedIn':
      await ensureAgentSession();
      return { ok: true };
    case 'uploadMedia':
      return await handleUploadMedia(message.payloads);
    case 'schedulePosts':
      return await handleSchedule(message);
    case 'postNow':
      return await handlePostNow(message);
    case 'getQueue':
      return await getQueue();
    case 'testAlarm':
      return await testAlarm();
    case 'clearAllAlarms':
      return await clearAllAlarms();
    case 'debugAlarms':
      return await debugAlarms();
    case 'getLogs':
      return getLogs();
    case 'clearLogs':
      return clearLogs();
    default:
      throw new Error('Mensagem desconhecida');
  }
}

async function testAlarm() {
  const testTime = Date.now() + 30000; // 30 segundos no futuro
  const testId = 'test-' + Date.now();
  console.log('🧪 Creating test alarm in 30 seconds:', { id: testId, when: new Date(testTime).toLocaleString() });
  
  chrome.alarms.create('post:' + testId, { when: testTime });
  
  // Adicionar item de teste na fila
  const queue = await getQueue();
  queue.push({ id: testId, when: testTime, text: 'TESTE - Post agendado funcionando!', media: [] });
  await setInStorage('queue', queue);
  
  return { testId, scheduledFor: new Date(testTime).toLocaleString() };
}

async function clearAllAlarms() {
  const alarms = await chrome.alarms.getAll();
  console.log('🧹 Clearing all alarms:', alarms.length);
  
  for (const alarm of alarms) {
    if (alarm.name.startsWith('post:')) {
      chrome.alarms.clear(alarm.name);
      console.log('🗑️ Cleared alarm:', alarm.name);
    }
  }
  
  // Limpar fila também
  await setInStorage('queue', []);
  return { cleared: alarms.length };
}

async function debugAlarms() {
  const alarms = await chrome.alarms.getAll();
  const queue = await getQueue();
  const now = Date.now();
  
  console.log('🔍 DEBUG COMPLETE STATE:');
  console.log('Current time:', new Date(now).toLocaleString());
  console.log('Active alarms:', alarms.length);
  console.log('Queue items:', queue.length);
  
  const result = {
    currentTime: new Date(now).toLocaleString(),
    timestamp: now,
    alarms: alarms.map(a => ({
      name: a.name,
      scheduledTime: new Date(a.scheduledTime).toLocaleString(),
      timestamp: a.scheduledTime,
      minutesFromNow: Math.round((a.scheduledTime - now) / 60000),
      isPast: a.scheduledTime <= now
    })),
    queue: queue.map(q => ({
      id: q.id,
      when: new Date(q.when).toLocaleString(),
      timestamp: q.when,
      text: q.text?.slice(0, 50),
      hasMediaRaw: !!q.mediaRaw,
      mediaCount: q.mediaRaw?.length || 0,
      minutesFromNow: Math.round((q.when - now) / 60000),
      isPast: q.when <= now
    }))
  };
  
  alarms.forEach(alarm => {
    console.log(`⏰ Alarm: ${alarm.name} → ${new Date(alarm.scheduledTime).toLocaleString()}`);
  });
  
  queue.forEach(item => {
    console.log(`📝 Queue: ${item.id} → ${new Date(item.when).toLocaleString()} → "${item.text?.slice(0, 30)}"`);
  });
  
  return result;
}

function addLog(type, message) {
  const timestamp = new Date().toLocaleTimeString();
  logs.unshift({ type, message, timestamp });
  if (logs.length > 20) logs.pop(); // Manter apenas 20 logs
  console.log(`[${timestamp}] ${type.toUpperCase()}: ${message}`);
}

function getLogs() {
  return logs;
}

function clearLogs() {
  logs = [];
  return { cleared: true };
}

async function ensureAgentSession() {
  const auth = await getFromStorage('auth');
  const options = await getFromStorage('options');
  if (!auth?.identifier || !auth?.password) throw new Error('Faça login no popup com App Password.');
  const service = options?.service || BLUESKY_DEFAULT_SERVICE;

  // Se já existe e válido, manter
  if (agentSession?.accessJwt && agentSession?.service === service) {
    return agentSession;
  }

  addLog('info', `🔐 Fazendo login no Bluesky: ${auth.identifier}`);

  // Login via com.atproto.server.createSession
  const res = await fetch(service + '/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: auth.identifier, password: auth.password })
  });
  
  const responseText = await res.text();
  if (!res.ok) {
    addLog('error', `❌ Erro no login: ${res.status} - ${responseText}`);
    throw new Error(`Falha ao autenticar no Bluesky: ${res.status} - ${responseText}`);
  }
  
  const data = JSON.parse(responseText);
  agentSession = { ...data, service };
  addLog('success', `✅ Login bem-sucedido! ${agentSession.handle}`);
  return agentSession;
}

async function refreshSessionIfNeeded() {
  if (!agentSession?.refreshJwt) return;
  const res = await fetch(agentSession.service + '/xrpc/com.atproto.server.refreshSession', { headers: { 'Authorization': 'Bearer ' + agentSession.refreshJwt } });
  if (res.ok) {
    const data = await res.json();
    agentSession = { ...agentSession, ...data };
  }
}

async function handleUploadMedia(payloads) {
  await ensureAgentSession();
  const uploaded = [];
  for (const p of payloads) {
    const blob = dataUrlToBlob(p.dataUrl, p.type);
    const blobRes = await uploadBlob(blob, p.type);
    // blobRes tem formato { blob: { $type: 'blob', ref: { $link }, mimeType, size } }
    // Precisamos passar APENAS o objeto em blob
    uploaded.push({ blob: blobRes?.blob || blobRes, alt: p.alt, type: p.type });
  }
  return uploaded;
}

async function handleSchedule(msg) {
  const { text, media, date, times } = msg;
  addLog('info', `📅 Agendando: ${times.length} horários para "${text?.slice(0, 30)}"`);
  console.log('📅 Scheduling posts:', { date, times, text: text?.slice(0, 50), mediaCount: media?.length || 0 });
  
  // NÃO fazer upload agora - salvar dados raw da mídia para upload posterior
  const mediaForStorage = media?.map(m => ({
    type: m.type,
    alt: m.alt,
    dataUrl: m.dataUrl, // Manter dataUrl para upload posterior
    name: m.name
  })) || [];
  
  console.log('💾 Media prepared for storage:', mediaForStorage.length, 'items');
  
  const toCreate = [];
  for (const t of times) {
    const when = parseDateTimeLocal(date, t);
    if (!when) {
      console.log('❌ Invalid time format:', { date, time: t });
      continue;
    }
    const id = cryptoRandomId();
    const timestamp = when.getTime();
    const now = Date.now();
    
    // Verificar se o horário é no futuro (sem margem, apenas verificar se não é passado)
    if (timestamp <= now) {
      console.log('❌ Skipping past time:', { 
        when: when.toLocaleString(), 
        now: new Date(now).toLocaleString(),
        pastByMinutes: Math.round((now - timestamp) / 60000)
      });
      continue;
    }
    
    console.log('⏰ Scheduling for:', { 
      id, 
      when: when.toLocaleString(), 
      timestamp, 
      now, 
      inFuture: timestamp > now,
      minutesFromNow: Math.round((timestamp - now) / 60000)
    });
    
    toCreate.push({ id, when: timestamp, text, mediaRaw: mediaForStorage });
  }
  
  if (toCreate.length === 0) {
    console.log('❌ No valid times created from:', times);
    const now = new Date();
    throw new Error(`Nenhum horário válido encontrado. O horário deve ser no futuro. Agora: ${now.toLocaleTimeString()}`);
  }
  
  addLog('success', `✅ Criados ${toCreate.length} agendamentos`);
  console.log(`✅ Created ${toCreate.length} scheduled posts from ${times.length} input times`);

  const queue = await getQueue();
  const newQueue = [...queue, ...toCreate].sort((a, b) => a.when - b.when);
  await setInStorage('queue', newQueue);
  
  // Criar alarms
  for (const item of toCreate) {
    const alarmName = 'post:' + item.id;
    console.log('🔔 Creating alarm:', { 
      name: alarmName, 
      when: item.when, 
      date: new Date(item.when).toLocaleString(),
      nowTimestamp: Date.now(),
      whenTimestamp: item.when,
      deltaMs: item.when - Date.now(),
      deltaMinutes: Math.round((item.when - Date.now()) / 60000)
    });
    addLog('info', `🔔 Criando alarm para ${new Date(item.when).toLocaleTimeString()} (${alarmName})`);
    
    try {
      // Usar chrome.alarms.create de forma mais explícita
      chrome.alarms.create(alarmName, { when: item.when });
      console.log('✅ Alarm created successfully:', alarmName);
      addLog('success', `✅ Alarm criado: ${alarmName}`);
      
      // Verificar se foi realmente criado
      setTimeout(async () => {
        const alarm = await chrome.alarms.get(alarmName);
        if (alarm) {
          console.log('✅ Alarm confirmed in system:', {
            name: alarm.name,
            scheduledTime: alarm.scheduledTime,
            scheduledDate: new Date(alarm.scheduledTime).toLocaleString()
          });
          addLog('success', `⏱️ Confirmado para ${new Date(alarm.scheduledTime).toLocaleTimeString()}`);
        } else {
          console.error('❌ Alarm not found after creation:', alarmName);
          addLog('error', `❌ Alarm não encontrado após criação: ${alarmName}`);
        }
      }, 100);
      
    } catch (error) {
      console.error('❌ Failed to create alarm:', alarmName, error);
      addLog('error', `❌ Falha ao criar alarm: ${alarmName}`);
    }
  }
  
  // Verificar alarms criados após pequeno delay
  setTimeout(async () => {
    const allAlarms = await chrome.alarms.getAll();
    console.log('📋 All active alarms after creation:', allAlarms.map(a => ({ 
      name: a.name, 
      when: new Date(a.scheduledTime).toLocaleString(),
      minutesFromNow: Math.round((a.scheduledTime - Date.now()) / 60000)
    })));
    addLog('info', `📋 Alarms ativos: ${allAlarms.length}`);
  }, 200);
  
  return true;
}

async function handlePostNow(msg) {
  await ensureAgentSession();
  await publishRecord({ text: msg.text, media: msg.media || [] });
  return true;
}

async function publishScheduled(id) {
  console.log('🚀 Publishing scheduled post:', id);
  const queue = await getQueue();
  const item = queue.find(q => q.id === id);
  
  if (!item) {
    console.log('❌ Scheduled post not found in queue:', id);
    return;
  }
  
  console.log('📄 Found post to publish:', { 
    text: item.text?.slice(0, 50), 
    hasMediaRaw: !!item.mediaRaw,
    mediaRawCount: item.mediaRaw?.length || 0,
    hasOldMedia: !!item.media,
    oldMediaCount: item.media?.length || 0
  });
  
  try {
    await ensureAgentSession();
    
    // Fazer upload da mídia agora (se houver)
    let processedMedia = [];
    if (item.mediaRaw && item.mediaRaw.length > 0) {
      console.log('📤 Uploading media at publish time...');
      const uploadPayloads = item.mediaRaw.map(m => ({
        name: m.name,
        type: m.type,
        alt: m.alt,
        dataUrl: m.dataUrl
      }));
      processedMedia = await handleUploadMedia(uploadPayloads);
      console.log('✅ Media uploaded successfully:', processedMedia.length, 'items');
    } else if (item.media) {
      // Fallback para formato antigo
      processedMedia = item.media;
    }
    
    await publishRecord({ text: item.text, media: processedMedia });
    
    // Remover da fila após sucesso
    const newQueue = queue.filter(q => q.id !== id);
    await setInStorage('queue', newQueue);
    console.log('✅ Post published and removed from queue');
    
    // Notificação
    if ((await getFromStorage('options'))?.notify) {
      chrome.notifications.create('posted:' + id, { 
        type: 'basic', 
        title: 'Post publicado', 
        message: 'Seu post foi publicado no Bluesky.', 
        iconUrl: 'icon-128.svg' 
      });
    }
  } catch (e) {
    console.error('❌ Failed to publish scheduled post:', e);
    // reagendar em 5 minutos
    const retryTime = Date.now() + 5 * 60 * 1000;
    console.log('🔄 Rescheduling for 5 minutes later:', new Date(retryTime).toLocaleString());
    chrome.alarms.create('post:' + id, { when: retryTime });
  }
}

async function publishRecord({ text, media }) {
  await refreshSessionIfNeeded();
  const now = new Date().toISOString();
  addLog('info', `📝 Publicando: texto=${text ? 'sim' : 'não'}, midia=${media?.length || 0}`);
  const embed = await buildEmbed(media);
  const record = {
    $type: 'app.bsky.feed.post',
    text: text || '',
    createdAt: now,
    ...(embed ? { embed } : {})
  };

  console.log('📝 Publicando post...', { text: record.text, embed: !!embed });

  // com.atproto.repo.createRecord
  const res = await fetch(agentSession.service + '/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + agentSession.accessJwt
    },
    body: JSON.stringify({
      repo: agentSession.did,
      collection: 'app.bsky.feed.post',
      record
    })
  });
  
  const responseText = await res.text();
  if (!res.ok) {
    console.error('❌ Erro ao publicar:', res.status, responseText);
    addLog('error', `❌ Erro publicar: ${res.status} - ${responseText}`);
    throw new Error(`Falha ao publicar: ${res.status} - ${responseText}`);
  }
  
  const result = JSON.parse(responseText);
  console.log('✅ Post publicado com sucesso!', result);
  addLog('success', '✅ Post publicado com sucesso!');
  return result;
}

async function buildEmbed(media) {
  if (!media || media.length === 0) return null;
  const images = media.filter(m => m.type.startsWith('image/')).slice(0, 4);
  const videos = media.filter(m => m.type.startsWith('video/')).slice(0, 1);
  
  // Vídeo nativo: usar app.bsky.embed.video
  if (videos.length > 0) {
    const v = videos[0];
    return {
      $type: 'app.bsky.embed.video',
      video: v.blob?.blob || v.blob,
      alt: v.alt || ''
    };
  }
  
  if (images.length > 0) {
    return {
      $type: 'app.bsky.embed.images',
      images: images.map(img => ({ image: img.blob?.blob || img.blob, alt: img.alt || '' }))
    };
  }
  
  return null;
}

async function uploadBlob(blob, mimeType) {
  console.log('📤 Uploading blob...', { type: mimeType, size: blob.size });
  
  const res = await fetch(agentSession.service + '/xrpc/com.atproto.repo.uploadBlob', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + agentSession.accessJwt, 'Content-Type': mimeType },
    body: blob
  });
  
  const responseText = await res.text();
  if (!res.ok) {
    console.error('❌ Erro no upload:', res.status, responseText);
    addLog('error', `❌ Upload falhou: ${res.status} - ${responseText}`);
    throw new Error(`Falha upload blob: ${res.status} - ${responseText}`);
  }
  
  const result = JSON.parse(responseText);
  console.log('✅ Upload bem-sucedido!', result);
  addLog('success', '✅ Upload bem-sucedido');
  return result; // { blob: { $type, ref: { $link }, mimeType, size } }
}

function dataUrlToBlob(dataUrl, fallbackType) {
  const parts = dataUrl.split(',');
  const header = parts[0];
  const base64 = parts[1];
  const mimeMatch = /data:(.*?);base64/.exec(header);
  const mime = mimeMatch ? mimeMatch[1] : (fallbackType || 'application/octet-stream');
  const bytes = atob(base64);
  const len = bytes.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function parseDateTimeLocal(yyyyMmDd, hhMm) {
  console.log('🕐 Parsing date/time:', { date: yyyyMmDd, time: hhMm });
  
  // Limpar e normalizar o horário
  let cleanTime = hhMm.trim();
  
  // Aceitar formatos: HH:MM, H:MM, HH.MM, H.MM, HHMM, HMM
  if (cleanTime.includes('.')) {
    cleanTime = cleanTime.replace('.', ':');
  }
  
  // Se não tem ':', assumir HHMM ou HMM
  if (!cleanTime.includes(':')) {
    if (cleanTime.length === 4) {
      // HHMM -> HH:MM
      cleanTime = cleanTime.slice(0, 2) + ':' + cleanTime.slice(2);
    } else if (cleanTime.length === 3) {
      // HMM -> H:MM  
      cleanTime = cleanTime.slice(0, 1) + ':' + cleanTime.slice(1);
    }
  }
  
  console.log('🔧 Normalized time:', cleanTime);
  
  const [y, m, d] = yyyyMmDd.split('-').map(n => Number(n));
  const [hh, mm] = cleanTime.split(':').map(n => Number(n));
  
  console.log('📊 Parsed components:', { y, m, d, hh, mm });
  
  if (!y || !m || !d || isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    console.log('❌ Invalid components detected');
    return null;
  }
  
  // Criar data no fuso horário local de forma mais simples
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  
  console.log('📅 SIMPLE date check:', { 
    input: `${yyyyMmDd} ${cleanTime}`,
    created: dt.toLocaleString(),
    timestamp: dt.getTime(),
    valid: !isNaN(dt.getTime()),
    now: new Date().toLocaleString(),
    nowTimestamp: Date.now(),
    diff: dt.getTime() - Date.now()
  });
  
  if (isNaN(dt.getTime())) {
    console.log('❌ Invalid date object');
    return null;
  }
  
  return dt;
}

function getFromStorage(key) {
  return new Promise(resolve => chrome.storage.local.get([key], data => resolve(data[key])));
}

function setInStorage(key, value) {
  return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
}

function cryptoRandomId() {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getQueue() {
  const q = await getFromStorage('queue');
  return Array.isArray(q) ? q : [];
}
