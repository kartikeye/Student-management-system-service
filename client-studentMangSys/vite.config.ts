import { defineConfig } from 'vite';

export default defineConfig({
  // amazon-cognito-identity-js (via its crypto/buffer deps) references Node's
  // `global`, which doesn't exist in the browser — Vite doesn't polyfill it by default.
  define: {
    global: 'globalThis',
  },
});
