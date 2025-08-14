import { getAuth, saveAuth, ensureLoggedIn, uploadMediaFiles, schedulePosts, postNow, refreshQueueList, sendMessage, fileToDataUrl } from './shared.js';

const authSection = document.getElementById('auth-section');
const composerSection = document.getElementById('composer-section');
const queueSection = document.getElementById('queue-section');

const identifierInput = document.getElementById('identifier');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');

const postText = document.getElementById('post-text');
const mediaInput = document.getElementById('media-input');
const mediaPreview = document.getElementById('media-preview');
const altEditor = document.getElementById('alt-editor');
const dateInput = document.getElementById('date');
const timesInput = document.getElementById('times');
const timeButtons = document.getElementById('time-buttons');
const scheduleBtn = document.getElementById('schedule-btn');
const postNowBtn = document.getElementById('post-now-btn');
const composerMsg = document.getElementById('composer-msg');
const queueList = document.getElementById('queue-list');
const testAlarmBtn = document.getElementById('test-alarm-btn');
const testScheduleBtn = document.getElementById('test-schedule-btn');
const debugBtn = document.getElementById('debug-btn');
const clearAlarmsBtn = document.getElementById('clear-alarms-btn');
const logsContainer = document.getElementById('logs-container');
const clearLogsBtn = document.getElementById('clear-logs-btn');

function showComposer() {
  authSection.classList.add('hidden');
  composerSection.classList.remove('hidden');
  queueSection.classList.remove('hidden');
  document.getElementById('logs-section').classList.remove('hidden');
}

async function init() {
  const auth = await getAuth();
  if (auth?.identifier && auth?.password) {
    showComposer();
    await refreshQueueList(queueList);
    await refreshLogs();
  }
  
  // Definir data padrão como hoje
  const today = new Date().toISOString().split('T')[0];
  dateInput.value = today;
  
  // Sugerir horário baseado no atual
  updateTimeSuggestion();
}

loginBtn.addEventListener('click', async () => {
  const identifier = identifierInput.value.trim();
  const password = passwordInput.value.trim();
  if (!identifier || !password) {
    return;
  }
  await saveAuth({ identifier, password });
  showComposer();
});

// Seletor de horários
timeButtons.addEventListener('click', (e) => {
  if (!e.target.classList.contains('time-btn')) return;
  e.target.classList.toggle('selected');
  updateTimesInput();
});

function updateTimesInput() {
  const selected = Array.from(timeButtons.querySelectorAll('.time-btn.selected'))
    .map(btn => btn.dataset.time)
    .sort();
  timesInput.value = selected.join(', ');
}

function updateTimeSuggestion() {
  const now = new Date();
  const in5min = new Date(now.getTime() + 5 * 60000); // 5 minutos no futuro
  const in10min = new Date(now.getTime() + 10 * 60000); // 10 minutos no futuro
  
  const suggestion = `${in5min.getHours().toString().padStart(2,'0')}:${in5min.getMinutes().toString().padStart(2,'0')}, ${in10min.getHours().toString().padStart(2,'0')}:${in10min.getMinutes().toString().padStart(2,'0')}`;
  
  timesInput.placeholder = `Exemplo agora: ${suggestion}`;
}

mediaInput.addEventListener('change', () => {
  mediaPreview.innerHTML = '';
  altEditor.innerHTML = '';
  const files = Array.from(mediaInput.files || []);
  files.slice(0, 4).forEach((file, index) => {
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/');
    const wrapper = document.createElement('div');
    wrapper.className = 'media-item';
    wrapper.innerHTML = isVideo ? `<video src="${url}" muted playsinline></video>` : `<img src="${url}" alt="preview">`;
    mediaPreview.appendChild(wrapper);

    const altRow = document.createElement('div');
    altRow.className = 'alt-row';
    altRow.innerHTML = `<label>ALT para mídia ${index + 1}<input data-alt-index="${index}" type="text" placeholder="Descrição da mídia"></label>`;
    altEditor.appendChild(altRow);
  });
});

scheduleBtn.addEventListener('click', async () => {
  composerMsg.textContent = '';
  const text = postText.value.trim();
  const files = Array.from(mediaInput.files || []).slice(0, 4);
  const alts = Array.from(altEditor.querySelectorAll('input')).map(i => i.value.trim());
  const date = dateInput.value;
  const times = timesInput.value.split(',').map(t => t.trim()).filter(Boolean);
  console.log('⏰ User entered times:', times);

  if (!text && files.length === 0) {
    composerMsg.textContent = 'Escreva um texto ou selecione uma mídia.';
    return;
  }
  if (!date || times.length === 0) {
    composerMsg.textContent = 'Informe a data e ao menos um horário.';
    return;
  }

  try {
    await ensureLoggedIn();
    
    // Para agendamento, enviar dados raw (não fazer upload ainda)
    const mediaRaw = files.length > 0 ? await Promise.all(files.map(async (file, index) => ({
      name: file.name,
      type: file.type,
      alt: alts[index] || '',
      dataUrl: await fileToDataUrl(file)
    }))) : [];
    
    console.log('📱 Sending for scheduling:', { text: text?.slice(0, 50), mediaCount: mediaRaw.length });
    await schedulePosts({ text, media: mediaRaw, date, times });
    postText.value = '';
    mediaInput.value = '';
    mediaPreview.innerHTML = '';
    altEditor.innerHTML = '';
    composerMsg.textContent = 'Agendado!';
    await refreshQueueList(queueList);
  } catch (e) {
    composerMsg.textContent = 'Erro ao agendar: ' + (e?.message || e);
  }
});

