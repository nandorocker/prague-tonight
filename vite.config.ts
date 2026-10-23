import { defineConfig } from 'vite';
import { hermesFeedPlugin } from './tools/hermes/feed-server.mjs';

// Vite 5 doesn't read __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS itself.
const extraHosts = (process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS ?? '').split(',').filter(Boolean);

export default defineConfig({
  plugins: [hermesFeedPlugin()],
  server: { host: '127.0.0.1', allowedHosts: extraHosts },
  preview: { host: '127.0.0.1', allowedHosts: extraHosts },
  test: { environment: 'node' },
} as never);
