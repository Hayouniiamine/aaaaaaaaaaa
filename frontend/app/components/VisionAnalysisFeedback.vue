<template>
  <div v-if="vision" class="sk-vision-card">
    <!-- Header -->
    <div class="sk-vision-header">
      <div class="sk-vision-icon">
        <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
        </svg>
      </div>
      <span class="sk-vision-title">Screenshot Analysis</span>
      <span class="sk-vision-confidence" :class="getConfidenceClass(vision.confidence)">
        {{ (vision.confidence * 100).toFixed(0) }}%
      </span>
    </div>

    <!-- Error Code Badge -->
    <div v-if="vision.errorCode" class="sk-vision-badge sk-vision-error">
      <span class="sk-badge-icon">⚠️</span>
      <span class="sk-badge-text">Error: {{ vision.errorCode }}</span>
    </div>

    <!-- Module Badge -->
    <div v-if="vision.detectedModule" class="sk-vision-badge sk-vision-module">
      <span class="sk-badge-icon">📦</span>
      <span class="sk-badge-text">Module: {{ formatModule(vision.detectedModule) }}</span>
    </div>

    <!-- Severity Badge -->
    <div v-if="vision.severity" class="sk-vision-badge" :class="`sk-vision-severity-${vision.severity}`">
      <span class="sk-badge-icon">{{ getSeverityIcon(vision.severity) }}</span>
      <span class="sk-badge-text">{{ formatSeverity(vision.severity) }}</span>
    </div>

    <!-- Is Error Screen -->
    <div v-if="vision.isErrorScreen" class="sk-vision-badge sk-vision-is-error">
      <span class="sk-badge-icon">🚨</span>
      <span class="sk-badge-text">Error Screen Detected</span>
    </div>

    <!-- Problem Description -->
    <div v-if="vision.problemDescription" class="sk-vision-problem">
      <p class="sk-vision-problem-text">{{ vision.problemDescription }}</p>
    </div>

    <!-- Suggested Action -->
    <div v-if="vision.suggestedAction" class="sk-vision-action">
      <div class="sk-action-icon">💡</div>
      <p class="sk-action-text">{{ vision.suggestedAction }}</p>
    </div>

    <!-- Processing Time -->
    <div v-if="vision.processingTimeMs" class="sk-vision-meta">
      <span class="sk-meta-item">Analyzed in {{ vision.processingTimeMs }}ms</span>
    </div>
  </div>
</template>

<script setup lang="ts">
interface VisionAnalysisData {
  errorCode?: string | null;
  detectedModule?: string | null;
  severity?: "critical" | "high" | "medium" | "low" | null;
  confidence: number;
  isErrorScreen?: boolean;
  problemDescription?: string;
  suggestedAction?: string;
  processingTimeMs?: number;
}

const props = defineProps({
  vision: {
    type: Object as () => VisionAnalysisData | null,
    default: null,
  },
});

const getConfidenceClass = (confidence: number): string => {
  if (confidence >= 0.8) return "sk-confidence-high";
  if (confidence >= 0.6) return "sk-confidence-medium";
  return "sk-confidence-low";
};

const getSeverityIcon = (severity: string): string => {
  const icons: Record<string, string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🟢",
  };
  return icons[severity] || "⚪";
};

const formatSeverity = (severity: string): string => {
  const labels: Record<string, string> = {
    critical: "Critical Issue",
    high: "High Priority",
    medium: "Medium Priority",
    low: "Low Priority",
  };
  return labels[severity] || "Unknown";
};

const formatModule = (module: string): string => {
  const labels: Record<string, string> = {
    products: "Products",
    orders: "Orders",
    checkout: "Checkout",
    billing: "Billing",
    customers: "Customers",
    domains: "Domains",
    stock: "Stock Inventory",
    payment: "Payment",
    shipping: "Shipping",
    categories: "Categories",
    auth: "Authentication",
    ssl: "SSL/Security",
  };
  return labels[module] || module.charAt(0).toUpperCase() + module.slice(1);
};
</script>

<style scoped>
.sk-vision-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: linear-gradient(135deg, #f0f7ff 0%, #e8f4ff 100%);
  border-left: 4px solid #3b82f6;
  border-radius: 6px;
  margin: 8px 0;
  font-size: 13px;
  line-height: 1.4;
}

.sk-vision-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #1e40af;
}

.sk-vision-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.sk-vision-title {
  flex: 1;
}

.sk-vision-confidence {
  font-size: 12px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  background: rgba(59, 130, 246, 0.1);
  color: #1e40af;
}

.sk-confidence-high {
  background: rgba(34, 197, 94, 0.2);
  color: #15803d;
}

.sk-confidence-medium {
  background: rgba(168, 85, 247, 0.2);
  color: #7c3aed;
}

.sk-confidence-low {
  background: rgba(239, 68, 68, 0.2);
  color: #dc2626;
}

.sk-vision-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.sk-badge-icon {
  font-size: 14px;
}

.sk-badge-text {
  color: #0f172a;
}

.sk-vision-error {
  background: rgba(239, 68, 68, 0.1);
  border-left: 2px solid #dc2626;
}

.sk-vision-module {
  background: rgba(59, 130, 246, 0.1);
  border-left: 2px solid #3b82f6;
}

.sk-vision-severity-critical {
  background: rgba(239, 68, 68, 0.15);
  border-left: 2px solid #dc2626;
}

.sk-vision-severity-high {
  background: rgba(249, 115, 22, 0.15);
  border-left: 2px solid #ea580c;
}

.sk-vision-severity-medium {
  background: rgba(168, 85, 247, 0.15);
  border-left: 2px solid #9333ea;
}

.sk-vision-severity-low {
  background: rgba(34, 197, 94, 0.15);
  border-left: 2px solid #16a34a;
}

.sk-vision-is-error {
  background: rgba(239, 68, 68, 0.1);
  border-left: 2px solid #dc2626;
}

.sk-vision-problem {
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 4px;
  border-left: 2px solid #f59e0b;
}

.sk-vision-problem-text {
  margin: 0;
  color: #0f172a;
  font-size: 12px;
  line-height: 1.5;
}

.sk-vision-action {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(34, 197, 94, 0.1);
  border-radius: 4px;
  border-left: 2px solid #16a34a;
}

.sk-action-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.sk-action-text {
  margin: 0;
  color: #0f172a;
  font-size: 12px;
  line-height: 1.5;
}

.sk-vision-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
}

.sk-meta-item {
  padding: 2px 6px;
  background: rgba(148, 163, 184, 0.1);
  border-radius: 3px;
}
</style>
