import { defineConfig } from 'vite';

// Vite 5 doesn't read __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS itself.
const extraHosts = (process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS ?? '').split(',').filter(Boolean);

export default defineConfig({
  plugins: [{
    name: 'styles-after-boot-skeleton',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html: string) {
        // Vite hoists built CSS into <head>; keep the critical skeleton paintable.
        if (!html.includes('<!-- app-styles -->')) return html;
        const styles = html.match(/<link\b[^>]*rel="stylesheet"[^>]*>/g) ?? [];
        return html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, '')
          .replace('<!-- app-styles -->', styles.join('\n'));
      },
    },
  }],
  server: { host: '127.0.0.1', allowedHosts: extraHosts },
  test: { environment: 'node' },
} as never);
