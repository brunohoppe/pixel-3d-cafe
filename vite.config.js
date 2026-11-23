import { defineConfig } from 'vite';

// No GitHub Pages o site fica em /pixel-3d-cafe/; localmente continua na raiz
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/pixel-3d-cafe/' : '/',
}));
