import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

test('initial loading skeleton', { timeout: 30_000 }, async (t) => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen();
    const url = `http://127.0.0.1:${server.httpServer.address().port}/?demo=1&now=2026-10-23T18:45`;
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

    await t.test('paints the critical skeleton while the stylesheet is still loading', async () => {
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: 844 });
      await page.setRequestInterception(true);
      let release;
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/src/styles.css') release = () => request.continue();
        else void request.continue();
      });
      const navigation = page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#boot-skeleton', { visible: true });
      await page.waitForFunction(() => performance.getEntriesByName('first-paint').length > 0);
      assert.equal(await page.$eval('.sk-poster', (poster) => getComputedStyle(poster).backgroundColor), 'rgb(233, 225, 203)');
      // The JS failsafe must not hide the skeleton before CSS has even loaded.
      await new Promise((resolve) => setTimeout(resolve, 4100));
      assert.equal(await page.$eval('#boot-skeleton', (skeleton) => getComputedStyle(skeleton).display), 'flex');
      await release();
      await navigation;
      await page.waitForFunction(() => !document.documentElement.classList.contains('booting'));
      assert.ok(await page.$('.card.top'));
      await page.close();
    });

    await t.test('shows a responsive skeleton before JavaScript and unlocks the ready app', async () => {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      let release;
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/src/main.ts') release = () => request.continue();
        else void request.continue();
      });
      const navigation = page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#boot-skeleton', { visible: true });
      assert.equal(await page.$eval('#shell', (shell) => shell.inert && shell.getAttribute('aria-hidden') === 'true' && shell.getAttribute('aria-busy') === 'true'), true);
      assert.equal(await page.$eval('#boot-skeleton', (skeleton) => skeleton.getAttribute('role')), 'status');
      for (const [width, height] of [[390, 844], [320, 568], [1440, 900], [844, 390]]) {
        await page.setViewport({ width, height });
        const layout = await page.evaluate(() => {
          const skeleton = document.querySelector('#boot-skeleton').getBoundingClientRect();
          const poster = document.querySelector('.sk-poster').getBoundingClientRect();
          const controls = document.querySelector('.sk-controls').getBoundingClientRect();
          const nav = document.querySelector('.sk-nav').getBoundingClientRect();
          return {
            centered: Math.abs(skeleton.x - (innerWidth - skeleton.width) / 2) < 1,
            width: skeleton.width,
            fits: poster.width > 0 && poster.height > 0 && poster.top >= 0 && poster.bottom <= controls.top + 1 && controls.bottom <= nav.top + 1 && nav.bottom <= innerHeight + 1,
          };
        });
        assert.deepEqual(layout, { centered: true, width: Math.min(480, width), fits: true });
      }
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      assert.equal(await page.$eval('.sk-poster', (poster) => getComputedStyle(poster, '::after').animationName), 'none');
      await release();
      await navigation;
      await page.waitForFunction(() => !document.documentElement.classList.contains('booting'));
      assert.equal(await page.$eval('#boot-skeleton', (skeleton) => getComputedStyle(skeleton).display), 'none');
      assert.equal(await page.$eval('#shell', (shell) => !shell.inert && !shell.hasAttribute('aria-hidden') && !shell.hasAttribute('aria-busy')), true);
      assert.ok(await page.$('.card.top'));
      await page.close();
    });

    await t.test('slow fonts do not keep the skeleton up indefinitely', async () => {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      const fonts = [];
      page.on('request', (request) => {
        if (request.resourceType() === 'font') fonts.push(request);
        else void request.continue();
      });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      assert.equal(await page.$eval('html', (html) => html.classList.contains('booting')), true);
      await page.waitForFunction(() => !document.documentElement.classList.contains('booting'), { timeout: 3000 });
      assert.ok(fonts.length > 0);
      assert.equal(await page.$eval('#shell', (shell) => shell.inert), false);
      await Promise.all(fonts.map((request) => request.abort()));
      await page.close();
    });

    await t.test('the existing boot failsafe also clears the skeleton and inert state', async () => {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/src/main.ts') void request.abort();
        else void request.continue();
      });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#boot-skeleton', { visible: true });
      await page.waitForFunction(() => !document.documentElement.classList.contains('booting'), { timeout: 5000 });
      assert.equal(await page.$eval('#boot-skeleton', (skeleton) => getComputedStyle(skeleton).display), 'none');
      assert.equal(await page.$eval('#shell', (shell) => !shell.inert && !shell.hasAttribute('aria-hidden') && !shell.hasAttribute('aria-busy')), true);
      await page.close();
    });
  } finally {
    await browser?.close();
    await server.close();
  }
});

