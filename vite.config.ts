import { defineConfig } from 'vite';
// base './' makes the build work on GitHub Pages sub-paths, Tauri and Capacitor.
export default defineConfig({ base: './', build: { outDir: 'dist' } });
