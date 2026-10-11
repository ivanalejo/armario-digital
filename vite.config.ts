/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Política de seguridad de contenido (CSP). GitHub Pages no permite cabeceras
 * propias, así que va en <meta>. Solo se inyecta en el build: en desarrollo
 * Vite necesita scripts inline para la recarga en caliente.
 * connect-src 'self' impide que el navegador envíe datos a otro origen.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'armario-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!--CSP-->',
        `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  base: '/armario-digital/',
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev') },
  // ~150 KB gzip en total (React, Dexie, Zod); se descarga una vez y queda en caché offline.
  build: { chunkSizeWarningLimit: 600 },
  plugins: [
    react(),
    cspPlugin(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/favicon.svg'],
      manifest: {
        id: '/armario-digital/',
        name: 'Armario Digital',
        short_name: 'Armario',
        description: 'Inventario personal de ropa y outfits. Datos solo en este dispositivo.',
        lang: 'es',
        start_url: '/armario-digital/',
        scope: '/armario-digital/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f4f1',
        theme_color: '#2f3a33',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Sin estrategias de red en tiempo de ejecución: la app no pide datos a nadie.
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
});
