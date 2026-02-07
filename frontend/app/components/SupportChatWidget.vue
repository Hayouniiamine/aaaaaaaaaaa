
<template>
  <div class="tiktak-chat-widget">
    <div class="chat-container">
      <!-- Header -->
      <div class="chat-header">
        <div class="header-content">
          <div class="logo-section">
            <div class="ai-badge">
              <svg class="sparkle-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="currentColor"/>
              </svg>
            </div>
            <div class="header-text">
              <h2 class="chat-title">TikTak Support</h2>
              <p class="chat-subtitle">AI Assistant · Always here to help</p>
            </div>
          </div>

          <button class="reset-btn" type="button" @click="resetChat" title="Réinitialiser la conversation">
            Réinitialiser
          </button>
        </div>
      </div>

      <!-- Messages Area -->
      <div class="messages-container" ref="messagesContainer">
        <div class="messages-inner">
          <!-- Welcome Message (shows when empty) -->
          <div v-if="messages.length === 0" class="welcome-message">
            <div class="welcome-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="currentColor" opacity="0.2"/>
                <path d="M12 6L13.5 10.5L18 12L13.5 13.5L12 18L10.5 13.5L6 12L10.5 10.5L12 6Z" fill="currentColor"/>
              </svg>
            </div>
            <h3 class="welcome-title">Comment puis-je vous aider ?</h3>
            <p class="welcome-text">Posez-moi vos questions sur TikTak Pro</p>
            <div class="suggested-questions">
              <button
                v-for="(q, idx) in suggestedQuestions"
                :key="idx"
                class="suggestion-chip"
                @click="sendPreset(q)"
              >
                {{ q }}
              </button>
            </div>
          </div>

          <!-- Messages -->
          <div
            v-for="(m, idx) in messages"
            :key="idx"
            class="message-wrapper"
            :class="{ 'message-user': m.role === 'user', 'message-ai': m.role === 'ai' }"
          >
            <!-- AI Avatar -->
            <div v-if="m.role === 'ai'" class="message-avatar">
              <div class="avatar-ai">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="currentColor"/>
                </svg>
              </div>
            </div>

            <div class="message-content">
              <div v-if="m.role === 'user'" class="message-label">Vous</div>
              <div v-else class="message-label">Assistant TikTak</div>

              <div class="message-bubble" :class="`bubble-${m.role}`">
                <div class="message-text" v-html="formatMessage(m.text)"></div>
              </div>

              <div v-if="m.meta && m.role === 'ai'" class="message-meta">
                <span class="meta-badge" :class="`mode-${m.meta.mode}`">
                  {{ getModeLabel(m.meta.mode) }}
                </span>
                <span class="meta-confidence">
                  {{ Math.round((m.meta.confidence || 0) * 100) }}% confiance
                </span>
                <span v-if="m.meta.context" class="meta-context">
                  {{ m.meta.context }}
                </span>
              </div>
            </div>

            <!-- User Avatar -->
            <div v-if="m.role === 'user'" class="message-avatar">
              <div class="avatar-user">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="currentColor"/>
                </svg>
              </div>
            </div>
          </div>

          <!-- Typing Indicator -->
          <div v-if="loading" class="message-wrapper message-ai">
            <div class="message-avatar">
              <div class="avatar-ai avatar-typing">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="currentColor"/>
                </svg>
              </div>
            </div>
            <div class="message-content">
              <div class="message-label">Assistant TikTak</div>
              <div class="typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Input Area -->
      <div class="input-container">
        <form class="input-form" @submit.prevent="send">
          <div class="input-wrapper">
            <input
              v-model="input"
              class="message-input"
              placeholder="Posez votre question..."
              :disabled="loading"
              @keydown.enter.exact.prevent="send"
            />
            <button
              type="submit"
              class="send-button"
              :disabled="loading || !input.trim()"
              :class="{ 'button-disabled': loading || !input.trim() }"
            >
              <svg v-if="!loading" class="send-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z" fill="currentColor"/>
              </svg>
              <svg v-else class="loading-spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" opacity="0.25"/>
                <path d="M12 2C6.48 2 2 6.48 2 12" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </form>
        <p class="input-hint">AI peut faire des erreurs. Vérifiez les infos importantes.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, onMounted } from "vue";
