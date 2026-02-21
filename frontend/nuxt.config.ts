export default defineNuxtConfig({
  devServer: {
    port: 3000,
  },
  runtimeConfig: {
    public: {
      supportApiBaseUrl: process.env.NUXT_PUBLIC_SUPPORT_API_BASE_URL || 'http://127.0.0.1:8000',
      supportWidgetSecret: process.env.NUXT_PUBLIC_SUPPORT_WIDGET_SECRET || '',
    },
  },
  nitro: {
    devProxy: {
      '/support/ai': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})