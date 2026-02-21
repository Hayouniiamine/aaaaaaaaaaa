<template>
  <div class="sk-root">

    <!-- ═══ FAB Trigger ═══════════════════════════════════ -->
    <Transition name="sk-fab-pop">
      <button v-if="!isOpen" class="sk-fab" @click="openPanel" aria-label="Ouvrir l'assistant TikTak">
        <div class="sk-fab-icon">
          <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
            <path d="M12 2l2.1 6.5H21l-5.6 4 2.2 6.5L12 15l-5.6 4 2.2-6.5L3 8.5h6.9L12 2z"
              stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="currentColor" fill-opacity="0.15"/>
          </svg>
        </div>
        <span v-if="unreadCount > 0" class="sk-fab-badge">{{ unreadCount }}</span>
      </button>
    </Transition>

    <!-- ═══ Panel ═════════════════════════════════════════ -->
    <Transition name="sk-slide">
      <div v-if="isOpen" class="sk-backdrop" @click.self="closePanel">
        <div class="sk-panel">

          <!-- ── Header ─────────────────────────────────── -->
          <header class="sk-header">
            <div class="sk-header-left">
              <div class="sk-header-avatar">
                <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                  <path d="M12 2l2.1 6.5H21l-5.6 4 2.2 6.5L12 15l-5.6 4 2.2-6.5L3 8.5h6.9L12 2z"
                    stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="currentColor" fill-opacity="0.2"/>
                </svg>
              </div>
              <div class="sk-header-text">
                <p class="sk-header-title">TikTak Assistant</p>
                <p class="sk-header-status">
                  <span class="sk-status-dot"></span>
                  {{ conversationId ? 'Session active' : 'Prêt à aider' }}
                </p>
              </div>
            </div>
            <div class="sk-header-right">
              <button v-if="conversationId" class="sk-hbtn sk-hbtn--end" @click="openEndChat"
                title="Terminer la conversation">
                <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                  <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
                </svg>
              </button>
              <button class="sk-hbtn" @click="closePanel" title="Réduire">
                <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          </header>

          <!-- ── Quick Info Bar ─────────────────────────── -->
          <Transition name="sk-info-slide">
            <div v-if="showInfoBar" class="sk-info-bar">
              <div class="sk-info-inner">
                <p class="sk-info-label">Pour un meilleur suivi :</p>
                <div class="sk-info-fields">
                  <input v-model="quickName" class="sk-info-input" type="text" placeholder="Votre nom" />
                  <input v-model="quickEmail" class="sk-info-input" type="email" placeholder="Email (optionnel)" />
                </div>
                <div class="sk-info-actions">
                  <button class="sk-info-save" @click="saveQuickInfo">Enregistrer</button>
                  <button class="sk-info-dismiss" @click="dismissInfoBar">Plus tard</button>
                </div>
              </div>
            </div>
          </Transition>

          <!-- ── Messages Area ─────────────────────────── -->
          <div class="sk-messages" ref="messagesEl">

            <!-- Welcome / empty state -->
            <div v-if="messages.length === 0 && !loading" class="sk-welcome">
              <div class="sk-welcome-sparkle">
                <svg viewBox="0 0 24 24" fill="none" width="32" height="32">
                  <path d="M12 2l2.1 6.5H21l-5.6 4 2.2 6.5L12 15l-5.6 4 2.2-6.5L3 8.5h6.9L12 2z"
                    stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="currentColor" fill-opacity="0.1"/>
                </svg>
              </div>
              <h3 class="sk-welcome-title">Bonjour 👋</h3>
              <p class="sk-welcome-desc">
                Je suis l'assistant IA de TikTak PRO. Décrivez votre problème ou choisissez un sujet.
              </p>

              <div class="sk-suggestions">
                <button v-for="s in suggestions" :key="s.id" class="sk-suggestion"
                  @click="useSuggestion(s)">
                  <span class="sk-suggestion-icon">{{ s.icon }}</span>
                  <span class="sk-suggestion-text">{{ s.label }}</span>
                  <svg class="sk-suggestion-arrow" viewBox="0 0 24 24" fill="none" width="14" height="14">
                    <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Messages list -->
            <TransitionGroup name="sk-msg-anim" tag="div" class="sk-msg-list">
              <div v-for="(msg, i) in messages" :key="i"
                :class="['sk-msg', msg.role === 'user' ? 'sk-msg--user' : 'sk-msg--ai']">

                <!-- AI avatar -->
                <div v-if="msg.role === 'assistant'" class="sk-msg-avatar">
                  <svg viewBox="0 0 24 24" fill="none" width="12" height="12">
                    <path d="M12 2l2.1 6.5H21l-5.6 4 2.2 6.5L12 15l-5.6 4 2.2-6.5L3 8.5h6.9L12 2z"
                      stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                  </svg>
                </div>

                <div :class="['sk-msg-body', msg.role === 'user' ? 'sk-msg-body--user' : 'sk-msg-body--ai']">

                  <!-- Sender label -->
                  <span class="sk-msg-sender">{{ msg.role === 'assistant' ? 'TikTak Assistant' : 'Vous' }}</span>

                  <!-- Bubble -->
                  <div :class="['sk-bubble', msg.role === 'user' ? 'sk-bubble--user' : 'sk-bubble--ai']">
                    <!-- Rendered content (markdown for AI, plain for user) -->
                    <div v-if="msg.role === 'assistant'" class="sk-bubble-content" v-html="renderMarkdown(msg.text)"></div>
                    <p v-else class="sk-bubble-text">{{ msg.text }}</p>

                    <!-- Module / Confidence / Verdict badges (hidden — internal diagnostics) -->
                    <!--
                    <div v-if="msg.role === 'assistant' && msg.meta" class="sk-meta-row">
                      <span v-if="msg.meta.detected_module" class="sk-badge sk-badge--module">
                        <svg viewBox="0 0 24 24" fill="none" width="10" height="10">
                          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                            stroke="currentColor" stroke-width="2"/>
                        </svg>
                        {{ getModuleName(msg.meta.detected_module) }}
                      </span>
                      <span v-if="msg.meta.confidence !== undefined"
                        class="sk-badge"
                        :class="getConfidenceClass(msg.meta.confidence)">
                        {{ (msg.meta.confidence * 100).toFixed(0) }}% confiance
                      </span>
                      <span v-if="msg.meta.verdict" class="sk-badge"
                        :class="getVerdictClass(msg.meta.verdict)">
                        {{ getVerdictIcon(msg.meta.verdict) }} {{ getVerdictLabel(msg.meta.verdict) }}
                      </span>
                    </div>
                    -->

                    <!-- Evidence sources (hidden from end users) -->
                    <!--
                    <details v-if="msg.evidence && msg.evidence.length > 0" class="sk-evidence">
                      <summary class="sk-evidence-summary">
                        <svg viewBox="0 0 24 24" fill="none" width="11" height="11">
                          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            stroke="currentColor" stroke-width="1.8"/>
                        </svg>
                        {{ msg.evidence.length }} source{{ msg.evidence.length > 1 ? 's' : '' }} consultée{{ msg.evidence.length > 1 ? 's' : '' }}
                      </summary>
                      <div class="sk-evidence-list">
                        <div v-for="(ev, idx) in msg.evidence.slice(0, 3)" :key="idx" class="sk-evidence-item">
                          <span class="sk-evidence-type" :class="ev.source === 'playbook' ? 'sk-ev--pb' : 'sk-ev--doc'">
                            {{ ev.source === 'playbook' ? '📘' : '📄' }}
                          </span>
                          <span class="sk-evidence-snippet">{{ ev.snippet }}</span>
                        </div>
                      </div>
                    </details>
                    -->
                  </div>

                  <!-- Vision Analysis Feedback -->
                  <VisionAnalysisFeedback v-if="msg.role === 'assistant' && msg.vision" :vision="msg.vision" />

                  <!-- Dashboard direct link -->
                  <a v-if="msg.role === 'assistant' && msg.route_link" 
                     :href="msg.route_link" target="_blank" rel="noopener"
                     class="sk-route-link">
                    <span class="sk-route-link-icon">
                      <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M15 3h6v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M10 14L21 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </span>
                    <span class="sk-route-link-body">
                      <span class="sk-route-link-label">Ouvrir dans le tableau de bord</span>
                      <span class="sk-route-link-url">{{ msg.route_link.replace('https://', '') }}</span>
                    </span>
                    <span class="sk-route-link-arrow">
                      <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                        <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </span>
                  </a>

                  <!-- Next question prompt (for clarify mode) -->
                  <div v-if="msg.role === 'assistant' && msg.mode === 'clarify' && msg.next_question" class="sk-clarify">
                    <div class="sk-clarify-icon">💡</div>
                    <p class="sk-clarify-text">{{ msg.next_question }}</p>
                  </div>

                  <!-- Suggested actions -->
                  <div v-if="msg.role === 'assistant' && msg.actions && msg.actions.length > 0" class="sk-actions">
                    <button v-for="(action, aIdx) in msg.actions.slice(0, 3)" :key="aIdx"
                      class="sk-action-btn" @click="handleAction(action)">
                      {{ action.label }}
                    </button>
                  </div>
                </div>
              </div>
            </TransitionGroup>

            <!-- Typing indicator -->
            <Transition name="sk-msg-anim">
              <div v-if="loading" class="sk-msg sk-msg--ai sk-typing-row">
                <div class="sk-msg-avatar sk-msg-avatar--pulse">
                  <svg viewBox="0 0 24 24" fill="none" width="12" height="12">
                    <path d="M12 2l2.1 6.5H21l-5.6 4 2.2 6.5L12 15l-5.6 4 2.2-6.5L3 8.5h6.9L12 2z"
                      stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                  </svg>
                </div>
                <div class="sk-typing">
                  <div class="sk-typing-label">TikTak réfléchit</div>
                  <div class="sk-typing-dots">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            </Transition>

            <!-- Escalation card -->
            <Transition name="sk-msg-anim">
              <div v-if="showEscalation" class="sk-escalation-card">
                <div class="sk-esc-header">
                  <div class="sk-esc-icon">
                    <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                  </div>
                  <div>
                    <p class="sk-esc-title">Intervention humaine recommandée</p>
                    <p class="sk-esc-desc">Ce problème nécessite l'équipe support TikTak.</p>
                    <div v-if="lastAssistant?.signals?.severity" class="sk-esc-severity"
                      :class="`sk-severity--${lastAssistant.signals.severity}`">
                      {{ getSeverityLabel(lastAssistant.signals.severity) }}
                    </div>
                  </div>
                </div>
                <button class="sk-esc-btn" :disabled="loading" @click="confirmEscalation">
                  <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                    <path d="M12 4.5v15m7.5-7.5h-15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                  Créer un ticket support
                </button>
              </div>
            </Transition>

            <!-- Ticket created -->
            <Transition name="sk-msg-anim">
              <div v-if="lastAssistant?.ticket" class="sk-ticket-card">
                <div class="sk-ticket-icon">✓</div>
                <div>
                  <p class="sk-ticket-title">Ticket créé</p>
                  <p class="sk-ticket-id">{{ lastAssistant.ticket.id.slice(0, 8) }} · {{ lastAssistant.ticket.priority }}</p>
                </div>
              </div>
            </Transition>

          </div>

          <!-- ── Input Area ────────────────────────────── -->
          <div class="sk-input-area">
            <!-- Image Preview & Attachment Area -->
            <Transition name="sk-image-slide">
              <div v-if="selectedImage" class="sk-attachment-zone">
                <div class="sk-attachment-header">
                  <span class="sk-attachment-label">
                    <svg viewBox="0 0 24 24" fill="none" width="14" height="14" style="display: inline; margin-right: 4px;">
                      <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                      <circle cx="12" cy="13" r="3" stroke="currentColor" stroke-width="1.8"/>
                    </svg>
                    Image attachée
                  </span>
                  <div class="sk-attachment-actions">
                    <button type="button" class="sk-attachment-btn sk-attachment-change" 
                      :disabled="loading || dailyImageCount >= 2"
                      @click="openImagePicker"
                      title="Changer l'image">
                      <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                        <path d="M1 4v6h6M23 20v-6h-6M3.51 9a9 9 0 0114.85-3.36M20.49 15A9 9 0 005.64 20.64" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </button>
                    <button type="button" class="sk-attachment-btn sk-attachment-remove" 
                      @click="removeImage"
                      title="Supprimer l'image">
                      <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>

                <div class="sk-attachment-preview-container">
                  <img :src="selectedImage" :alt="'Screenshot'" class="sk-attachment-preview-img" />
                  <div class="sk-attachment-info">
                    <p class="sk-attachment-hint">L'image sera envoyée avec votre message</p>
                    <p class="sk-attachment-counter">{{ dailyImageCount }}/2 images utilisées aujourd'hui</p>
                  </div>
                </div>
              </div>
            </Transition>

            <!-- Input Form -->
            <form @submit.prevent="sendMessage" class="sk-input-form">
              <div class="sk-input-shell">
                <!-- Image Upload Button (when no image selected) -->
                <button v-if="!selectedImage" type="button" 
                  class="sk-input-btn sk-input-attach"
                  :disabled="loading || dailyImageCount >= 2"
                  :title="dailyImageCount >= 2 ? 'Limite de 2 images par jour atteinte' : 'Joindre une capture d\'écran'"
                  @click="openImagePicker">
                  <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                    <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" 
                      stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                    <circle cx="12" cy="13" r="3" stroke="currentColor" stroke-width="1.8"/>
                  </svg>
                </button>

                <!-- Image Attached Badge (when image selected) -->
                <div v-else class="sk-image-badge">
                  <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                    <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="currentColor" fill-opacity="0.1"/>
                    <circle cx="12" cy="13" r="3" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.1"/>
                  </svg>
                  <span class="sk-badge-text">1 image</span>
                </div>

                <!-- Hidden File Input -->
                <input ref="imageInput" type="file" accept="image/*" class="sk-hidden-input"
                  @change="handleImageSelected" style="display: none;" />

                <!-- Message Input -->
                <textarea v-model="userInput" class="sk-input-field" ref="inputEl"
                  :placeholder="getInputPlaceholder()"
                  :disabled="loading"
                  rows="1"
                  @keydown.enter.exact.prevent="sendMessage"
                  @input="autoResize" />

                <!-- Send Button -->
                <button class="sk-send-btn" type="submit"
                  :disabled="loading || !canSend()"
                  :class="{ 'sk-send-btn--active': canSend() && !loading }"
                  :title="getButtonTooltip()">
                  <svg v-if="!loading" viewBox="0 0 24 24" fill="none" width="16" height="16">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <svg v-else class="sk-spin" viewBox="0 0 24 24" fill="none" width="16" height="16">
                    <path d="M12 2a10 10 0 1010 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
            </form>

            <!-- Footer -->
            <p class="sk-input-footer">
              <span class="sk-footer-sparkle">✦</span>
              Propulsé par TikTak AI · Les réponses peuvent contenir des erreurs
            </p>
          </div>

        </div>
      </div>
    </Transition>

    <!-- ═══ Rating Overlay ════════════════════════════════ -->
    <Transition name="sk-overlay-fade">
      <div v-if="showRating" class="sk-rating-overlay" @click.self="showRating = false">
        <div class="sk-rating-card">
          <div class="sk-rating-header">
            <div class="sk-rating-icon">⭐</div>
            <h3>Comment s'est passé le support ?</h3>
            <p>Votre avis améliore l'assistant IA.</p>
          </div>

          <div class="sk-stars">
            <button v-for="n in 5" :key="n" class="sk-star"
              :class="{ 'sk-star--active': n <= ratingStars }"
              @click="ratingStars = n">★</button>
          </div>
          <p class="sk-star-label">{{ ['', 'Mauvais', 'Passable', 'Correct', 'Bien', 'Excellent'][ratingStars] }}</p>

          <textarea v-model="ratingComment" class="sk-rating-textarea"
            placeholder="Commentaire optionnel…" rows="3" />

          <div class="sk-rating-actions">
            <button class="sk-rbtn sk-rbtn--ghost" @click="showRating = false" :disabled="ending">Annuler</button>
            <button class="sk-rbtn sk-rbtn--primary" :disabled="ratingStars === 0 || ending" @click="submitRating">
              <svg v-if="ending" class="sk-spin" viewBox="0 0 24 24" fill="none" width="14" height="14">
                <path d="M12 2a10 10 0 1010 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              {{ ending ? 'Enregistrement…' : 'Clôturer la session' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import VisionAnalysisFeedback from './VisionAnalysisFeedback.vue'
