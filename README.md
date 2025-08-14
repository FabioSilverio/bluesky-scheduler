# Bluesky Scheduler (Chrome Extension)

Português abaixo ⤵

A lightweight Chrome extension to schedule posts on Bluesky with images and ALT text. Includes a visual time picker, multi-time scheduling per day, and background publishing with alarms.

## 🚀 Installation (English)

1. Open `chrome://extensions` in Chrome
2. Toggle on “Developer mode” (top-right)
3. Click “Load unpacked”
4. Select the folder `bluesky-extension`

## 🔑 Usage (English)

### 1) Login
- Use a Bluesky **App Password** (not your main password)
- Create it in: Bluesky → Settings → App Passwords
- Format: `xxxx-xxxx-xxxx-xxxx`

### 2) Compose
- Type your text
- Choose media (up to 4 images, or 1 video – video is limited)
- Provide ALT text for each media item (accessibility)

### 3) Schedule
- Pick a date
- Click time buttons or type times like `09:00, 12:30, 18:45`
- Click “Schedule” or “Post now”

## 🧰 Troubleshooting (English)

- If nothing is posted:
  - Check credentials: handle like `yourname.bsky.social` and a valid App Password
  - View logs in the extension (Logs card) or open DevTools → Background Service Worker console
  - Respect API limits (posts cost points per hour/day)
- If logo doesn’t show: reload extension; ensure `icon-128.svg` exists
- Video support on Bluesky is still limited; the extension treats video conservatively

---

## Bluesky Scheduler (Extensão Chrome)

Extensão leve para agendar posts no Bluesky com imagens e ALT. Inclui seletor visual de horários, múltiplos horários por dia e publicação em segundo plano com alarms.

## 🚀 Instalação (Português)

1. Abra `chrome://extensions` no Chrome
2. Ative o “Modo do desenvolvedor” (canto superior direito)
3. Clique em “Carregar sem compactação”
4. Selecione a pasta `bluesky-extension`

## 🔑 Uso (Português)

### 1) Login
- Use uma **App Password** do Bluesky (não sua senha principal)
- Crie em: Bluesky → Configurações → App Passwords
- Formato: `xxxx-xxxx-xxxx-xxxx`

### 2) Compor
- Escreva o texto
- Selecione mídias (até 4 imagens ou 1 vídeo — vídeo é limitado)
- Preencha ALT para cada mídia (acessibilidade)

### 3) Agendar
- Escolha a data
- Clique nos botões de horário ou digite: `09:00, 12:30, 18:45`
- Clique “Agendar” ou “Postar agora”

## 🧰 Solução de Problemas (Português)

- Se “não postou nada”:
  - Verifique credenciais: handle `seunome.bsky.social` e App Password válida
  - Veja os logs na própria extensão (card Logs) ou no DevTools → Service Worker
  - Respeite limites da API (posts consomem pontos por hora/dia)
- Se o logo não aparece: recarregue a extensão; confirme `icon-128.svg`
- Vídeo no Bluesky ainda é limitado; a extensão trata vídeo de forma conservadora

## 📦 Features

- ✅ App Password login
- ✅ Image upload (up to 4) with ALT
- ✅ Multi-time daily scheduling with `chrome.alarms`
- ✅ Visual time picker + manual input
- ✅ Queue view and notifications
- ⚠️ Video support limited by Bluesky

---

Tip: Always use App Passwords, never your main password.
