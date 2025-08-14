# Bluesky Scheduler - Extensão Chrome

Agende postagens no Bluesky com imagens/vídeo e textos alternativos (ALT).

## 🚀 Como instalar

1. Abra `chrome://extensions` no Chrome
2. Ative "Modo do desenvolvedor" (canto superior direito)
3. Clique "Carregar extensão sem compactação"
4. Selecione a pasta `bluesky-extension`

## 🔑 Como usar

### 1. Login
- Use uma **App Password** (não sua senha principal!)
- Crie em: Bluesky → Settings → App Passwords
- Formato: `xxxx-xxxx-xxxx-xxxx`

### 2. Compor posts
- Escreva o texto
- Selecione imagens/vídeo (até 4 imagens ou 1 vídeo)
- Preencha ALT para cada mídia (acessibilidade)

### 3. Agendar
- Clique nos botões de horário ou digite manualmente
- Escolha a data
- Clique "Agendar" ou "Postar agora"

## 🐛 Problemas comuns

### ❌ "Não postou nada"
1. **Verifique credenciais**:
   - Handle: `seunome.bsky.social` (com .bsky.social)
   - App Password: deve ter 19 caracteres com hífens
2. **Abra o console** (`F12` → Console) e procure por logs:
   - 🔐 Login messages
   - 📤 Upload messages  
   - 📝 Post messages
3. **Limites da API**:
   - Máximo 5.000 pontos/hora
   - Cada post = 3 pontos

### 🖼️ "Logo não aparece"
- Recarregue a extensão em `chrome://extensions`
- Se persistir, verifique se `icon-128.svg` existe

### 📱 "Vídeo não funciona"
- Suporte a vídeo ainda está limitado no Bluesky
- A extensão tenta postar como imagem por enquanto

## 🔧 Debug

Para ver logs detalhados:
1. `F12` → Console
2. Filtre por "background" ou "Bluesky"
3. Procure por mensagens de erro em vermelho

## ⚙️ Configurações

Clique com o botão direito na extensão → "Opções" para:
- Mudar servidor Bluesky
- Ativar/desativar notificações

## 📋 Recursos

- ✅ Login com App Password
- ✅ Upload de imagens (até 4)
- ✅ Textos alternativos (ALT)
- ✅ Agendamento múltiplo
- ✅ Seletor visual de horários
- ✅ Fila de posts
- ⚠️ Vídeo (suporte limitado)

---

**Dica**: Sempre use App Passwords, nunca sua senha principal!