import {
  askSupportAI,
  startConversation,
  loadConversationHistory,
  endConversation,
  getModuleName,
} from '@/utils/supportApi'

/* ─── Types ───────────────────────────────────────────── */
type ChatMessage = {
  role: 'user' | 'assistant'
  text: string
  mode?: 'solve' | 'clarify' | 'escalate'
  next_question?: string | null
  ticket?: any
  evidence?: any[]
  signals?: any
  actions?: any[]
  route_link?: string | null
  vision?: any | null
  meta?: {
    confidence?: number
    verdict?: 'user_side' | 'tiktak_side' | 'unclear'
    detected_module?: string
    severity?: string
  }
}

type Suggestion = {
  id: string
  icon: string
  label: string
  message: string
}

/* ─── Constants ───────────────────────────────────────── */
const STORAGE_KEY = 'tiktak_support_conversation_id'
const STORAGE_NAME = 'tiktak_support_name'

const suggestions: Suggestion[] = [
  { id: 'order',    icon: '📦', label: 'Problème de commande',       message: "J'ai un problème avec ma commande" },
  { id: 'payment',  icon: '💳', label: 'Paiement & facturation',     message: "J'ai un problème de paiement" },
  { id: 'builder',  icon: '🎨', label: 'Mon site web / design',      message: "J'ai besoin d'aide pour modifier mon site web" },
  { id: 'shipping', icon: '🚚', label: 'Livraison & expédition',     message: "J'ai une question sur la livraison" },
  { id: 'product',  icon: '🏷️', label: 'Gestion des produits',       message: "J'ai besoin d'aide pour gérer mes produits" },
  { id: 'settings', icon: '⚙️', label: 'Paramètres & configuration', message: "J'ai besoin d'aide avec les paramètres" },
]

