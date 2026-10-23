import { execFile } from 'node:child_process';

// Fixed command only: request input never becomes an executable, argument or path.
export function readHermesFeed(execute = execFile) {
  return new Promise((resolve, reject) => {
    execute('docker', ['exec', '-u', '10000', 'hermes', 'python3',
      '/opt/data/profiles/personal/scripts/public_feed.py'],
    { timeout: 5000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (error, stdout) => {
      if (error) return reject(new Error('Event feed unavailable'));
      try {
        const feed = JSON.parse(stdout);
        if (feed.schemaVersion !== 1 || !Array.isArray(feed.events) || !Number.isFinite(Date.parse(feed.collectedAt))) {
          throw new Error('Invalid feed');
        }
        resolve(feed);
      } catch {
        reject(new Error('Event feed unavailable'));
      }
    });
  });
}

export function createFeedReader(read = readHermesFeed, now = Date.now) {
  let lastGood = null;
  let retryAt = 0;
  let pending = null;
  let failed = false;
  async function refresh() {
    try {
      const fresh = await read();
      if (lastGood && Date.parse(fresh.collectedAt) < Date.parse(lastGood.collectedAt)) throw new Error('Older generation');
      lastGood = fresh;
      failed = false;
      retryAt = now() + 60_000;
    } catch {
      failed = true;
      retryAt = now() + 30_000;
    } finally {
      pending = null;
    }
  }
  return async () => {
    if (pending) await pending;
    else if (now() >= retryAt) {
      // Start via a microtask so synchronous failures also clear pending safely.
      pending = Promise.resolve().then(refresh);
      await pending;
    }
    return { feed: lastGood, failed };
  };
}

export function createFeedMiddleware(reader = createFeedReader()) {
  return async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/api/events') return next();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    const { feed, failed } = await reader();
    res.statusCode = feed ? 200 : 503;
    if (failed) res.setHeader('X-Feed-Stale', '1');
    const body = feed ? { ...feed, refreshFailed: failed } : { error: 'Event feed unavailable' };
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body));
  };
}

export function hermesFeedPlugin() {
  const middleware = createFeedMiddleware();
  return {
    name: 'hermes-event-feed',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