import { askSupportAI, type AiAskResponse, type HistoryMsg } from "@/utils/supportApi";

type Msg = {
  role: "user" | "ai";
  text: string; // always string (never null)
  meta?: { mode: string; confidence: number; context?: string };
};

const STORAGE_KEY = "tiktak_support_chat_v1";

const input = ref<string>("");
const loading = ref<boolean>(false);
const messages = ref<Msg[]>([]);
const messagesContainer = ref<HTMLElement | null>(null);

const suggestedQuestions = [
  "slm",
  "Comment configurer mon domaine ?",
  "Mon domaine n’apparait pas, DNS il y a 2h",
  "Mon domaine n’apparait pas même après 48h",
  "Toujours pas après 4 jours + checks OK",
];

function metaFrom(out: AiAskResponse): Msg["meta"] {
  return {
    mode: (out as any).mode || "solve",
    confidence: typeof (out as any).confidence === "number" ? (out as any).confidence : 0,
    context: (out as any).context,
  };
}

function buildHistory(): HistoryMsg[] {
  return messages.value.slice(-12).map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: String(m.text || "").trim(),
  }));
}

function getModeLabel(mode: string): string {
  const labels: Record<string, string> = {
    solve: "Résolu",
    clarify: "Clarification",
    escalate: "Support requis",
    error: "Erreur",
  };
  return labels[mode] || mode;
}

function formatMessage(text: string): string {
  return String(text ?? "")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/✓/g, '<span class="checkmark">✓</span>')
    .replace(/→/g, '<span class="arrow">→</span>')
    .replace(/^• /gm, '<span class="bullet">•</span> ')
    .replace(/^(\d+)\. /gm, '<span class="number">$1.</span> ')
    .replace(/\n/g, "<br>");
}

function safeString(v: unknown, fallback: string) {
  const s = typeof v === "string" ? v : "";
  return s && s.trim() ? s : fallback;
}

function safeAnswer(out: AiAskResponse): string {
  const anyOut: any = out as any;
  if (typeof anyOut.answer === "string" && anyOut.answer.trim()) return anyOut.answer;
  if (anyOut.answer == null) return "Pouvez-vous préciser votre demande (module, écran, message d’erreur) ?";
  try {
    const asJson = JSON.stringify(anyOut.answer, null, 2);
    return asJson === "null" ? "Pouvez-vous préciser votre demande ?" : asJson;
  } catch {
    return String(anyOut.answer);
  }
}

function scrollToBottom() {
  const el = messagesContainer.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.value));
  } catch {}
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      messages.value = parsed
        .filter((m) => m && (m.role === "user" || m.role === "ai"))
        .map((m) => ({
          role: m.role,
          text: safeString(m.text, ""),
          meta: m.meta,
        }))
        .filter((m) => m.text.trim().length > 0);
    }
  } catch {}
}

function resetChat() {
  messages.value = [];
  persist();
}

async function sendPreset(q: string) {
  input.value = q;
  await send();
}

async function send() {
  const text = input.value.trim();
  if (!text || loading.value) return;

  const history = buildHistory();

  messages.value.push({ role: "user", text });
  input.value = "";
  loading.value = true;

  await nextTick();
  scrollToBottom();
  persist();

  try {
    const out = await askSupportAI(text, history);

    const mode = (out as any).mode;

    if (mode === "clarify") {
      const qs = Array.isArray((out as any).questions) ? (out as any).questions : [];
      const msg = qs.length
        ? "J’ai besoin de quelques précisions :\n\n" + qs.map((q: string) => "• " + q).join("\n")
        : "Pouvez-vous préciser votre demande (module, écran, message d’erreur) ?";
      messages.value.push({ role: "ai", text: msg, meta: metaFrom(out) });
    } else if (mode === "solve") {
      messages.value.push({ role: "ai", text: safeAnswer(out), meta: metaFrom(out) });
    } else if (mode === "escalate") {
      messages.value.push({
        role: "ai",
        text: safeString(
          (out as any).answer,
          "Je transfère votre demande à notre équipe support pour une assistance personnalisée."
        ),
        meta: metaFrom(out),
      });
    } else {
      messages.value.push({
        role: "ai",
        text: "Désolé, une erreur s’est produite. Veuillez réessayer.",
        meta: { mode: "error", confidence: 0 },
      });
    }
  } catch {
    messages.value.push({
      role: "ai",
      text: "Désolé, une erreur s'est produite. Veuillez réessayer ou contacter le support.",
      meta: { mode: "error", confidence: 0 },
    });
  } finally {
    loading.value = false;
    await nextTick();
    scrollToBottom();
    persist();
  }
}

