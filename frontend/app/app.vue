<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtPage />
    <!-- Floating Sidekick-style widget — persists across all pages -->
    <SupportChatWidget />
  </div>
</template>

<script setup lang="ts">
import SupportChatWidget from '@/components/SupportChatWidget.vue'
</script>
