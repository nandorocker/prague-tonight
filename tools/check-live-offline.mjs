import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

test('persisted live save opens as-saved details after initial API 503', { timeout: 60_000 }, async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen();
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let apiRequests = 0;
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/events') {
        apiRequests++;
        void request.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
      } else void request.continue();
    });
    const id = 'hermes:source:with/slash';
    await page.evaluateOnNewDocument((savedId) => {
      localStorage.setItem('pt:live:saves', JSON.stringify([{
        id: savedId, night: '2026-10-23', savedAt: '2026-10-23T18:00',
        lastObserved: { night: '2026-10-25', start: '2026-10-25T22:00' },
        snap: { title: 'Persisted live save', start: '2026-10-23T21:00', place: 'Original venue', price: 'Free', sourceUrl: 'https://example.org/original', sourceName: 'Source', family: 'plain' },
      }]));
    }, id);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/#/event/${encodeURIComponent(id)}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelector('#banner')?.textContent.includes('Couldn'));
    assert.equal(apiRequests, 1);
    assert.equal(await page.$eval('.ev-title', (el) => el.textContent), 'Persisted live save');
    const facts = await page.$eval('.facts', (el) => el.textContent);
    assert.match(facts, /as saved/);
    assert.match(facts, /21:00/);
    assert.doesNotMatch(facts, /22:00/);
    assert.equal(await page.$eval('.details a[target="_blank"]', (el) => el.href), 'https://example.org/original');
    await page.evaluate(() => { location.hash = '#/event/%E0%A4%A'; });
    await page.waitForSelector('.empty');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