onMounted(async () => {
  restore();
  await nextTick();
  scrollToBottom();
});

// Persist whenever messages change
watch(
  () => messages.value,
  () => persist(),
  { deep: true }
);

// Auto-scroll
watch(
  () => messages.value.length,
  () => nextTick(() => scrollToBottom())
);
</script>



<style scoped>
/* ============================================
   SHOPIFY SIDEKICK-INSPIRED DESIGN
   ============================================ */

.tiktak-chat-widget {
  --color-primary: #2c3e50;
  --color-primary-light: #34495e;
  --color-accent: #00d4aa;
  --color-accent-hover: #00bfa0;
  --color-bg: #ffffff;
  --color-surface: #f8f9fa;
  --color-surface-hover: #f1f3f5;
  --color-border: #e2e8f0;
  --color-text: #1a202c;
  --color-text-muted: #64748b;
  --color-ai-bubble: #f8f9fa;
  --color-user-bubble: #2c3e50;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 20px 40px rgba(0, 0, 0, 0.12);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Chat Container */
.chat-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  height: 650px;
  background: var(--color-bg);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  border: 1px solid var(--color-border);
}

/* Header */
.chat-header {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%);
  color: white;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ai-badge {
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.sparkle-icon {
  width: 20px;
  height: 20px;
  color: white;
  animation: sparkle 3s ease-in-out infinite;
}

@keyframes sparkle {
  0%, 100% { transform: rotate(0deg) scale(1); opacity: 1; }
  50% { transform: rotate(180deg) scale(1.1); opacity: 0.8; }
}

.header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chat-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
}

.chat-subtitle {
  font-size: 13px;
  margin: 0;
  opacity: 0.85;
  font-weight: 400;
}

/* Messages Container */
.messages-container {
  flex: 1;
  overflow-y: auto;
  background: var(--color-bg);
  scroll-behavior: smooth;
}

.messages-container::-webkit-scrollbar {
  width: 6px;
}

.messages-container::-webkit-scrollbar-track {
  background: transparent;
}

.messages-container::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}

.messages-container::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}

.messages-inner {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 100%;
}

/* Welcome Message */
.welcome-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 20px;
  flex: 1;
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.welcome-icon {
  width: 64px;
  height: 64px;
  background: linear-gradient(135deg, var(--color-accent) 0%, #00bfa0 100%);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  box-shadow: 0 8px 24px rgba(0, 212, 170, 0.25);
}

.welcome-icon svg {
  width: 32px;
  height: 32px;
  color: white;
}

.welcome-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 8px 0;
  letter-spacing: -0.02em;
}

.welcome-text {
  font-size: 14px;
  color: var(--color-text-muted);
  margin: 0 0 24px 0;
}

.suggested-questions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 320px;
}

.suggestion-chip {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
}

.suggestion-chip:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-accent);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

/* Message Wrapper */
.message-wrapper {
  display: flex;
  gap: 12px;
  animation: messageSlideIn 0.3s ease-out;
}

@keyframes messageSlideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.message-user {
  flex-direction: row-reverse;
}

.message-ai {
  flex-direction: row;
}

/* Avatar */
.message-avatar {
  flex-shrink: 0;
}

.avatar-ai,
.avatar-user {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
}