/* ─── State ───────────────────────────────────────────── */
const isOpen = ref(false)
const messages = ref<ChatMessage[]>([])
const userInput = ref('')
const lastUserMessage = ref('')
const loading = ref(false)
const conversationId = ref<string | null>(null)
const messagesEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)
const unreadCount = ref(0)

// Quick info
const showInfoBar = ref(false)
const quickName = ref('')
const quickEmail = ref('')
const infoDismissed = ref(false)

// Rating
const showRating = ref(false)
const ratingStars = ref(0)
const ratingComment = ref('')
const ending = ref(false)

// Image upload
const imageInput = ref<HTMLInputElement | null>(null)
const selectedImage = ref<string | null>(null)
const dailyImageCount = ref(0)

/* ─── Computed ────────────────────────────────────────── */
const lastAssistant = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i]?.role === 'assistant') return messages.value[i]
  }
  return null
})

const showEscalation = computed(() => {
  const la = lastAssistant.value
  return la?.mode === 'escalate' && !la?.ticket
})

/* ─── Helper Methods for Input Area ──────────────────– */
function getInputPlaceholder(): string {
  if (selectedImage.value) {
    return 'Décrivez ce que vous voyez ou posez une question...'
  }
  if (lastAssistant.value?.next_question) {
    const q = lastAssistant.value.next_question
    return q.length > 60 ? q.slice(0, 57) + '…' : q
  }
  return 'Décrivez votre problème ou joignez une capture d\'écran…'
}

function canSend(): boolean {
  // Can send if: text is present OR image is selected
  return userInput.value.trim().length > 0 || selectedImage.value !== null
}

function getButtonTooltip(): string {
  if (loading.value) return 'Envoi en cours...'
  if (!canSend()) {
    if (!selectedImage.value) {
      return 'Décrivez votre problème ou joignez une image'
    }
    return 'Votre image sera envoyée à l\'analyse'
  }
  return 'Envoyer le message et l\'image'
}

/* ─── Lifecycle ───────────────────────────────────────── */
onMounted(async () => {
  const savedName = localStorage.getItem(STORAGE_NAME)
  if (savedName) quickName.value = savedName

  // Initialize daily image counter
  checkDailyImageLimit()

  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) return

  try {
    const data = await loadConversationHistory(saved)
    conversationId.value = data.conversation_id
    if (data.intake?.client_name) quickName.value = data.intake.client_name

    messages.value = data.messages
      .filter((m: any) => m.role !== 'system')
      .map((m: any) => ({
        role: m.role,
        text: m.content,
        mode: m.meta?.mode,
        next_question: m.meta?.next_question ?? null,
        evidence: m.meta?.evidence || [],
        actions: m.meta?.actions || [],
        route_link: m.meta?.route_link || null,
        vision: m.meta?.vision || null,
        meta: {
          confidence: m.meta?.confidence,
          verdict: m.meta?.verdict,
          detected_module: m.meta?.detected_module,
          severity: m.meta?.severity,
        },
      }))

    await scrollBottom()
  } catch {
    localStorage.removeItem(STORAGE_KEY)
  }
})

/* ─── Panel ───────────────────────────────────────────── */
function openPanel() {
  isOpen.value = true
  unreadCount.value = 0
  nextTick(() => inputEl.value?.focus())
}

function closePanel() {
  isOpen.value = false
}

/* ─── Quick Info ──────────────────────────────────────── */
function saveQuickInfo() {
  if (quickName.value.trim()) {
    localStorage.setItem(STORAGE_NAME, quickName.value.trim())
  }
  showInfoBar.value = false
  infoDismissed.value = true
}

function dismissInfoBar() {
  showInfoBar.value = false
  infoDismissed.value = true
}

/* ─── Create Conversation (silent) ───────────────────── */
async function ensureConversation(subject: string): Promise<boolean> {
  if (conversationId.value) return true

  try {
    const name = quickName.value.trim() || 'Visiteur'
    const res = await startConversation({
      intake: {
        enterprise: 'TikTak Client',
        problem_subject: subject.slice(0, 200),
        affected_url: typeof window !== 'undefined' ? window.location.href : 'https://tiktak.pro',
        client_name: name,
        client_email: quickEmail.value.trim() || undefined,
      },
    })
    conversationId.value = res.conversation_id
    localStorage.setItem(STORAGE_KEY, res.conversation_id)
    return true
  } catch {
    return false
  }
}

