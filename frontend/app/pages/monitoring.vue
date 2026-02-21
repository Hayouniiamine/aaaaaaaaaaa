<template>
  <div class="monitoring-dashboard">
    <h1>Tableau de bord de monitoring</h1>
    <div v-if="loading" class="loading">Chargement...</div>
    <div v-else-if="error" class="error">Erreur : {{ error }}</div>
    <div v-else class="stats-grid">
      <div class="stat-card">
        <h2>Volume</h2>
        <p class="stat-value">{{ stats.volume }}</p>
      </div>
      <div class="stat-card">
        <h2>Taux de satisfaction</h2>
        <p class="stat-value">{{ stats.satisfaction_rate }}%</p>
      </div>
      <div class="stat-card">
        <h2>Escalades</h2>
        <p class="stat-value">{{ stats.escalations }}%</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRuntimeConfig } from '#imports'

const config = useRuntimeConfig()

const stats = ref({
  volume: 0,
  satisfaction_rate: 0,
  escalations: 0
})
const loading = ref(true)
const error = ref('')


async function fetchStats() {
  loading.value = true
  error.value = ''

  try {
    const base = config.public.supportApiBaseUrl || 'http://127.0.0.1:8000'
    const url = new URL('/support/ai/stats/', base).toString()

    const res = await fetch(url, {
      headers: {
        'X-TikTak-Widget-Secret': config.public.supportWidgetSecret || ''
      }
    })

    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const data = await res.json()

    stats.value = {
      volume: data.total_conversations ?? 0,
      satisfaction_rate: data.satisfaction?.average_stars
        ? Number((data.satisfaction.average_stars * 20).toFixed(1))
        : 0,

      // IMPORTANT: backend already returns a percent (0..100). Do NOT multiply by 100.
      escalations: data.escalation_rate_pct !== undefined
        ? Number(data.escalation_rate_pct.toFixed(1))
        : 0
    }
  } catch (e: any) {
    error.value = e.message || 'Erreur inconnue'
  } finally {
    loading.value = false
  }
}

onMounted(fetchStats)
</script>

<style scoped>
.monitoring-dashboard {
  max-width: 600px;
  margin: 40px auto;
  padding: 32px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 2px 16px #0001;
  font-family: 'Plus Jakarta Sans', sans-serif;
}
h1 {
  text-align: center;
  margin-bottom: 32px;
  color: #0f172a;
}
.stats-grid {
  display: flex;
  gap: 24px;
  justify-content: center;
}
.stat-card {
  flex: 1 1 0;
  background: #f8fafc;
  border-radius: 12px;
  padding: 24px 16px;
  text-align: center;
  box-shadow: 0 1px 4px #0001;
}
.stat-value {
  font-size: 2.2rem;
  font-weight: 700;
  color: #2563eb;
  margin-top: 8px;
}
.loading, .error {
  text-align: center;
  color: #64748b;
  margin-top: 32px;
}
.error {
  color: #ef4444;
}
</style>
