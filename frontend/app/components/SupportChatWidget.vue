<template>
  <div class="tiktak-chat-widget">
    <div class="chat-container">
      <!-- Header -->
      <div class="chat-header">
        <div class="header-content">
          <div class="logo-section">
            <div class="ai-badge">
              <svg class="sparkle-icon" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2l1.2 4.3L18 8l-4.8 1.7L12 14l-1.2-4.3L6 8l4.8-1.7L12 2z"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <div class="header-text">
              <p class="chat-title">TikTak Assistant</p>
              <p class="chat-subtitle">Support intelligent (L0/L1)</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Messages -->
      <div class="messages-container">
        <div class="messages-inner">
          <!-- Welcome state -->
          <div v-if="messages.length === 0" class="welcome-message">
            <div class="welcome-icon">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 22s8-4 8-10V7l-8-3-8 3v5c0 6 8 10 8 10z"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <p class="welcome-title">Demander à TikTak Assistant</p>
            <p class="welcome-text">Décrivez votre problème, je vous guide étape par étape.</p>

            <div class="suggested-questions">
              <button class="suggestion-chip" type="button" @click="quickSend('Je vois une erreur 404 sur les catégories')">
                Je vois une erreur 404 sur les catégories
              </button>
              <button class="suggestion-chip" type="button" @click="quickSend('Mon paiement échoue, que faire ?')">
                Mon paiement échoue, que faire ?
              </button>
              <button class="suggestion-chip" type="button" @click="quickSend('Mon site ne charge plus')">
                Mon site ne charge plus
              </button>
            </div>
          </div>

          <!-- Messages list -->
          <div
            v-for="(msg, index) in messages"
            :key="index"
            :class="['message-wrapper', msg.role === 'user' ? 'message-user' : 'message-ai']"
          >
            <!-- Avatar -->
            <div class="message-avatar">
              <div v-if="msg.role === 'assistant'" class="avatar-ai">
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2l1.2 4.3L18 8l-4.8 1.7L12 14l-1.2-4.3L6 8l4.8-1.7L12 2z"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linejoin="round"
                  />
                </svg>
              </div>
              <div v-else class="avatar-user">U</div>
            </div>

            <!-- Content -->
            <div class="message-content">
              <div class="message-label">
                {{ msg.role === 'assistant' ? 'Assistant' : 'Vous' }}
              </div>

              <div
                :class="[
                  'message-bubble',
                  msg.role === 'assistant' ? 'bubble-ai' : 'bubble-user'
                ]"
              >
                <div class="message-text">{{ msg.text }}</div>
              </div>

              <!-- Meta -->
              <div v-if="msg.role === 'assistant' && msg.quality" class="message-meta">
                <span class="meta-confidence">Qualité : {{ msg.quality }}</span>
                <span v-if="msg.mode" :class="['meta-badge', `mode-${msg.mode}`]">
                  {{ msg.mode }}
                </span>
              </div>

              <!-- Ticket created info -->
              <div v-if="msg.role === 'assistant' && msg.ticket" class="message-meta">
                <span class="meta-badge mode-escalate">
                  Ticket créé ✅ (ID: {{ msg.ticket.external_ticket_id || msg.ticket.id }})
                </span>
              </div>

              <!-- Confirm escalation UI -->
              <div
                v-if="msg.role === 'assistant' && msg.ui && msg.ui.type === 'confirm_escalation'"
                class="confirm-card"
              >
                <div class="confirm-title">{{ msg.ui.title }}</div>
                <div class="confirm-text">{{ msg.ui.message }}</div>
                <div class="confirm-actions">
                  <button
                    class="confirm-btn confirm-primary"
                    type="button"
                    :disabled="loading"
                    @click="confirmTicket()"
                  >
                    {{ msg.ui.buttons?.[0]?.label || "Oui, créer le ticket" }}
                  </button>
                  <button
                    class="confirm-btn"
                    type="button"
                    :disabled="loading"
                    @click="cancelTicket()"
                  >
                    {{ msg.ui.buttons?.[1]?.label || "Non, je veux essayer" }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Typing indicator -->
          <div v-if="loading" class="message-wrapper message-ai">
            <div class="message-avatar">
              <div class="avatar-ai avatar-typing">
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2l1.2 4.3L18 8l-4.8 1.7L12 14l-1.2-4.3L6 8l4.8-1.7L12 2z"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linejoin="round"
                  />
                </svg>
              </div>
            </div>
            <div class="message-content">
              <div class="typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Input -->
      <div class="input-container">
        <form class="input-form" @submit.prevent="sendMessage">
          <div class="input-wrapper">
            <input
              v-model="userInput"
              class="message-input"
              type="text"
              placeholder="Écrivez votre message…"
              :disabled="loading"
            />
            <button
              class="send-button"
              type="submit"
              :disabled="loading || !userInput.trim()"
              :class="{ 'button-disabled': loading || !userInput.trim() }"
            >
              <svg v-if="!loading" class="send-icon" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 12l18-9-9 18-2-7-7-2z"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linejoin="round"
                />
              </svg>
              <svg v-else class="loading-spinner" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2a10 10 0 1010 10"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>
        </form>
        <p class="input-hint">
          L’assistant peut escalader vers un ticket uniquement si l’incident est confirmé.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { askSupportAI } from "@/utils/supportApi"

type ChatMessage = {
  role: "user" | "assistant"
  text: string
  ui?: any
  actions?: any[]
  quality?: "high" | "medium" | "low"
  mode?: "solve" | "clarify" | "escalate"
  ticket?: any
}

const messages = ref<ChatMessage[]>([])
const userInput = ref("")
const loading = ref(false)
const conversationId = ref<string | null>(null)

// used for confirm escalation flow
const lastUserMessage = ref<string>("")

async function quickSend(text: string) {
  userInput.value = text
  await sendMessage()
}

async function sendMessage() {
  const text = userInput.value.trim()
  if (!text || loading.value) return

  lastUserMessage.value = text

  messages.value.push({ role: "user", text })
  userInput.value = ""
  loading.value = true

  try {
    const response = await askSupportAI(text, conversationId.value || undefined, false)
    conversationId.value = response.conversation_id

    messages.value.push({
      role: "assistant",
      text: response.answer,
      ui: response.ui,
      actions: response.actions,
      quality: response.quality,
      mode: response.mode,
      ticket: response.ticket,
    })
  } catch (err) {
    console.error(err)
    messages.value.push({
      role: "assistant",
      text: "Une erreur est survenue lors de la communication avec le support. Veuillez réessayer.",
      mode: "clarify",
      quality: "low",
    })
  } finally {
    loading.value = false
  }
}

async function confirmTicket() {
  if (!conversationId.value || !lastUserMessage.value) return
  if (loading.value) return

  loading.value = true
  try {
    const response = await askSupportAI(lastUserMessage.value, conversationId.value, true)

    messages.value.push({
      role: "assistant",
      text: response.answer,
      ui: response.ui,
      actions: response.actions,
      quality: response.quality,
      mode: response.mode,
      ticket: response.ticket,
    })
  } catch (err) {
    console.error(err)
    messages.value.push({
      role: "assistant",
      text: "Impossible de créer le ticket pour le moment. Réessayez.",
      mode: "clarify",
      quality: "low",
    })
  } finally {
    loading.value = false
  }
}

function cancelTicket() {
  messages.value.push({
    role: "assistant",
    text: "D’accord — essayons d’abord les étapes proposées. Dites-moi ce que vous observez après test.",
    mode: "clarify",
    quality: "medium",
  })
}
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

/* Meta */
.message-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
  flex-wrap: wrap;
}

.meta-badge,
.meta-confidence {
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

.meta-confidence {
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

.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-6px); opacity: 1; }
}

/* Input */
.input-container {
  background: var(--color-bg);
  border-top: 1px solid var(--color-border);
  padding: 16px 20px;
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

.loading-spinner { animation: spin 1s linear infinite; }

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.input-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  margin: 8px 0 0;
  text-align: center;
  letter-spacing: 0.01em;
}

@media (max-width: 640px) {
  .chat-container {
    max-width: 100%;
    height: 100vh;
    border-radius: 0;
  }
  .messages-inner { padding: 16px; }
  .input-container { padding: 12px 16px; }
}
</style>