/* ─── Messaging ───────────────────────────────────────── */
async function sendMessage() {
  const text = userInput.value.trim()
  const hasImage = selectedImage.value !== null
  
  // Can send if: text OR image present, and not already loading
  if ((!text && !hasImage) || loading.value) return

  // Determine conversation subject
  let subject = text || 'Analyse de capture d\'écran'
  
  const created = await ensureConversation(subject)
  if (!created) return

  lastUserMessage.value = text

  // Add user message to display
  messages.value.push({ 
    role: 'user', 
    text: text || '📸 [Capture d\'écran jointe]'
  })
  
  userInput.value = ''
  resetTextarea()
  loading.value = true
  await scrollBottom()

  if (!infoDismissed.value && !quickName.value.trim()) {
    showInfoBar.value = true
  }

  try {
    const res = await askSupportAI(
      text || '[Screenshot shared - vision analysis required]',
      conversationId.value!, 
      false, 
      selectedImage.value ?? undefined
    )
    
    messages.value.push({
      role: 'assistant',
      text: res.answer,
      mode: res.mode,
      next_question: res.next_question,
      ticket: res.ticket,
      evidence: res.evidence || [],
      signals: res.signals,
      actions: res.actions || [],
      route_link: res.route_link || null,
      vision: res.vision || null,
      meta: {
        confidence: res.confidence,
        verdict: res.verdict,
        detected_module: res.context || res.category,
        severity: res.signals?.severity,
      },
    })

    selectedImage.value = null
    if (!isOpen.value) unreadCount.value++
  } catch {
    messages.value.push({
      role: 'assistant',
      text: "Désolé, une erreur s'est produite. Veuillez réessayer.",
      mode: 'solve',
    })
  } finally {
    loading.value = false
    await scrollBottom()
    nextTick(() => inputEl.value?.focus())
  }
}

async function useSuggestion(s: Suggestion) {
  userInput.value = s.message
  await sendMessage()
}

function handleAction(action: any) {
  if (action.url) {
    window.open(action.url, '_blank', 'noopener')
    return
  }
  if (action.label) {
    userInput.value = action.label
    nextTick(() => inputEl.value?.focus())
  }
}

/* ─── Escalation ──────────────────────────────────────── */
async function confirmEscalation() {
  if (!conversationId.value || !lastUserMessage.value) return
  loading.value = true
  await scrollBottom()

  try {
    const res = await askSupportAI(lastUserMessage.value, conversationId.value, true, selectedImage.value ?? undefined)
    messages.value.push({
      role: 'assistant',
      text: res.answer,
      mode: res.mode,
      next_question: res.next_question,
      ticket: res.ticket,
      evidence: res.evidence || [],
      signals: res.signals,
      actions: res.actions || [],
      route_link: res.route_link || null,
      vision: res.vision || null,
      meta: {
        confidence: res.confidence,
        verdict: res.verdict,
        detected_module: res.context || res.category,
        severity: res.signals?.severity,
      },
    })
  } finally {
    loading.value = false
    await scrollBottom()
  }
}

/* ─── Rating ──────────────────────────────────────────── */
function openEndChat() {
  showRating.value = true
}

async function submitRating() {
  if (!conversationId.value) return
  ending.value = true

  try {
    await endConversation(conversationId.value, ratingStars.value, ratingComment.value)
    localStorage.removeItem(STORAGE_KEY)
    conversationId.value = null
    messages.value = []
    showRating.value = false
    ratingStars.value = 0
    ratingComment.value = ''
  } finally {
    ending.value = false
  }
}

/* ─── Helpers ─────────────────────────────────────────── */
async function scrollBottom() {
  await nextTick()
  messagesEl.value?.scrollTo({ top: messagesEl.value.scrollHeight, behavior: 'smooth' })
}

function autoResize() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

function resetTextarea() {
  nextTick(() => {
    const el = inputEl.value
    if (el) el.style.height = 'auto'
  })
}

/* ─── Image Upload with Rate Limiting ───────────────── */
function getDailyImageKey(): string {
  const today = new Date().toISOString().split('T')[0]
  const tenantId = conversationId.value || 'anonymous'
  return `imageuploads_${tenantId}_${today}`
}

function checkDailyImageLimit(): boolean {
  const key = getDailyImageKey()
  const stored = localStorage.getItem(key)
  const uploads = stored ? JSON.parse(stored) : []
  dailyImageCount.value = uploads.length
  return uploads.length < 2
}

function updateDailyCounter(): void {
  const key = getDailyImageKey()
  const stored = localStorage.getItem(key)
  const uploads = stored ? JSON.parse(stored) : []
  uploads.push(new Date().toISOString())
  localStorage.setItem(key, JSON.stringify(uploads))
  dailyImageCount.value = uploads.length
}

function openImagePicker(): void {
  if (!checkDailyImageLimit()) {
    alert('Limite de 2 images par jour atteinte')
    return
  }
  imageInput.value?.click()
}

async function handleImageSelected(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  // Validate file type
  if (!file.type.startsWith('image/')) {
    alert('Veuillez sélectionner une image')
    return
  }

  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    alert('Fichier trop volumineux (max 5MB)')
    return
  }

  try {
    // Convert to base64
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result
      if (typeof result === 'string') {
        selectedImage.value = result
        updateDailyCounter()
      }
    }
    reader.readAsDataURL(file)
  } catch {
    alert('Erreur lors du chargement de l\'image')
  }

  // Reset input
  target.value = ''
}

function removeImage(): void {
  selectedImage.value = null
}

/* ─── Markdown renderer ──────────────────────────────── */
function renderMarkdown(text: string): string {
  if (!text) return ''
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="sk-code-block"><code>$2</code></pre>')

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="sk-code-inline">$1</code>')

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')

  // Italic (single asterisks not adjacent to other asterisks)
  html = html.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')

  // Links - render as styled link cards for dashboard URLs, regular links otherwise
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    if (url.includes('app.tiktak.pro')) {
      return `<a href="${url}" target="_blank" rel="noopener" class="sk-dash-link"><span class="sk-dash-link-icon">\u{1F517}</span> ${label}</a>`
    }
    return `<a href="${url}" target="_blank" rel="noopener" class="sk-link">${label}</a>`
  })

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="sk-divider">')

  // Pre-process: split inline numbered steps onto separate lines
  // Matches patterns like "1. step one 2. step two" or "1) step one 2) step two"
  html = html.replace(/([.!?:])\s+(\d+[.)]\s)/g, '$1\n$2')
  // Also handle "text : 1. step" (colon then step)
  html = html.replace(/:\s+(\d+[.)]\s)/g, ':\n$1')

  // Pre-process: split inline bullet points onto separate lines
  html = html.replace(/([.!?])\s+([-•]\s)/g, '$1\n$2')

  // Split into paragraphs
  const paragraphs = html.split(/\n\n+/)
  html = paragraphs.map(p => {
    const lines = p.split('\n')
    const isUL = lines.every(l => /^\s*[-•*]\s/.test(l) || l.trim() === '')
    const isOL = lines.every(l => /^\s*\d+[.)]\s/.test(l) || l.trim() === '')

    if (isUL && lines.some(l => l.trim())) {
      const items = lines.filter(l => l.trim()).map(l => {
        const content = l.replace(/^\s*[-•*]\s+/, '')
        return `<li><span class="sk-li-marker">\u2022</span><span class="sk-li-content">${content}</span></li>`
      }).join('')
      return `<ul class="sk-list sk-list--styled">${items}</ul>`
    }
    if (isOL && lines.some(l => l.trim())) {
      let stepNum = 0
      const items = lines.filter(l => l.trim()).map(l => {
        stepNum++
        const content = l.replace(/^\s*\d+[.)]\s+/, '')
        return `<li><span class="sk-step-num">${stepNum}</span><span class="sk-li-content">${content}</span></li>`
      }).join('')
      return `<ol class="sk-list sk-list--steps">${items}</ol>`
    }
    return `<p>${p.replace(/\n/g, '<br>')}</p>`
  }).join('')

  return html
}

