/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered by hand in main.tsx, after the first screen has loaded.
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Waymark',
        short_name: 'Waymark',
        description: 'Character sheets and campaigns for the Waymark roleplaying game.',
        theme_color: '#2f5d4a',
        background_color: '#f7f3ea',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Firebase's reserved paths must reach the network, not the app shell.
        navigateFallbackDenylist: [/^\/__\//],
      },
    }),
  ],
  server: { fs: { allow: ['..'] } },
  build: {
    rollupOptions: {
      output: {
        // Separate, long-cached chunks for the libraries that rarely change.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