.avatar-ai {
  background: linear-gradient(135deg, var(--color-accent) 0%, #00bfa0 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(0, 212, 170, 0.25);
}

.avatar-ai svg {
  width: 18px;
  height: 18px;
}

.avatar-typing {
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.9; }
}

.avatar-user {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(44, 62, 80, 0.2);
}

.avatar-user svg {
  width: 20px;
  height: 20px;
}

/* Message Content */
.message-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.message-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  padding: 0 4px;
  letter-spacing: 0.01em;
}

.message-user .message-label {
  text-align: right;
}

/* Message Bubble */
.message-bubble {
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: 14px;
  line-height: 1.6;
  max-width: 100%;
  word-wrap: break-word;
  box-shadow: var(--shadow-sm);
}

.bubble-ai {
  background: var(--color-ai-bubble);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md) var(--radius-md) var(--radius-md) 4px;
}

.bubble-user {
  background: var(--color-user-bubble);
  color: white;
  border-radius: var(--radius-md) var(--radius-md) 4px var(--radius-md);
  margin-left: auto;
}

.message-text {
  white-space: pre-wrap;
}

/* Message formatting */
.message-text :deep(strong) {
  font-weight: 600;
  color: inherit;
}

.message-text :deep(.checkmark) {
  color: var(--color-accent);
  font-weight: 600;
  margin-right: 4px;
}

.message-text :deep(.arrow) {
  color: var(--color-accent);
  margin: 0 4px;
}

.message-text :deep(.bullet) {
  color: var(--color-accent);
  font-weight: 600;
}

.message-text :deep(.number) {
  color: var(--color-accent);
  font-weight: 600;
  margin-right: 4px;
}

/* Message Meta */
.message-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
  flex-wrap: wrap;
}

.meta-badge,
.meta-confidence,
.meta-context {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 6px;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.meta-badge {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.mode-solve {
  background: #d1fae5;
  color: #065f46;
  border-color: #6ee7b7;
}

.mode-clarify {
  background: #fef3c7;
  color: #92400e;
  border-color: #fcd34d;
}

.mode-escalate {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fca5a5;
}

.mode-error {
  background: #fecaca;
  color: #7f1d1d;
  border-color: #f87171;
}

.meta-confidence {
  background: var(--color-surface);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
}

.meta-context {
  background: var(--color-surface);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
}

/* Typing Indicator */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  background: var(--color-ai-bubble);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md) var(--radius-md) var(--radius-md) 4px;
  width: fit-content;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: var(--color-text-muted);
  border-radius: 50%;
  animation: typing 1.4s infinite;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-6px); opacity: 1; }
}

/* Input Container */
.input-container {
  background: var(--color-bg);
  border-top: 1px solid var(--color-border);
  padding: 16px 20px;
}

.input-form {
  margin-bottom: 8px;
}

.input-wrapper {
  display: flex;
  gap: 8px;
  align-items: center;
}

.message-input {
  flex: 1;
  padding: 12px 16px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  background: var(--color-bg);
  color: var(--color-text);
  transition: all 0.2s ease;
  font-family: inherit;
}

.message-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(0, 212, 170, 0.1);
}

.message-input::placeholder {
  color: var(--color-text-muted);
}

.message-input:disabled {
  background: var(--color-surface);
  cursor: not-allowed;
}

.send-button {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--color-accent) 0%, #00bfa0 100%);
  color: white;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 212, 170, 0.3);
}

.send-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 212, 170, 0.4);
}

.send-button:active:not(:disabled) {
  transform: translateY(0);
}

.send-button.button-disabled {
  background: var(--color-surface);
  color: var(--color-text-muted);
  cursor: not-allowed;
  box-shadow: none;
}

.send-icon,
.loading-spinner {
  width: 20px;
  height: 20px;
}

.loading-spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.input-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  margin: 0;
  text-align: center;
  letter-spacing: 0.01em;
}

/* Responsive */
@media (max-width: 640px) {
  .chat-container {
    max-width: 100%;
    height: 100vh;
    border-radius: 0;
  }
  
  .messages-inner {
    padding: 16px;
  }
  
  .input-container {
    padding: 12px 16px;
  }
}
</style>