/* ─── UI helpers ──────────────────────────────────────── */
function getConfidenceClass(c: number): string {
  if (c >= 0.75) return 'sk-badge--high'
  if (c >= 0.5) return 'sk-badge--medium'
  return 'sk-badge--low'
}

function getVerdictClass(v: string): string {
  return v === 'user_side' ? 'sk-badge--info' : v === 'tiktak_side' ? 'sk-badge--danger' : 'sk-badge--muted'
}

function getVerdictIcon(v: string): string {
  return v === 'user_side' ? '👤' : v === 'tiktak_side' ? '⚙️' : '🔍'
}

function getVerdictLabel(v: string): string {
  return v === 'user_side' ? 'Config client' : v === 'tiktak_side' ? 'Problème TikTak' : 'En diagnostic'
}

function getModuleLabel(mod: string): string {
  const labels: Record<string, string> = {
    orders: 'Commandes',
    products: 'Produits',
    builder: 'Constructeur de site',
    settings: 'Paramètres',
    shipping: 'Expédition',
    payments: 'Paiements',
    billing: 'Facturation',
    pos: 'Point de vente',
    apps: 'Applications',
    customers: 'Clients',
  }
  return labels[mod] || mod
}

function getSeverityLabel(s: string): string {
  const m: Record<string, string> = { critical: 'Critique', high: 'Élevée', medium: 'Moyenne', low: 'Faible' }
  return m[s] || s
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800&display=swap');

/* ═══════════════════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════════════════ */
.sk-root {
  --sk-ink: #0f172a;
  --sk-ink-2: #1e293b;
  --sk-ink-3: #334155;
  --sk-teal: #10b981;
  --sk-teal-soft: rgba(16, 185, 129, 0.12);
  --sk-teal-glow: rgba(16, 185, 129, 0.25);
  --sk-blue: #3b82f6;
  --sk-amber: #f59e0b;
  --sk-red: #ef4444;
  --sk-surface: #ffffff;
  --sk-canvas: #f8fafc;
  --sk-border: #e2e8f0;
  --sk-border-2: #cbd5e1;
  --sk-text: #0f172a;
  --sk-text-2: #475569;
  --sk-text-3: #94a3b8;
  --sk-radius-sm: 8px;
  --sk-radius-md: 12px;
  --sk-radius-lg: 16px;
  --sk-radius-xl: 20px;
  --sk-radius-full: 9999px;
  --sk-shadow-sm: 0 1px 3px rgba(0,0,0,0.06);
  --sk-shadow-md: 0 4px 16px rgba(0,0,0,0.08);
  --sk-shadow-lg: 0 12px 40px rgba(0,0,0,0.12);
  --sk-shadow-xl: 0 24px 64px rgba(0,0,0,0.18);

  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  position: relative;
  z-index: 99990;
}

/* ═══════════════════════════════════════════════════════
   FAB TRIGGER
   ═══════════════════════════════════════════════════════ */
.sk-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, var(--sk-ink) 0%, var(--sk-ink-2) 100%);
  color: var(--sk-teal);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 32px rgba(15, 23, 42, 0.35), 0 0 0 0 var(--sk-teal-glow);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
  z-index: 99999;
}

.sk-fab:hover {
  transform: scale(1.1);
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.4), 0 0 0 8px var(--sk-teal-glow);
}

.sk-fab:active { transform: scale(0.95); }

.sk-fab-icon {
  animation: sk-fab-breathe 3s ease-in-out infinite;
}

@keyframes sk-fab-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.12) rotate(15deg); }
}

.sk-fab-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background: var(--sk-red);
  color: white;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  border: 2px solid white;
  animation: sk-badge-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes sk-badge-pop {
  from { transform: scale(0); }
  to { transform: scale(1); }
}

.sk-fab-pop-enter-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.sk-fab-pop-leave-active { transition: all 0.15s ease-in; }
.sk-fab-pop-enter-from, .sk-fab-pop-leave-to { opacity: 0; transform: scale(0.5); }

/* ═══════════════════════════════════════════════════════
   PANEL (SIDEKICK SLIDE)
   ═══════════════════════════════════════════════════════ */
.sk-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99998;
  display: flex;
  justify-content: flex-end;
  align-items: stretch;
}

.sk-panel {
  width: 440px;
  max-width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--sk-surface);
  box-shadow: -8px 0 40px rgba(15, 23, 42, 0.15);
  position: relative;
  overflow: hidden;
}

@media (max-width: 480px) {
  .sk-panel { width: 100vw; }
}

.sk-slide-enter-active { transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
.sk-slide-leave-active { transition: all 0.25s cubic-bezier(0.4, 0, 1, 1); }
.sk-slide-enter-from { opacity: 0; }
.sk-slide-leave-to { opacity: 0; }
.sk-slide-enter-from .sk-panel { transform: translateX(100%); }
.sk-slide-leave-to .sk-panel { transform: translateX(100%); }

/* ═══════════════════════════════════════════════════════
   HEADER
   ═══════════════════════════════════════════════════════ */
.sk-header {
  background: var(--sk-ink);
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
}

.sk-header::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 90% 50%, rgba(16, 185, 129, 0.08) 0%, transparent 60%),
    radial-gradient(ellipse at 10% 100%, rgba(59, 130, 246, 0.05) 0%, transparent 50%);
  pointer-events: none;
}

.sk-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  z-index: 1;
}

.sk-header-avatar {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--sk-teal-soft), rgba(16, 185, 129, 0.04));
  border: 1px solid rgba(16, 185, 129, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sk-teal);
  flex-shrink: 0;
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.1);
}

.sk-header-avatar svg {
  animation: sk-star-spin 6s ease-in-out infinite;
}

@keyframes sk-star-spin {
  0%, 100% { transform: rotate(0) scale(1); }
  50% { transform: rotate(180deg) scale(1.1); }
}

.sk-header-title {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  margin: 0;
  letter-spacing: -0.02em;
}

.sk-header-status {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.45);
  margin: 2px 0 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.sk-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sk-teal);
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
  animation: sk-dot-pulse 2.5s ease-in-out infinite;
}

@keyframes sk-dot-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.sk-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
  z-index: 1;
}

.sk-hbtn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.6);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  font-family: inherit;
}

.sk-hbtn:hover {
  background: rgba(255,255,255,0.12);
  color: #fff;
}

.sk-hbtn--end {
  width: auto;
  padding: 0 10px;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
}

.sk-hbtn--end::after {
  content: 'Terminer';
}

/* ═══════════════════════════════════════════════════════
   QUICK INFO BAR
   ═══════════════════════════════════════════════════════ */
