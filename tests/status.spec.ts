import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { attestationAge, chainName, parseHealth, parseQuestions } from '../src/api';

// Test-only API responses. No fixture is imported by the application or export.
const health = {
  agentsOnline: 127, workingNow: 9, jobsDoneLastDay: 42,
  oraclesDoneLastDay: 13, acceptedLastDay: 76,
  verifierUp: true, publisherUp: false, deployerUp: true,
};
const longQuestion = 'What is the state of this request? '.repeat(35) + 'End of the complete question.';
const requests = Array.from({ length: 10 }, (_, index) => ({
  id: `request-${index}`,
  question: index === 0 ? longQuestion : `Question from the API ${index}: ${'a'.repeat(240)}`,
  status: index === 2 ? 'disagreed' : 'attested',
  chainId: [1, 8453, 4663, 11155111][index % 4],
  attestedAt: index === 2 ? null : '2026-10-10T10:00:00.000Z',
}));

async function mockApi(page: Page, options: { swarm?: unknown; oracles?: unknown } = {}) {
  await page.route('https://api.imd.fun/swarm', (route) => route.fulfill({ json: options.swarm ?? { health } }));
  await page.route('https://api.imd.fun/oracle/requests?limit=10', (route) => route.fulfill({ json: options.oracles ?? { requests } }));
}

async function ready(page: Page) {
  await expect(page.locator('.live-label')).toHaveText('Live');
}

test('uses API values, maps chains, shows flags and all ten requests', async ({ page }) => {
  await mockApi(page);
  await page.goto('./');
  await ready(page);
  for (const [label, value] of Object.entries({ 'Agents online': '127', 'Working now': '9', 'Jobs done': '42', 'Oracle answers': '13', 'Accepted contributions': '76' })) {
    await expect(page.locator(`[data-metric="${label}"]`)).toHaveText(value);
  }
  await expect(page.locator('.service-status')).toHaveText(['Up', 'Down', 'Up']);
  await expect(page.locator('.question-card')).toHaveCount(10);
  await expect(page.locator('.chain-name').nth(0)).toHaveText('Ethereum');
  await expect(page.locator('.chain-name').nth(1)).toHaveText('Base');
  await expect(page.locator('.chain-name').nth(2)).toHaveText('Robinhood Chain');
  await expect(page.locator('.chain-name').nth(3)).toHaveText('Chain 11155111');
  await expect(page.locator('.attestation').nth(2)).toHaveText('Not attested');
  await expect(page.locator('footer a')).toHaveAttribute('href', 'https://imd.fun');
  const viewport = page.viewportSize()!;
  for (const selector of ['h1', '.intro p', '[data-metric="Agents online"]', '[data-metric="Working now"]', '.refresh-button']) {
    const box = await page.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThan(viewport.height);
  }
});

test('loading has no invented numbers and holds the summary layout', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('https://api.imd.fun/**', async (route) => {
    await gate;
    await route.fulfill({ json: route.request().url().includes('/swarm') ? { health } : { requests } });
  });
  await page.goto('./');
  await expect(page.locator('.live-label')).toHaveText('Connecting');
  await expect(page.locator('[data-metric="Agents online"]')).toHaveText('—Loading');
  await expect(page.locator('.service-status')).toHaveText(['Checking', 'Checking', 'Checking']);
  const before = await page.locator('.questions-section').boundingBox();
  release();
  await ready(page);
  const after = await page.locator('.questions-section').boundingBox();
  expect(after!.y).toBe(before!.y);
});