test('deck rendering and swipe interactions', { timeout: 60_000 }, async (t) => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen();
    const port = server.httpServer.address().port;
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/?demo=1&now=2026-10-23T18:45`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);

    const topId = () => page.$eval('.card.top', (card) => card.dataset.eventId);
    const advance = async (act) => {
      const id = await topId();
      await act();
      await page.waitForFunction((before) => {
        const top = document.querySelector('.card.top');
        return top ? top.dataset.eventId !== before : !!document.querySelector('.end');
      }, {}, id);
      return id;
    };

    await t.test('promotes retained cards and creates only one incoming poster', async () => {
      await page.evaluate(() => {
        window.retained = {
          stack: document.querySelector('.stack'),
          top: document.querySelector('.card.top'),
          next: document.querySelector('.card.next'),
          preload: document.querySelector('.card.preload'),
          titleSize: document.querySelector('.card.next .p-title').style.fontSize,
          added: 0,
        };
        window.cardObserver = new MutationObserver((records) => {
          for (const record of records) {
            window.retained.added += [...record.addedNodes].filter((n) => n instanceof HTMLElement && n.classList.contains('card')).length;
          }
        });
        window.cardObserver.observe(window.retained.stack, { childList: true });
      });
      await advance(() => page.click('.ctl-pass'));
      const result = await page.evaluate(() => {
        window.cardObserver.disconnect();
        const { stack, top, next, preload, titleSize, added } = window.retained;
        return {
          stackRetained: stack === document.querySelector('.stack'),
          promoted: next === document.querySelector('.card.top'),
          prepared: preload === document.querySelector('.card.next'),
          removed: !top.isConnected,
          fitted: titleSize === next.querySelector('.p-title').style.fontSize,
          accessible: !next.inert && !next.hasAttribute('aria-hidden') && next.tabIndex === 0,
          backgroundInert: [...document.querySelectorAll('.card:not(.top)')].every((card) => card.inert && card.tabIndex === -1 && card.getAttribute('aria-hidden') === 'true'),
          count: document.querySelectorAll('.stack .card').length,
          added,
        };
      });
      assert.deepEqual(result, {
        stackRetained: true, promoted: true, prepared: true, removed: true,
        fitted: true, accessible: true, backgroundInert: true, count: 3, added: 1,
      });
    });

    await t.test('keyboard save, favorite and undo target the promoted card exactly once', async () => {
      await page.focus('.card.top');
      const saved = await advance(() => page.keyboard.press('ArrowRight'));
      assert.equal(await page.evaluate((id) => JSON.parse(localStorage.getItem('pt:saves')).filter((s) => s.id === id).length, saved), 1);
      assert.equal(await page.$eval('.card.top', (card) => document.activeElement === card), true);
      await page.keyboard.press('u');
      await page.waitForFunction((id) => document.querySelector('.card.top')?.dataset.eventId === id, {}, saved);
      assert.equal(await page.evaluate((id) => JSON.parse(localStorage.getItem('pt:saves')).some((s) => s.id === id), saved), false);
      assert.equal(await page.$eval('.card.top', (card) => card.classList.contains('return-right')), true);
      const favorite = await advance(() => page.keyboard.press('ArrowUp'));
      assert.equal(favorite, saved);
      assert.equal(await page.evaluate((id) => JSON.parse(localStorage.getItem('pt:saves')).find((s) => s.id === id).fav, favorite), true);
      await page.click('.ctl-undo');
      await page.waitForFunction((id) => document.querySelector('.card.top')?.dataset.eventId === id, {}, favorite);
      assert.equal(await page.$eval('.card.top', (card) => card.classList.contains('return-up')), true);
    });

    await t.test('pointer dragging commits the current card with a fully visible stamp', async () => {
      const id = await topId();
      // Let the undo animation finish before grabbing the returned card.
      await page.waitForFunction(() => document.querySelector('.card.top').getAnimations().every((a) => a.playState === 'finished'));
      const rect = await page.$eval('.card.top', (card) => {
        const r = card.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      await page.mouse.move(rect.x, rect.y);
      await page.mouse.down();
      await page.mouse.move(rect.x + 160, rect.y, { steps: 8 });
      await page.mouse.up();
      assert.equal(await page.$eval('.card.top .stamp-save', (stamp) => getComputedStyle(stamp).opacity), '1');
      await page.waitForFunction((before) => document.querySelector('.card.top')?.dataset.eventId !== before, {}, id);
      assert.equal(await page.evaluate((saved) => JSON.parse(localStorage.getItem('pt:saves')).filter((s) => s.id === saved).length, id), 1);
    });

    await t.test('batches drag writes, flushes the latest position and cancels stale frames', async () => {
      const result = await page.evaluate(async () => {
        const { attachSwipe, flyOut } = await import('/src/ui/swipe.ts');
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = 'position:fixed;width:300px;height:420px';
        card.innerHTML = '<div class="stamp stamp-save"></div><div class="stamp stamp-pass"></div><div class="stamp stamp-super"></div>';
        document.body.append(card);
        const raf = window.requestAnimationFrame;
        const caf = window.cancelAnimationFrame;
        let sequence = 0;
        const pending = new Map();
        window.requestAnimationFrame = (callback) => { pending.set(++sequence, callback); return sequence; };
        window.cancelAnimationFrame = (id) => pending.delete(id);
        const commits = [];
        const dragStates = [];
        let taps = 0;
        const detach = attachSwipe(card, {
          onCommit: (dir) => commits.push({ dir, transform: card.style.transform }),
          onTap: () => taps++,
          onDragState: (dragging) => dragStates.push(dragging),
        });
        const pointer = (type, x = 100, y = 100) => card.dispatchEvent(new PointerEvent(type, { pointerId: 7, button: 0, clientX: x, clientY: y }));
        try {
          pointer('pointerdown');
          pointer('pointermove', 120);
          pointer('pointermove', 130);
          const beforePaint = { queued: pending.size, transform: card.style.transform };
          const [id, paint] = [...pending][0];
          pending.delete(id);
          paint(0);
          const afterPaint = { transform: card.style.transform, save: card.querySelector('.stamp-save').style.opacity, variable: card.style.getPropertyValue('--save') };
          pointer('pointermove', 140);
          pointer('pointercancel');
          const canceled = { queued: pending.size, transform: card.style.transform, save: card.querySelector('.stamp-save').style.opacity, commits: commits.length };

          pointer('pointerdown');
          pointer('pointerup');
          pointer('pointerdown');
          pointer('pointermove', 110);
          pointer('pointerup', 110);
          const reset = { queued: pending.size, transform: card.style.transform };

          for (const [x, y] of [[280, 100], [-80, 100], [100, -100]]) {
            pointer('pointerdown');
            pointer('pointermove', x, y);
            pointer('pointerup', x, y);
          }
          pointer('pointerdown');
          pointer('pointermove', 150);
          detach();
          pointer('pointermove', 160);
          pointer('pointerup', 160);
          const disposed = { queued: pending.size, commits: commits.length, taps, dragStates };
          flyOut(card, 'right', () => {});
          const committedStamp = getComputedStyle(card.querySelector('.stamp-save')).opacity;
          return { beforePaint, afterPaint, canceled, reset, commits, disposed, committedStamp };
        } finally {
          detach();
          window.requestAnimationFrame = raf;
          window.cancelAnimationFrame = caf;
          card.remove();
        }
      });
      assert.deepEqual(result.beforePaint, { queued: 1, transform: '' });
      assert.match(result.afterPaint.transform, /^translate\(30px, 0px\)/);
      assert.ok(Math.abs(Number(result.afterPaint.save) - 1 / 3) < 0.001);
      assert.equal(result.afterPaint.variable, '');
      assert.deepEqual(result.canceled, { queued: 0, transform: '', save: '0', commits: 0 });
      assert.deepEqual(result.reset, { queued: 0, transform: '' });
      assert.deepEqual(result.commits.map((c) => c.dir), ['right', 'left', 'up']);
      assert.match(result.commits[0].transform, /^translate\(180px, 0px\)/);
      assert.match(result.commits[2].transform, /^translate\(0px, -200px\)/);
      assert.equal(result.disposed.queued, 0);
      assert.equal(result.disposed.commits, 3);
      assert.equal(result.disposed.taps, 1);
      assert.deepEqual(result.disposed.dragStates, Array.from({ length: 6 }, () => [true, false]).flat());
      assert.equal(result.committedStamp, '1');
    });

    await t.test('invalidates cached posters after data, style or artwork changes', async () => {
      const result = await page.evaluate(async () => {
        const { App } = await import('/src/app.ts');
        const { renderDeck, clearDeckKeys } = await import('/src/ui/deck.ts');
        const { store } = await import('/src/core/store.ts');
        clearDeckKeys();
        const app = new App();
        const root = document.getElementById('main');
        const render = () => renderDeck(app, root, render);
        render();
        const id = root.querySelector('.card.top').dataset.eventId;
        app.curation().family.set(id, 'plain');
        render();
        const before = root.querySelector('.card.top');
        app.curation().family.set(id, 'acid');
        render();
        const metal = root.querySelector('.card.top');
        const artwork = store.artwork();
        artwork.set(id, 'rotary-phone');
        store.setArtwork(artwork);
        render();
        const illustrated = root.querySelector('.card.top');
        const event = app.byId.get(id);
        const updated = { ...event, title: 'Updated event headline' };
        const cur = app.curation();
        cur.deck[cur.deck.findIndex((e) => e.id === id)] = updated;
        render();
        const changed = root.querySelector('.card.top');
        return {
          style: metal !== before && metal.querySelector('.poster').classList.contains('fam-acid'),
          artwork: illustrated !== metal && illustrated.querySelector('.poster').dataset.artwork === 'rotary-phone',
          data: changed !== illustrated && changed.getAttribute('aria-label').startsWith(updated.title),
        };
      });
      assert.deepEqual(result, { style: true, artwork: true, data: true });
    });

    await t.test('handles reduced motion, end of deck, undo and route re-entry', async () => {
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.reload({ waitUntil: 'networkidle0' });
      const first = await topId();
      for (let i = 0; i < 40 && await page.$('.card.top'); i++) {
        await page.click('.ctl-pass');
        await page.waitForFunction(() => !document.querySelector('.ctl-pass')?.disabled || !!document.querySelector('.end'));
      }
      assert.ok(await page.$('.end'));
      assert.equal(await page.$('.card'), null);
      await page.click('.ctl-undo');
      assert.ok(await page.$('.card.top'));
      const last = await topId();
      assert.notEqual(last, first);
      await page.click('.nav-night');
      await page.waitForSelector('.view-night');
      await page.click('.nav-deck');
      await page.waitForSelector('.card.top');
      assert.equal(await topId(), last);
      await advance(() => page.click('.ctl-save'));
    });

    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