.sk-info-bar {
  background: linear-gradient(135deg, #f0fdf4, #ecfdf5);
  border-bottom: 1px solid #bbf7d0;
  padding: 12px 20px;
  flex-shrink: 0;
}

.sk-info-inner {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sk-info-label {
  font-size: 12px;
  font-weight: 600;
  color: #166534;
  margin: 0;
}

.sk-info-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.sk-info-input {
  border: 1px solid #bbf7d0;
  border-radius: var(--sk-radius-sm);
  padding: 7px 10px;
  font-size: 12.5px;
  font-family: inherit;
  background: white;
  color: var(--sk-text);
  outline: none;
  transition: border-color 0.15s;
}

.sk-info-input:focus {
  border-color: var(--sk-teal);
  box-shadow: 0 0 0 2px var(--sk-teal-soft);
}

.sk-info-input::placeholder { color: var(--sk-text-3); }

.sk-info-actions {
  display: flex;
  gap: 8px;
}

.sk-info-save {
  padding: 6px 14px;
  border-radius: var(--sk-radius-sm);
  border: none;
  background: #166534;
  color: white;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
}

.sk-info-save:hover { background: #15803d; }

.sk-info-dismiss {
  padding: 6px 14px;
  border-radius: var(--sk-radius-sm);
  border: 1px solid #bbf7d0;
  background: transparent;
  color: #166534;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
}

.sk-info-slide-enter-active, .sk-info-slide-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}
.sk-info-slide-enter-from, .sk-info-slide-leave-to {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  opacity: 0;
}
.sk-info-slide-enter-to, .sk-info-slide-leave-from {
  max-height: 200px;
}

/* ═══════════════════════════════════════════════════════
   MESSAGES AREA
   ═══════════════════════════════════════════════════════ */
.sk-messages {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px;
  background: var(--sk-canvas);
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: var(--sk-border) transparent;
}

.sk-messages::-webkit-scrollbar { width: 4px; }
.sk-messages::-webkit-scrollbar-thumb { background: var(--sk-border-2); border-radius: 4px; }

/* ── Welcome State ────────────────────────────────────── */
.sk-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 16px 16px;
  animation: sk-fade-up 0.5s ease both;
}

.sk-welcome-sparkle {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: linear-gradient(135deg, var(--sk-teal-soft), rgba(59, 130, 246, 0.08));
  border: 1px solid rgba(16, 185, 129, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  color: var(--sk-teal);
  box-shadow: 0 0 30px rgba(16, 185, 129, 0.08);
}

.sk-welcome-sparkle svg {
  animation: sk-star-spin 6s ease-in-out infinite;
}

.sk-welcome-title {
  font-size: 20px;
  font-weight: 800;
  color: var(--sk-text);
  margin: 0 0 6px;
  letter-spacing: -0.03em;
}

.sk-welcome-desc {
  font-size: 14px;
  color: var(--sk-text-2);
  margin: 0 0 24px;
  line-height: 1.5;
  max-width: 320px;
}

/* ── Suggestions ──────────────────────────────────────── */
.sk-suggestions {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sk-suggestion {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border-radius: var(--sk-radius-md);
  border: 1px solid var(--sk-border);
  background: var(--sk-surface);
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
  font-family: inherit;
}

.sk-suggestion:hover {
  border-color: var(--sk-teal);
  background: var(--sk-teal-soft);
  transform: translateX(4px);
  box-shadow: var(--sk-shadow-sm);
}

.sk-suggestion-icon {
  font-size: 18px;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--sk-radius-sm);
  background: var(--sk-canvas);
  display: flex;
  align-items: center;
  justify-content: center;
}

.sk-suggestion:hover .sk-suggestion-icon {
  background: white;
}

.sk-suggestion-text {
  flex: 1;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--sk-text);
}

.sk-suggestion-arrow {
  color: var(--sk-text-3);
  flex-shrink: 0;
  transition: transform 0.15s, color 0.15s;
}

.sk-suggestion:hover .sk-suggestion-arrow {
  color: var(--sk-teal);
  transform: translateX(3px);
}

/* ── Message List ─────────────────────────────────────── */
.sk-msg-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sk-msg {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  animation: sk-fade-up 0.25s ease both;
}

.sk-msg--user {
  flex-direction: row-reverse;
}

.sk-msg-avatar {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: var(--sk-ink);
  border: 1px solid rgba(16, 185, 129, 0.2);
  color: var(--sk-teal);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 20px;
}

.sk-msg-avatar--pulse {
  animation: sk-avatar-pulse 2s ease-in-out infinite;
}

@keyframes sk-avatar-pulse {
  0%, 100% { box-shadow: 0 0 0 0 transparent; }
  50% { box-shadow: 0 0 0 6px var(--sk-teal-soft); }
}

.sk-msg-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 85%;
  min-width: 0;
}

.sk-msg-body--user {
  align-items: flex-end;
}

.sk-msg-sender {
  font-size: 11px;
  font-weight: 700;
  color: var(--sk-text-3);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0 4px;
}

.sk-bubble {
  border-radius: var(--sk-radius-lg);
  padding: 12px 16px;
  max-width: 100%;
  word-break: break-word;
}

.sk-bubble--ai {
  background: var(--sk-surface);
  border: 1px solid var(--sk-border);
  border-top-left-radius: 4px;
  box-shadow: var(--sk-shadow-sm);
}

.sk-bubble--user {
  background: var(--sk-ink);
  border-top-right-radius: 4px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.2);
}

.sk-bubble-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255,255,255,0.92);
  white-space: pre-wrap;
}

.sk-bubble-content {
  font-size: 14px;
  line-height: 1.65;
  color: var(--sk-text);
}

.sk-bubble-content :deep(p) {
  margin: 0 0 8px;
}

.sk-bubble-content :deep(p:last-child) {
  margin-bottom: 0;
}

.sk-bubble-content :deep(strong) {
  font-weight: 700;
  color: var(--sk-ink);
}

.sk-bubble-content :deep(em) {
  font-style: italic;
}

.sk-bubble-content :deep(.sk-list) {
  margin: 6px 0;
  padding-left: 20px;
}

.sk-bubble-content :deep(.sk-list li) {
  margin-bottom: 4px;
  line-height: 1.5;
}

.sk-bubble-content :deep(.sk-code-inline) {
  background: var(--sk-canvas);
  border: 1px solid var(--sk-border);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 12.5px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  color: var(--sk-ink-2);
}

.sk-bubble-content :deep(.sk-code-block) {
  background: var(--sk-ink);
  border-radius: var(--sk-radius-sm);
  padding: 12px 14px;
  margin: 8px 0;
  overflow-x: auto;
}

.sk-bubble-content :deep(.sk-code-block code) {
  font-size: 12.5px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  color: #e2e8f0;
  white-space: pre;
}

.sk-bubble-content :deep(.sk-link) {
  color: var(--sk-blue);
  text-decoration: none;
  border-bottom: 1px solid rgba(59, 130, 246, 0.3);
  transition: border-color 0.15s;
}

.sk-bubble-content :deep(.sk-link:hover) {
  border-color: var(--sk-blue);
}

/* ── Meta Badges ──────────────────────────────────────── */
.sk-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--sk-border);
}

.sk-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: var(--sk-radius-full);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.sk-badge--module {
  background: var(--sk-canvas);
  color: var(--sk-text-2);
  border: 1px solid var(--sk-border);
}

.sk-badge--high { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
.sk-badge--medium { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
.sk-badge--low { background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }
.sk-badge--info { background: #eff6ff; color: #1e40af; border: 1px solid #93c5fd; }
.sk-badge--danger { background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }
.sk-badge--muted { background: var(--sk-canvas); color: var(--sk-text-3); border: 1px solid var(--sk-border); }

/* ── Evidence ─────────────────────────────────────────── */
.sk-evidence {
  margin-top: 8px;
}

.sk-evidence-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--sk-text-3);
  cursor: pointer;
  padding: 4px 0;
  transition: color 0.15s;
  list-style: none;
}

.sk-evidence-summary::-webkit-details-marker { display: none; }
.sk-evidence-summary::before { content: '▸ '; transition: transform 0.15s; }
[open] > .sk-evidence-summary::before { content: '▾ '; }

.sk-evidence-summary:hover { color: var(--sk-text-2); }

.sk-evidence-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0 4px;
}