test('service labels fit their cells while loading at tablet width', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.route('https://api.imd.fun/**', () => {});
  await page.goto('./');
  await expect(page.locator('.service-status')).toHaveText(['Checking', 'Checking', 'Checking']);
  for (const service of await page.locator('.service').all()) {
    expect(await service.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
});

test('questions clamp to two lines and expand with keyboard and pointer', async ({ page }) => {
  await mockApi(page);
  await page.goto('./');
  await ready(page);
  const card = page.locator('.question-card').first();
  const text = card.locator('.question-text');
  const collapsed = await text.boundingBox();
  expect(collapsed!.height).toBeCloseTo(51.1875, 0);
  await card.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('open', '');
  expect((await text.boundingBox())!.height).toBeGreaterThan(collapsed!.height * 2);
  await expect(text).toHaveText(longQuestion);
  await expect(card.locator('.when-open')).toBeVisible();
  await card.locator('summary').click();
  await expect(card).not.toHaveAttribute('open', '');
  await page.keyboard.press('Space');
  await expect(card).toHaveAttribute('open', '');
});

test('one endpoint failing clears counts and exposes a working retry', async ({ page }) => {
  await mockApi(page);
  await page.route('https://api.imd.fun/oracle/requests?limit=10', (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('./');
  await expect(page.locator('.live-label')).toHaveText('Unavailable');
  await expect(page.getByText("Can't reach the network right now", { exact: true })).toBeVisible();
  await expect(page.locator('[data-metric="Agents online"]')).toHaveText('—Unavailable');
  await expect(page.locator('.service-status')).toHaveText(['Unknown', 'Unknown', 'Unknown']);
  await page.unroute('https://api.imd.fun/oracle/requests?limit=10');
  await page.route('https://api.imd.fun/oracle/requests?limit=10', (route) => route.fulfill({ json: { requests } }));
  await page.getByRole('button', { name: 'Retry network connection' }).click();
  await ready(page);
  await expect(page.locator('[data-metric="Agents online"]')).toHaveText('127');
});

test('ticks age, refreshes at thirty seconds, retains disclosure, and clears stale data on failure', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-10T12:00:00Z') });
  let calls = 0;
  let fail = false;
  await mockApi(page);
  await page.route('https://api.imd.fun/swarm', (route) => {
    calls += 1;
    return fail ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.fulfill({ json: { health: { ...health, agentsOnline: 127 + calls } } });
  });
  await page.goto('./');
  await ready(page);
  await page.locator('.question-card summary').first().click();
  await page.clock.runFor(5_000);
  await expect(page.locator('.updated')).toHaveText('Updated 5s ago');
  expect(calls).toBe(1);
  const before = await page.locator('.questions-section').boundingBox();
  await page.clock.runFor(25_000);
  await expect(page.locator('[data-metric="Agents online"]')).toHaveText('129');
  await expect(page.locator('.updated')).toHaveText('Updated 0s ago');
  await expect(page.locator('.question-card').first()).toHaveAttribute('open', '');
  expect((await page.locator('.questions-section').boundingBox())!.y).toBe(before!.y);
  fail = true;
  await page.clock.runFor(30_000);
  await expect(page.locator('.live-label')).toHaveText('Unavailable');
  await expect(page.locator('[data-metric="Agents online"]')).toHaveText('—Unavailable');
  await expect(page.locator('.question-card')).toHaveCount(0);
});

const readingRequests = requests.map((request) => ({
  ...request, question: 'What is the state of the network? '.repeat(40),
}));

async function openReadingPosition(page: Page) {
  await page.goto('./');
  await ready(page);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.question-card summary').nth(6).click();
  await expect(page.locator('.question-card').nth(6)).toHaveAttribute('open', '');
  await page.evaluate(() => scrollTo(0, 2200));
}

const readingGeometry = (page: Page) => page.evaluate(() => ({
  height: document.documentElement.scrollHeight, y: scrollY,
}));

for (const trigger of ['delayed poll', 'long suspension', 'focus', 'visibilitychange'] as const) {
  test(`${trigger} preserves mounted questions, expansion and reading position`, async ({ page }) => {
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    let hold = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route('https://api.imd.fun/**', async (route) => {
      if (hold) await gate;
      await route.fulfill({ json: route.request().url().endsWith('/swarm') ? { health } : { requests: readingRequests } });
    });
    await openReadingPosition(page);
    const before = await readingGeometry(page);
    const seventh = await page.locator('.question-card').nth(6).elementHandle();
    await page.clock.runFor(30_000);
    await ready(page);
    expect(await readingGeometry(page)).toEqual(before);
    hold = true;
    if (trigger === 'delayed poll' || trigger === 'long suspension') {
      await page.clock.fastForward(trigger === 'delayed poll' ? 30_001 : 300_001);
    } else {
      await page.clock.setSystemTime(new Date(await page.evaluate(() => Date.now()) + 60_000));
      await page.evaluate((event) => (event === 'focus' ? window : document).dispatchEvent(new Event(event)), trigger);
    }
    await expect(page.locator('.live-label')).toHaveText('Refreshing');
    await expect(page.locator('.updated')).toHaveText(/Updated (30|60|300)s ago/);
    await expect(page.getByText('Refreshing network data. Showing last received values.')).toBeVisible();
    await expect(page.locator('.question-card')).toHaveCount(10);
    await expect(page.locator('.question-card').nth(6)).toHaveAttribute('open', '');
    expect(await seventh!.evaluate((element) => element.isConnected)).toBe(true);
    expect(await readingGeometry(page)).toEqual(before);
    release();
    await ready(page);
    await expect(page.locator('.updated')).toHaveText('Updated 0s ago');
    await expect(page.locator('.question-card').nth(6)).toHaveAttribute('open', '');
    expect(await seventh!.evaluate((element) => element.isConnected)).toBe(true);
    expect(await readingGeometry(page)).toEqual(before);
  });
}

for (const failure of ['HTTP error', 'timeout', 'offline'] as const) {
  test(`${failure} clears unavailable data without collapsing the reading area`, async ({ page, context }) => {
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await mockApi(page, { oracles: { requests: readingRequests } });
    await openReadingPosition(page);
    const before = await readingGeometry(page);
    if (failure === 'offline') {
      await context.setOffline(true);
    } else {
      await page.route('https://api.imd.fun/swarm', (route) => failure === 'timeout'
        ? undefined : route.fulfill({ status: 503, body: 'Unavailable' }));
      await page.clock.fastForward(30_001);
      if (failure === 'timeout') {
        await expect(page.locator('.live-label')).toHaveText('Refreshing');
        expect(await readingGeometry(page)).toEqual(before);
        await page.clock.runFor(12_001);
      }
    }
    await expect(page.locator('.live-label')).toHaveText('Unavailable');
    for (const metric of await page.locator('[data-metric]').all()) await expect(metric).toHaveText('—Unavailable');
    await expect(page.locator('.service-status')).toHaveText(['Unknown', 'Unknown', 'Unknown']);
    await expect(page.locator('.question-card')).toHaveCount(0);
    await expect(page.locator('.question-text, .attestation, .status-badge')).toHaveCount(0);
    expect(await readingGeometry(page)).toEqual(before);
    const message = page.getByRole('heading', { name: 'Questions are unavailable' });
    await expect(message).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Retry network connection' })).toBeEnabled();
    if (failure === 'offline') await context.setOffline(false);
    else {
      await page.unroute('https://api.imd.fun/swarm');
      await page.route('https://api.imd.fun/swarm', (route) => route.fulfill({ json: { health } }));
      await page.getByRole('button', { name: 'Retry network connection' }).click();
    }
    await ready(page);
    await expect(page.locator('.question-card')).toHaveCount(10);
  });
}

test('times out a hanging API and never labels old data live', async ({ page }) => {
  await page.clock.install();
  await page.route('https://api.imd.fun/**', () => {});
  await page.goto('./');
  await expect(page.locator('.live-label')).toHaveText('Connecting');
  await page.clock.runFor(12_001);
  await expect(page.locator('.live-label')).toHaveText('Unavailable');
  await expect(page.getByRole('button', { name: 'Retry network connection' })).toBeEnabled();
});

test('offline clears a successful snapshot and online recovers', async ({ page, context }) => {
  await mockApi(page);
  await page.goto('./');
  await ready(page);
  await context.setOffline(true);
  await expect(page.locator('.live-label')).toHaveText('Unavailable');
  await expect(page.locator('[data-metric="Working now"]')).toHaveText('—Unavailable');
  await context.setOffline(false);
  await ready(page);
});

test('zero counts are valid, an empty list is explicit, malformed health fails', async ({ page }) => {
  await mockApi(page, { swarm: { health: { ...health, agentsOnline: 0, workingNow: 0 } }, oracles: { requests: [] } });
  await page.goto('./');
  await ready(page);
  await expect(page.locator('[data-metric="Agents online"]')).toHaveText('0');
  await expect(page.getByRole('heading', { name: 'No oracle questions yet' })).toBeVisible();
  await page.route('https://api.imd.fun/swarm', (route) => route.fulfill({ json: { health: { ...health, agentsOnline: null } } }));
  await page.getByRole('button', { name: 'Refresh network data' }).click();
  await expect(page.locator('.live-label')).toHaveText('Unavailable');
});

for (const width of [320, 390, 704, 768, 1440]) {
  test(`no horizontal overflow at ${width}px, including long expanded questions`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await page.goto('./');
    await ready(page);
    await page.locator('.question-card summary').nth(1).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const text = page.locator('.question-card').nth(1).locator('.question-text');
    expect(await text.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
}

test('supports enlarged text, keyboard focus, reduced motion and axe checks', async ({ page }) => {
  await mockApi(page);
  await page.goto('./');
  await ready(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Refresh network data' })).toBeFocused();
  expect(await page.locator('.refresh-button').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.refresh-button').evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
  await page.addStyleTag({ content: ':root { font-size: 32px; }' });
  // Text enlargement is distinct from browser-native zoom.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('static subpath assets, local font, title and sharing metadata load', async ({ page, request }) => {
  await mockApi(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await ready(page);
  await expect(page).toHaveTitle('IMD, right now — Live swarm status');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /AI agents/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'IMD, right now');
  const shareImage = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(shareImage).toBe('./og-image.png');
  expect((await request.get(shareImage!)).status()).toBe(200);
  expect((await request.get('./favicon.svg')).status()).toBe(200);
  expect(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px Geist'); })).toBe(true);
  expect(errors).toEqual([]);
});

test('parsers reject invented fallbacks, preserve API order, and use correct attestation units', () => {
  expect(parseHealth({ health })).toEqual(health);
  for (const invalid of [undefined, NaN, -1, 1.5, '12']) {
    expect(() => parseHealth({ health: { ...health, agentsOnline: invalid } })).toThrow();
  }
  expect(() => parseHealth({ health: { ...health, verifierUp: 'true' } })).toThrow();
  expect(() => parseHealth({ health: { ...health, reachable: false } })).toThrow();
  expect(parseQuestions({ requests })).toEqual(requests);
  expect(parseQuestions({ requests: [...requests, { ...requests[0], id: 'extra' }] })).toHaveLength(10);
  expect(() => parseQuestions({ requests: [{ ...requests[0], attestedAt: 'invalid date' }] })).toThrow();
  expect(() => parseQuestions({ requests: [requests[0], requests[0]] })).toThrow();
  expect(chainName(4663)).toBe('Robinhood Chain');
  const date = '2026-10-10T10:00:00Z';
  expect(attestationAge(date, Date.parse(date) + 5_000)).toBe('Attested 5s ago');
  expect(attestationAge(date, Date.parse(date) + 120_000)).toBe('Attested 2m ago');
  expect(attestationAge(date, Date.parse(date) + 7_200_000)).toBe('Attested 2h ago');
  expect(attestationAge(date, Date.parse(date) + 172_800_000)).toBe('Attested 2d ago');
  expect(attestationAge(date, Date.parse(date) - 10_000)).toBe('Attested · check clock');
});
