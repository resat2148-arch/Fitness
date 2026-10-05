import { defineConfig } from 'vite';

// base './' — dist klasörü herhangi bir alt dizinden (ör. CrazyGames) çalışabilsin
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500, assetsInlineLimit: 0 },
});