.sk-evidence-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 8px;
  border-radius: var(--sk-radius-sm);
  background: var(--sk-canvas);
  border: 1px solid var(--sk-border);
}

.sk-evidence-type { font-size: 12px; flex-shrink: 0; }

.sk-evidence-snippet {
  font-size: 11.5px;
  color: var(--sk-text-2);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── Clarify Box ──────────────────────────────────────── */
.sk-clarify {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  margin-top: 6px;
  border-radius: var(--sk-radius-md);
  background: linear-gradient(135deg, #fffbeb, #fef3c7);
  border: 1px solid #fcd34d;
}

.sk-clarify-icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }

.sk-clarify-text {
  font-size: 12.5px;
  color: #92400e;
  margin: 0;
  line-height: 1.5;
  font-weight: 500;
}

/* ── Actions ──────────────────────────────────────────── */
.sk-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.sk-action-btn {
  padding: 6px 12px;
  border-radius: var(--sk-radius-full);
  border: 1px solid var(--sk-border);
  background: var(--sk-surface);
  color: var(--sk-text-2);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}

.sk-action-btn:hover {
  border-color: var(--sk-teal);
  color: var(--sk-teal);
  background: var(--sk-teal-soft);
}

/* ── Dashboard Route Link ─────────────────────────────── */
.sk-route-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  margin-top: 8px;
  border-radius: var(--sk-radius-md);
  background: linear-gradient(135deg, #f0fdfa, #ecfdf5);
  border: 1px solid #99f6e4;
  text-decoration: none;
  transition: all 0.2s ease;
  cursor: pointer;
}

.sk-route-link:hover {
  border-color: var(--sk-teal);
  background: linear-gradient(135deg, #ccfbf1, #d1fae5);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(20, 184, 166, 0.15);
}

.sk-route-link-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: white;
  border: 1px solid #99f6e4;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sk-teal);
  flex-shrink: 0;
}

.sk-route-link-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.sk-route-link-label {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--sk-ink);
}

.sk-route-link-url {
  font-size: 11px;
  color: var(--sk-teal);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sk-route-link-arrow {
  color: var(--sk-text-3);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.sk-route-link:hover .sk-route-link-arrow {
  transform: translateX(2px);
  color: var(--sk-teal);
}

/* ── Improved Step Numbers ────────────────────────────── */
.sk-bubble-content :deep(.sk-list--steps) {
  list-style: none;
  padding-left: 0;
  margin: 8px 0;
  counter-reset: none;
}

.sk-bubble-content :deep(.sk-list--steps li) {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: var(--sk-radius-sm);
  background: var(--sk-canvas);
  border: 1px solid var(--sk-border);
  transition: background 0.15s;
}

.sk-bubble-content :deep(.sk-list--steps li:hover) {
  background: #f0fdfa;
}

.sk-bubble-content :deep(.sk-step-num) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--sk-teal);
  color: white;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}

.sk-bubble-content :deep(.sk-li-content) {
  flex: 1;
  min-width: 0;
}

/* ── Improved UL bullets ──────────────────────────────── */
.sk-bubble-content :deep(.sk-list--styled) {
  list-style: none;
  padding-left: 0;
  margin: 6px 0;
}

.sk-bubble-content :deep(.sk-list--styled li) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 4px;
  line-height: 1.5;
}

.sk-bubble-content :deep(.sk-li-marker) {
  color: var(--sk-teal);
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}

/* ── Inline Dashboard Links ───────────────────────────── */
.sk-bubble-content :deep(.sk-dash-link) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--sk-radius-full);
  background: #f0fdfa;
  border: 1px solid #99f6e4;
  color: var(--sk-teal);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.15s ease;
}

.sk-bubble-content :deep(.sk-dash-link:hover) {
  background: #ccfbf1;
  border-color: var(--sk-teal);
}

.sk-bubble-content :deep(.sk-dash-link .sk-dash-link-icon) {
  font-size: 11px;
}

/* ── Horizontal Divider ───────────────────────────────── */
.sk-bubble-content :deep(.sk-divider) {
  border: none;
  border-top: 1px solid var(--sk-border);
  margin: 10px 0;
}

/* ── Typing Indicator ─────────────────────────────────── */
.sk-typing-row {
  margin-top: 8px;
}

.sk-typing {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sk-typing-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--sk-text-3);
  padding: 0 4px;
  animation: sk-typing-fade 2s ease-in-out infinite;
}

@keyframes sk-typing-fade {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.sk-typing-dots {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 14px 18px;
  background: var(--sk-surface);
  border: 1px solid var(--sk-border);
  border-radius: var(--sk-radius-lg);
  border-top-left-radius: 4px;
  width: fit-content;
  box-shadow: var(--sk-shadow-sm);
}

.sk-typing-dots span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--sk-text-3);
  animation: sk-dot-bounce 1.4s ease-in-out infinite;
}

.sk-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.sk-typing-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes sk-dot-bounce {
  0%, 60%, 100% { transform: translateY(0); background: var(--sk-text-3); }
  30% { transform: translateY(-6px); background: var(--sk-teal); }
}

/* ── Escalation Card ──────────────────────────────────── */
.sk-escalation-card {
  margin-top: 12px;
  padding: 16px;
  border-radius: var(--sk-radius-lg);
  background: linear-gradient(135deg, #fef2f2, #fff1f2);
  border: 1px solid #fca5a5;
  animation: sk-fade-up 0.3s ease both;
}

.sk-esc-header {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.sk-esc-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: white;
  border: 1px solid #fca5a5;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sk-red);
  flex-shrink: 0;
}

.sk-esc-title {
  font-size: 13px;
  font-weight: 700;
  color: #991b1b;
  margin: 0;
}

.sk-esc-desc {
  font-size: 12px;
  color: #b91c1c;
  margin: 3px 0 0;
}

.sk-esc-severity {
  margin-top: 6px;
  padding: 3px 8px;
  border-radius: var(--sk-radius-full);
  font-size: 10.5px;
  font-weight: 700;
  display: inline-block;
}

.sk-severity--critical { background: #fecaca; color: #991b1b; }
.sk-severity--high { background: #fed7aa; color: #9a3412; }
.sk-severity--medium { background: #fef3c7; color: #92400e; }
.sk-severity--low { background: #e2e8f0; color: #475569; }

.sk-esc-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 11px 16px;
  border-radius: var(--sk-radius-md);
  border: none;
  background: #991b1b;
  color: white;
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}

.sk-esc-btn:hover:not(:disabled) { background: #7f1d1d; transform: translateY(-1px); }
.sk-esc-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Ticket Created ───────────────────────────────────── */
.sk-ticket-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 14px 16px;
  border-radius: var(--sk-radius-lg);
  background: linear-gradient(135deg, #ecfdf5, #d1fae5);
  border: 1px solid #6ee7b7;
  animation: sk-fade-up 0.3s ease both;
}

.sk-ticket-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #065f46;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  flex-shrink: 0;
}

.sk-ticket-title {
  font-size: 13px;
  font-weight: 700;
  color: #065f46;
  margin: 0;
}

.sk-ticket-id {
  font-size: 11.5px;
  color: #047857;
  margin: 2px 0 0;
  font-family: 'SF Mono', monospace;
}

/* ═══════════════════════════════════════════════════════
   INPUT AREA
   ═══════════════════════════════════════════════════════ */
.sk-input-area {
  padding: 14px 20px 16px;
  background: var(--sk-surface);
  border-top: 1px solid var(--sk-border);
  flex-shrink: 0;
}

.sk-input-form {
  display: flex;
  flex-direction: column;
}

.sk-input-shell {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--sk-canvas);
  border: 1.5px solid var(--sk-border);
  border-radius: var(--sk-radius-lg);
  padding: 6px 6px 6px 16px;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}

.sk-input-shell:focus-within {
  border-color: var(--sk-teal);
  background: var(--sk-surface);
  box-shadow: 0 0 0 3px var(--sk-teal-soft);
}

.sk-input-field {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  font-family: inherit;
  color: var(--sk-text);
  line-height: 1.5;
  resize: none;
  max-height: 120px;
  padding: 6px 0;
}

.sk-input-field::placeholder { color: var(--sk-text-3); }
.sk-input-field:disabled { opacity: 0.5; cursor: not-allowed; }

.sk-send-btn {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border: none;
  border-radius: 10px;
  background: var(--sk-border);
  color: var(--sk-text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.sk-send-btn--active {
  background: var(--sk-ink);
  color: var(--sk-teal);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.25);
}

.sk-send-btn--active:hover {
  transform: scale(1.06);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.35);
}

.sk-send-btn:disabled { cursor: not-allowed; }

.sk-input-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 11px;
  color: var(--sk-text-3);
  margin: 8px 0 0;
  text-align: center;
}

.sk-footer-sparkle {
  color: var(--sk-teal);
  font-size: 10px;
}

/* ─── Image Upload & Attachment ───────────────────────── */
.sk-hidden-input {
  display: none;
}

/* ─── Attachment Zone (when image selected) ────────── */
.sk-attachment-zone {
  margin-bottom: 12px;
  padding: 12px;
  border-radius: var(--sk-radius-lg);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(59, 130, 246, 0.05));
  border: 1.5px solid var(--sk-teal-soft);
  animation: sk-image-slide-enter 0.3s ease both;
}

.sk-attachment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--sk-border);
}

