import { mergeConfig } from 'vite';
import base from './vite.config.ts';

const proxy = {
  '/v0': { target: 'http://127.0.0.1:8317', changeOrigin: true },
  '/v1': { target: 'http://127.0.0.1:8317', changeOrigin: true, ws: true },
  '/v1beta': { target: 'http://127.0.0.1:8317', changeOrigin: true },
  '/api': { target: 'http://127.0.0.1:8317', changeOrigin: true },
  '/anthropic': { target: 'http://127.0.0.1:8317', changeOrigin: true },
  '/codex': { target: 'http://127.0.0.1:8317', changeOrigin: true },
  '/google': { target: 'http://127.0.0.1:8317', changeOrigin: true },
  '/iflow': { target: 'http://127.0.0.1:8317', changeOrigin: true },
  '/antigravity': { target: 'http://127.0.0.1:8317', changeOrigin: true },
};

export default mergeConfig(base, {
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy,
  },
});
