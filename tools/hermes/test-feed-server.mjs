import assert from 'node:assert/strict';
import test from 'node:test';
import { createFeedMiddleware, createFeedReader, readHermesFeed } from './feed-server.mjs';

const feed = (at = '2026-10-23T10:00:00Z') => ({ schemaVersion: 1, collectedAt: at, events: [] });

test('transport has fixed arguments, timeout and output limit', async () => {
  const result = await readHermesFeed((command, args, options, callback) => {
    assert.equal(command, 'docker');
    assert.deepEqual(args, ['exec', '-u', '10000', 'hermes', 'python3', '/opt/data/profiles/personal/scripts/public_feed.py']);
    assert.equal(options.timeout, 5000);
    assert.equal(options.maxBuffer, 4 * 1024 * 1024);
    callback(null, JSON.stringify(feed()));
  });
  assert.deepEqual(result, feed());
  for (const stdout of ['not JSON', '{"schemaVersion":2}']) {
    await assert.rejects(readHermesFeed((_c, _a, _o, done) => done(null, stdout)), /Event feed unavailable/);
  }
  await assert.rejects(readHermesFeed((_c, _a, _o, done) => done(new Error('private timeout details'))), /Event feed unavailable/);
});

test('single-flight and success cache prevent per-visitor reads', async () => {
  let count = 0;
  let clock = 0;
  let complete;
  const read = createFeedReader(() => { count++; return new Promise((resolve) => { complete = resolve; }); }, () => clock);
  const requests = [read(), read(), read()];
  await Promise.resolve();
  complete(feed());
  const results = await Promise.all(requests);
  assert.equal(count, 1);
  assert.ok(results.every((r) => r.feed.events.length === 0 && !r.failed));
  await read();
  assert.equal(count, 1);
  clock = 60_001;
  const next = read();
  await Promise.resolve();
  complete(feed());
  await next;
  assert.equal(count, 2);
});

test('failure backoff retains last good and rejects older generations', async () => {
  let count = 0;
  let clock = 0;
  const read = createFeedReader(async () => {
    count++;
    if (count === 1) return feed();
    if (count === 2) throw new Error('synthetic secret');
    return feed('2026-10-22T10:00:00Z');
  }, () => clock);
  const first = await read();
  clock = 60_001;
  assert.deepEqual(await read(), { feed: first.feed, failed: true });
  await read();
  assert.equal(count, 2);
  clock += 30_001;
  assert.deepEqual(await read(), { feed: first.feed, failed: true });
  assert.equal(count, 3);
});

test('initial failure has no fictional fallback and also backs off', async () => {
  let count = 0;
  const read = createFeedReader(() => { count++; throw new Error('private failure'); }, () => 0);
  assert.deepEqual(await read(), { feed: null, failed: true });
  assert.deepEqual(await read(), { feed: null, failed: true });
  assert.equal(count, 1);
});

test('only fixed endpoint and safe HTTP methods reach the reader', async () => {
  let reads = 0;
  const middleware = createFeedMiddleware(async () => { reads++; return { feed: feed(), failed: true }; });
  const response = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = body; } });
  let next = false;
  await middleware({ url: '/api/events/../../private', method: 'GET' }, response(), () => { next = true; });
  assert.ok(next);
  assert.equal(reads, 0);
  const post = response();
  await middleware({ url: '/api/events', method: 'POST' }, post, () => {});
  assert.equal(post.statusCode, 405);
  assert.equal(reads, 0);
  const get = response();
  await middleware({ url: '/api/events?path=/private', method: 'GET' }, get, () => {});
  assert.equal(get.statusCode, 200);
  assert.equal(get.headers['X-Feed-Stale'], '1');
  assert.equal(JSON.parse(get.body).refreshFailed, true);
  assert.equal(reads, 1);
  const head = response();
  await middleware({ url: '/api/events', method: 'HEAD' }, head, () => {});
  assert.equal(head.body, undefined);
});

test('unavailable response is sanitized', async () => {
  const middleware = createFeedMiddleware(async () => ({ feed: null, failed: true }));
  const response = { setHeader() {}, end(body) { this.body = body; } };
  await middleware({ url: '/api/events', method: 'GET' }, response, () => {});
  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), { error: 'Event feed unavailable' });
});