.sk-attachment-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--sk-text-2);
  display: flex;
  align-items: center;
  gap: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.sk-attachment-actions {
  display: flex;
  gap: 6px;
}

.sk-attachment-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: var(--sk-canvas);
  color: var(--sk-text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  padding: 0;
  font-family: inherit;
  flex-shrink: 0;
}

.sk-attachment-btn:hover:not(:disabled) {
  background: var(--sk-teal-soft);
  color: var(--sk-teal);
  transform: translateY(-2px);
}

.sk-attachment-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sk-attachment-preview-container {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.sk-attachment-preview-img {
  width: 120px;
  height: 120px;
  border-radius: var(--sk-radius-md);
  object-fit: contain;
  background: var(--sk-canvas);
  border: 1px solid var(--sk-border);
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.sk-attachment-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}

.sk-attachment-hint {
  font-size: 13px;
  font-weight: 500;
  color: var(--sk-teal);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.sk-attachment-hint::before {
  content: "✓";
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--sk-teal-soft);
  font-size: 10px;
  font-weight: bold;
}

.sk-attachment-counter {
  font-size: 11px;
  color: var(--sk-text-3);
  margin: 0;
}

/* ─── Image Badge (shows in input when image selected) ─ */
.sk-image-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--sk-teal-soft);
  border-radius: 6px;
  color: var(--sk-teal);
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
  margin-right: 4px;
}

.sk-badge-text {
  white-space: nowrap;
}

/* ─── Image Upload Button ───────────────────────────── */
.sk-input-attach {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--sk-text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  padding: 0;
  margin: 0;
  font-family: inherit;
}

.sk-input-attach:hover:not(:disabled) {
  background: var(--sk-teal-soft);
  color: var(--sk-teal);
}

.sk-input-attach:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

/* ─── Transitions ──────────────────────────────────── */
.sk-image-slide-enter-active,
.sk-image-slide-leave-active {
  transition: all 0.3s ease;
}

.sk-image-slide-enter-from {
  opacity: 0;
  transform: translateY(-12px) scaleY(0.95);
}

.sk-image-slide-leave-to {
  opacity: 0;
  transform: translateY(-12px) scaleY(0.95);
}

/* ═══════════════════════════════════════════════════════
   RATING OVERLAY
   ═══════════════════════════════════════════════════════ */
.sk-rating-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100000;
  padding: 24px;
}

.sk-rating-card {
  background: var(--sk-surface);
  border-radius: var(--sk-radius-xl);
  padding: 28px;
  width: 100%;
  max-width: 380px;
  box-shadow: var(--sk-shadow-xl);
  border: 1px solid var(--sk-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  animation: sk-fade-up 0.3s ease both;
}

.sk-rating-header {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.sk-rating-icon {
  font-size: 32px;
  margin-bottom: 4px;
}

.sk-rating-header h3 {
  font-size: 17px;
  font-weight: 800;
  color: var(--sk-text);
  margin: 0;
  letter-spacing: -0.02em;
}

.sk-rating-header p {
  font-size: 13px;
  color: var(--sk-text-2);
  margin: 0;
}

.sk-stars {
  display: flex;
  gap: 4px;
  margin: 4px 0;
}

.sk-star {
  font-size: 32px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--sk-border-2);
  transition: transform 0.1s, color 0.1s;
  padding: 2px;
  line-height: 1;
}

.sk-star:hover { transform: scale(1.2); color: var(--sk-amber); }
.sk-star--active { color: var(--sk-amber); filter: drop-shadow(0 2px 4px rgba(245, 158, 11, 0.3)); }

.sk-star-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--sk-amber);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  min-height: 16px;
  margin: 0;
}

.sk-rating-textarea {
  width: 100%;
  border: 1.5px solid var(--sk-border);
  border-radius: var(--sk-radius-md);
  padding: 10px 12px;
  font-size: 13px;
  font-family: inherit;
  color: var(--sk-text);
  background: var(--sk-canvas);
  resize: none;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}

.sk-rating-textarea:focus {
  border-color: var(--sk-teal);
  box-shadow: 0 0 0 3px var(--sk-teal-soft);
  background: white;
}

.sk-rating-textarea::placeholder { color: var(--sk-text-3); }

.sk-rating-actions {
  display: flex;
  gap: 8px;
  width: 100%;
}

.sk-rbtn {
  flex: 1;
  border-radius: var(--sk-radius-md);
  padding: 11px 16px;
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.sk-rbtn--ghost {
  background: var(--sk-canvas);
  border: 1.5px solid var(--sk-border);
  color: var(--sk-text-2);
}

.sk-rbtn--ghost:hover:not(:disabled) { background: var(--sk-border); color: var(--sk-text); }

.sk-rbtn--primary {
  background: var(--sk-ink);
  border: 1.5px solid var(--sk-ink);
  color: var(--sk-teal);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.2);
}

.sk-rbtn--primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.3);
}

.sk-rbtn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ═══════════════════════════════════════════════════════
   UTILITIES & ANIMATIONS
   ═══════════════════════════════════════════════════════ */
.sk-spin {
  animation: sk-spin 0.75s linear infinite;
}

@keyframes sk-spin {
  to { transform: rotate(360deg); }
}

@keyframes sk-fade-up {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.sk-msg-anim-enter-active { transition: all 0.25s ease; }
.sk-msg-anim-enter-from { opacity: 0; transform: translateY(12px); }

.sk-overlay-fade-enter-active { transition: opacity 0.2s ease; }
.sk-overlay-fade-leave-active { transition: opacity 0.15s ease; }
.sk-overlay-fade-enter-from, .sk-overlay-fade-leave-to { opacity: 0; }
</style>

