import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
  plugins: [react()],
  base: '/assets/',
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: (content, filename) =>
          /(Select|ToggleSwitch)\.module\.scss$/.test(filename)
            ? `@use "${path.resolve('shared/cli-ui/src/styles/variables.scss')}" as *;\n${content}`
            : content,
      },
    },
  },
  build: { outDir: '../web', emptyOutDir: true, assetsDir: 'bundle', sourcemap: false },
  server: { proxy: { '/api': 'http://127.0.0.1:3817' } },
});