postNowBtn.addEventListener('click', async () => {
  composerMsg.textContent = '';
  const text = postText.value.trim();
  const files = Array.from(mediaInput.files || []).slice(0, 4);
  const alts = Array.from(altEditor.querySelectorAll('input')).map(i => i.value.trim());
  if (!text && files.length === 0) {
    composerMsg.textContent = 'Escreva um texto ou selecione uma mídia.';
    return;
  }
  try {
    await ensureLoggedIn();
    const media = await uploadMediaFiles(files, alts);
    await postNow({ text, media });
    postText.value = '';
    mediaInput.value = '';
    mediaPreview.innerHTML = '';
    altEditor.innerHTML = '';
    composerMsg.textContent = 'Publicado!';
    await refreshQueueList(queueList);
  } catch (e) {
    composerMsg.textContent = 'Erro ao publicar: ' + (e?.message || e);
  }
});

// Botões de debug
testAlarmBtn.addEventListener('click', async () => {
  try {
    const result = await sendMessage({ type: 'testAlarm' });
    composerMsg.textContent = `Teste agendado para: ${result.scheduledFor}`;
    await refreshQueueList(queueList);
  } catch (e) {
    composerMsg.textContent = 'Erro no teste: ' + e.message;
  }
});

testScheduleBtn.addEventListener('click', async () => {
  try {
    await ensureLoggedIn();
    
    // Criar horário automático: agora + 30 segundos
    const now = new Date();
    const futureTime = new Date(now.getTime() + 30000); // 30 segundos
    const date = futureTime.toISOString().split('T')[0]; // YYYY-MM-DD
    const time = `${futureTime.getHours().toString().padStart(2,'0')}:${futureTime.getMinutes().toString().padStart(2,'0')}`;
    
    console.log('🧪 Testing schedule with:', { date, time, now: now.toLocaleString(), future: futureTime.toLocaleString() });
    
    await schedulePosts({ 
      text: 'TESTE AGENDAMENTO - deve postar em 30 segundos', 
      media: [], 
      date, 
      times: [time] 
    });
    
    composerMsg.textContent = `Teste agendado para ${time} (30s)`;
    await refreshQueueList(queueList);
  } catch (e) {
    composerMsg.textContent = 'Erro no teste agenda: ' + e.message;
    console.error('Test schedule error:', e);
  }
});

debugBtn.addEventListener('click', async () => {
  try {
    const result = await sendMessage({ type: 'debugAlarms' });
    console.table(result.alarms);
    console.table(result.queue);
    composerMsg.textContent = `Debug: ${result.alarms.length} alarms, ${result.queue.length} na fila`;
  } catch (e) {
    composerMsg.textContent = 'Erro no debug: ' + e.message;
  }
});

clearAlarmsBtn.addEventListener('click', async () => {
  try {
    const result = await sendMessage({ type: 'clearAllAlarms' });
    composerMsg.textContent = `${result.cleared} alarms removidos`;
    await refreshQueueList(queueList);
  } catch (e) {
    composerMsg.textContent = 'Erro ao limpar: ' + e.message;
  }
});

clearLogsBtn.addEventListener('click', async () => {
  try {
    await sendMessage({ type: 'clearLogs' });
    await refreshLogs();
    composerMsg.textContent = 'Logs limpos';
  } catch (e) {
    composerMsg.textContent = 'Erro ao limpar logs: ' + e.message;
  }
});

async function refreshLogs() {
  try {
    const logs = await sendMessage({ type: 'getLogs' });
    logsContainer.innerHTML = '';
    
    if (logs.length === 0) {
      logsContainer.innerHTML = '<div class="log-entry log-info">Nenhum log ainda...</div>';
      return;
    }
    
    logs.forEach(log => {
      const div = document.createElement('div');
      div.className = `log-entry log-${log.type}`;
      div.textContent = `[${log.timestamp}] ${log.message}`;
      logsContainer.appendChild(div);
    });
  } catch (e) {
    logsContainer.innerHTML = '<div class="log-entry log-error">Erro ao carregar logs</div>';
  }
}

// Atualizar logs periodicamente
setInterval(refreshLogs, 2000);

init();
