// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
// https://astro.build/config
export default defineConfig({
  output: 'static',

  vite: {
    plugins: [tailwindcss()],
    server: {
      proxy: {
        '/alist-api': {
          target: 'http://192.168.3.11:5244',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/alist-api/, '/api'),
        },
        '/alist-d': {
          target: 'http://192.168.3.11:5244',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/alist-d/, '/d'),
        },
        '/alist-p': {
          target: 'http://192.168.3.11:5244',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/alist-p/, '/p'),
          timeout: 0,
        },
      },
    },
  },

  integrations: [react()]
});