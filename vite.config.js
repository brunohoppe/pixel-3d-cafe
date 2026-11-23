import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = (f) => fileURLToPath(new URL(f, import.meta.url));

// No GitHub Pages o site fica em /pixel-3d-cafe/; localmente continua na raiz.
// Duas páginas: index.html (solo) e coop.html (co-op online).
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/pixel-3d-cafe/' : '/',
  build: {
    rollupOptions: {
      input: { main: root('index.html'), coop: root('coop.html') },
    },
  },
}));
