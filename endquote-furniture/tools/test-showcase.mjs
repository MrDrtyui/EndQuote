#!/usr/bin/env node
// Run after `npm run dev -- --host 127.0.0.1`: npm run test:showcase
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, access, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(projectRoot, 'reports/showcase');
const baseURL = process.env.SHOWCASE_URL || 'http://127.0.0.1:5173/lab';
const modelIds = [
  'armchair', 'dining-chair', 'mattress-double', 'mattress-single', 'ottoman',
  'sofa-2-seater', 'sofa-3-seater', 'sofa-4-seater', 'sofa-bed',
  'sofa-l-shaped', 'sofa-u-shaped', 'upholstered-headboard',
];
const result = {
  startedAt: new Date().toISOString(), baseURL, status: 'running',
  scope: 'Desktop Chrome browser and emulated mobile viewport/touch; no physical older Android device benchmark.',
  checks: {}, models: [], errors: [], screenshots: [],
};
let browser;
let desktop;
let mobile;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const glbName = url => decodeURIComponent(new URL(url).pathname.split('/').pop());
const isGLB = url => /\.glb(?:[?#]|$)/i.test(url);

async function snapshot(page, filename, fullPage = true) {
  const target = path.join(output, filename);
  await page.screenshot({ path: target, fullPage, scale: 'css', animations: 'disabled' });
  result.screenshots.push(`reports/showcase/${filename}`);
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth, document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert(dimensions.document <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1,
    `${label}: horizontal overflow ${JSON.stringify(dimensions)}`);
  return dimensions;
}

async function pixelStatistics(page, image) {
  return page.evaluate(async base64 => {
    const picture = new Image();
    picture.src = `data:image/png;base64,${base64}`;
    await picture.decode();
    const canvas = document.createElement('canvas');
    canvas.width = picture.width; canvas.height = picture.height;
    const context = canvas.getContext('2d'); context.drawImage(picture, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const colors = new Set();
    let min = 255; let max = 0; let opaque = 0;
    for (let i = 0; i < data.length; i += 16) {
      colors.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      min = Math.min(min, brightness); max = Math.max(max, brightness);
      if (data[i + 3] > 200) opaque++;
    }
    return { width: canvas.width, height: canvas.height, quantizedColors: colors.size, brightnessRange: max - min, opaqueSamples: opaque };
  }, image.toString('base64'));
}

async function imageDifference(page, left, right) {
  return page.evaluate(async ([a, b]) => {
    const load = async value => { const image = new Image(); image.src = `data:image/png;base64,${value}`; await image.decode(); return image; };
    const [first, second] = await Promise.all([load(a), load(b)]);
    if (first.width !== second.width || first.height !== second.height) return 1;
    const canvas = document.createElement('canvas'); canvas.width = first.width; canvas.height = first.height;
    const context = canvas.getContext('2d'); context.drawImage(first, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(second, 0, 0);
    const other = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let changed = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (Math.abs(pixels[i] - other[i]) + Math.abs(pixels[i + 1] - other[i + 1]) + Math.abs(pixels[i + 2] - other[i + 2]) > 18) changed++;
    }
    return changed / (pixels.length / 4);
  }, [left.toString('base64'), right.toString('base64')]);
}

async function viewerMetadata(page) {
  return page.locator('[data-viewer-state]').first().evaluate(element => ({
    state: element.dataset.viewerState, modelId: element.dataset.modelId,
    dpr: Number(element.dataset.dpr),
    camera: element.dataset.cameraPosition ? JSON.parse(element.dataset.cameraPosition) : null,
    orbitChanges: Number(element.dataset.orbitChangeCount || 0),
  }));
}

async function readyViewer(page, id) {
  const viewer = page.locator(`[data-viewer-state="ready"][data-model-id="${id}"]`);
  await viewer.waitFor({ timeout: 45000 });
  const canvas = viewer.locator('canvas').first();
  await canvas.waitFor({ state: 'visible' });
  await page.waitForTimeout(150);
  const geometry = await canvas.evaluate(element => ({
    width: element.width, height: element.height,
    cssWidth: element.getBoundingClientRect().width,
    cssHeight: element.getBoundingClientRect().height,
  }));
  assert(geometry.width > 0 && geometry.height > 0 && geometry.cssWidth > 0 && geometry.cssHeight > 0, `${id}: empty canvas`);
  const metadata = await viewerMetadata(page);
  const graphics = await canvas.evaluate(element => {
    const gl = element.getContext('webgl2') || element.getContext('webgl');
    if (!gl) return null;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { version: gl.getParameter(gl.VERSION), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR) };
  });
  assert(graphics, `${id}: no live WebGL context`);
  const measuredDPR = geometry.width / geometry.cssWidth;
  assert(measuredDPR <= 1.52, `${id}: drawing buffer DPR ${measuredDPR} exceeds 1.5`);
  if (metadata.dpr) assert(metadata.dpr <= 1.5, `${id}: reported DPR exceeds 1.5`);
  const frame = await canvas.screenshot({ scale: 'css', animations: 'disabled' });
  const pixels = await pixelStatistics(page, frame);
  assert(pixels.quantizedColors > 12 && pixels.brightnessRange > 25, `${id}: rendered canvas appears blank ${JSON.stringify(pixels)}`);
  return { canvas, metadata, geometry, graphics, measuredDPR, pixels, frame };
}

async function closeViewer(page, escape = false) {
  if (escape) await page.keyboard.press('Escape');
  else await page.getByRole('button', { name: 'Закрыть просмотр', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}

async function instrumentImageDecoding(context) {
  await context.addInitScript(() => {
    window.__showcaseDecodedImages = [];
    if (typeof window.createImageBitmap !== 'function') return;
    const original = window.createImageBitmap.bind(window);
    window.createImageBitmap = async (...args) => {
      const image = await original(...args);
      window.__showcaseDecodedImages.push({ width: image.width, height: image.height, sourceType: args[0]?.constructor?.name, mimeType: args[0]?.type || null, sourceBytes: args[0]?.size || null });
      return image;
    };
  });
}

function captureEvents(page, target) {
  page.on('pageerror', error => target.errors.push(error.stack || error.message));
  page.on('console', message => { if (message.type() === 'error') target.consoleErrors.push(message.text()); });
  page.on('request', request => { if (isGLB(request.url())) target.requests.push({ url: request.url(), file: glbName(request.url()) }); });
  page.on('response', response => { if (isGLB(response.url())) target.responses.push({ url: response.url(), file: glbName(response.url()), status: response.status() }); });
  page.on('requestfailed', request => { if (isGLB(request.url())) target.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }); });
}

await mkdir(output, { recursive: true });
try {
  let executablePath = process.env.CHROME_EXECUTABLE_PATH;
  if (!executablePath) {
    const installedChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    try { await access(installedChrome); executablePath = installedChrome; } catch { /* Use installed Playwright Chromium elsewhere. */ }
  }
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-first-run', '--no-default-browser-check'] });
  result.browser = { version: browser.version(), executable: executablePath || 'Playwright Chromium' };
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  await instrumentImageDecoding(desktopContext);
  desktop = await desktopContext.newPage();
  const events = { errors: [], consoleErrors: [], requests: [], responses: [], failedRequests: [] };
  captureEvents(desktop, events);
  await desktop.goto(baseURL, { waitUntil: 'networkidle' });
  await desktop.getByTestId('model-card-armchair').waitFor();
  const cards = desktop.locator('[data-testid^="model-card-"]');
  assert(await cards.count() === 12, `Expected 12 catalog cards, got ${await cards.count()}`);
  await desktop.waitForTimeout(250);
  assert(events.requests.length === 0, 'GLB loaded before a model was selected');
  result.checks.lazyInitialCatalog = { passed: true, glbRequests: 0 };
  result.checks.desktopOverflow = await assertNoOverflow(desktop, 'Desktop catalog');
  await snapshot(desktop, 'desktop-catalog.png');

  for (const id of modelIds) {
    const card = desktop.getByTestId(`model-card-${id}`);
    const cardTitle = await card.locator('h2,h3,[data-model-name]').first().textContent().catch(() => '');
    const initialRequests = events.requests.length;
    const previousDecodes = await desktop.evaluate(() => window.__showcaseDecodedImages.length);
    await card.click();
    const dialog = desktop.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    const heading = await dialog.getByRole('heading').first().innerText();
    assert(/[А-Яа-яЁё]/.test(heading), `${id}: dialog heading is not localized Russian: ${heading}`);
    if (cardTitle?.trim()) assert(heading.includes(cardTitle.trim()), `${id}: dialog heading does not match card`);
    const loaded = await readyViewer(desktop, id);
    const requests = events.requests.slice(initialRequests);
    assert(requests.every(request => request.file === `${id}.glb`), `${id}: an unselected GLB was requested`);
    assert(events.responses.some(response => response.file === `${id}.glb` && response.status === 200), `${id}: no successful GLB HTTP 200 response`);
    const decodedImages = await desktop.evaluate(start => window.__showcaseDecodedImages.slice(start), previousDecodes);
    assert(decodedImages.some(image => image.width === 128 && image.height === 128 && image.mimeType === 'image/png'), `${id}: no actual embedded normal PNG decoder event`);
    const entry = { id, heading, requests, http200: true, decodedImages, graphics: loaded.graphics, canvas: loaded.geometry, dpr: loaded.measuredDPR, pixelStatistics: loaded.pixels };

    const bounds = await loaded.canvas.boundingBox();
    assert(bounds, `${id}: missing canvas bounds`);
    await desktop.mouse.move(bounds.x + bounds.width * 0.45, bounds.y + bounds.height * 0.55);
    await desktop.mouse.down();
    await desktop.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.58, { steps: 12 });
    await desktop.mouse.up();
    await desktop.waitForTimeout(300);
    const rotated = await loaded.canvas.screenshot({ scale: 'css' });
    const rotatedMetadata = await viewerMetadata(desktop);
    const changedRatio = await imageDifference(desktop, loaded.frame, rotated);
    assert(changedRatio > 0.002, `${id}: mouse drag did not visibly rotate model (${changedRatio})`);
    if (loaded.metadata.camera && rotatedMetadata.camera) assert(JSON.stringify(loaded.metadata.camera) !== JSON.stringify(rotatedMetadata.camera), `${id}: mouse drag did not change actual camera position`);
    if (id === 'sofa-u-shaped') await snapshot(desktop, 'desktop-viewer-u-shaped.png', false);
    await desktop.getByRole('button', { name: 'Сбросить вид', exact: true }).click();
    await desktop.waitForTimeout(300);
    const resetMetadata = await viewerMetadata(desktop);
    if (loaded.metadata.camera && resetMetadata.camera) {
      const distance = Math.hypot(...loaded.metadata.camera.map((value, index) => value - resetMetadata.camera[index]));
      assert(distance < 0.02, `${id}: reset did not restore initial camera (${distance}m)`);
    }
    entry.mouseOrbitAndReset = { passed: true, changedPixelRatio: changedRatio, initial: loaded.metadata, rotated: rotatedMetadata, reset: resetMetadata };

    if (id === 'armchair') {
      const focusIsInside = () => desktop.evaluate(() => document.querySelector('[role="dialog"],dialog[open]')?.contains(document.activeElement));
      assert(await focusIsInside(), 'Opening dialog did not place focus inside it');
      for (let i = 0; i < 12; i++) { await desktop.keyboard.press('Tab'); assert(await focusIsInside(), 'Tab escaped the modal focus trap'); }
      for (let i = 0; i < 5; i++) { await desktop.keyboard.press('Shift+Tab'); assert(await focusIsInside(), 'Shift+Tab escaped the modal focus trap'); }
      result.checks.keyboardFocusTrap = { passed: true, forwardTabs: 12, reverseTabs: 5 };
      await closeViewer(desktop, true);
      await expect(card, 'Escape should return focus to selected card after modal cleanup').toBeFocused();
      result.checks.escapeAndFocusRestoration = { passed: true };
    } else await closeViewer(desktop);
    result.models.push(entry);
  }
  result.checks.mouseOrbitAndReset = { passed: true, testedModels: result.models.length };
  result.checks.embeddedImageDecoding = { passed: true, testedModels: result.models.filter(model => model.decodedImages.some(image => image.width === 128 && image.height === 128 && image.mimeType === 'image/png')).length }; 
  assert(events.failedRequests.length === 0, `Failed GLB requests: ${JSON.stringify(events.failedRequests)}`);
  assert(events.errors.length === 0, `Desktop page errors: ${events.errors.join('\n')}`);
  assert(events.consoleErrors.length === 0, `Desktop console errors: ${events.consoleErrors.join('\n')}`);
  result.checks.desktopErrors = events;

  const search = desktop.getByRole('searchbox');
  await search.fill('матрас');
  await desktop.waitForTimeout(100);
  await expect(cards, 'Search for матрас should show exactly two mattresses').toHaveCount(2);
  await search.fill('несуществующая-модель-123');
  await desktop.waitForTimeout(100);
  await expect(cards, 'Unmatched search should show zero cards').toHaveCount(0);
  await search.fill('');
  await expect(cards, 'Clearing search should restore 12 cards').toHaveCount(12);
  const mattressFilter = desktop.getByRole('button', { name: /^Для спальни/ });
  await mattressFilter.click();
  await expect(cards, 'Для спальни filter should show three models').toHaveCount(3);
  await desktop.getByRole('button', { name: /^Все(?:\s|$)/ }).click();
  await expect(cards, 'Все filter should restore all models').toHaveCount(12);
  result.checks.searchAndFilters = { passed: true, mattressResults: 2, bedroomFilterResults: 3, unmatchedResults: 0, resetResults: 12 };

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await instrumentImageDecoding(mobileContext);
  mobile = await mobileContext.newPage();
  const mobileEvents = { errors: [], consoleErrors: [], requests: [], responses: [], failedRequests: [] };
  captureEvents(mobile, mobileEvents);
  await mobile.goto(baseURL, { waitUntil: 'networkidle' });
  await mobile.getByTestId('model-card-sofa-u-shaped').waitFor();
  assert(mobileEvents.requests.length === 0, 'Mobile catalog eagerly loaded a GLB');
  result.checks.mobileOverflow = await assertNoOverflow(mobile, 'Mobile catalog');
  await snapshot(mobile, 'mobile-catalog.png');
  await mobile.getByTestId('model-card-sofa-u-shaped').click();
  const mobileLoaded = await readyViewer(mobile, 'sofa-u-shaped');
  await assertNoOverflow(mobile, 'Mobile viewer');
  const mobileBounds = await mobileLoaded.canvas.boundingBox();
  assert(mobileBounds, 'Missing mobile canvas bounds');
  const session = await mobileContext.newCDPSession(mobile);
  const startX = mobileBounds.x + mobileBounds.width * 0.35;
  const startY = mobileBounds.y + mobileBounds.height * 0.5;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y: startY, id: 1 }] });
  for (let i = 1; i <= 12; i++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startX + 85 * i / 12, y: startY + 8 * i / 12, id: 1 }] });
    await sleep(12);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.waitForTimeout(300);
  const mobileRotated = await mobileLoaded.canvas.screenshot({ scale: 'css' });
  const touchChangedRatio = await imageDifference(mobile, mobileLoaded.frame, mobileRotated);
  const mobileAfter = await viewerMetadata(mobile);
  assert(touchChangedRatio > 0.002, `Real CDP touch drag did not visibly rotate model (${touchChangedRatio})`);
  if (mobileLoaded.metadata.camera && mobileAfter.camera) assert(JSON.stringify(mobileLoaded.metadata.camera) !== JSON.stringify(mobileAfter.camera), 'Touch drag did not change camera');
  result.checks.mobileTouchOrbit = { passed: true, viewport: '390×844', deviceScaleFactor: 2, dpr: mobileLoaded.measuredDPR, changedPixelRatio: touchChangedRatio, initial: mobileLoaded.metadata, rotated: mobileAfter };
  await snapshot(mobile, 'mobile-viewer.png', false);
  assert(mobileEvents.errors.length === 0 && mobileEvents.consoleErrors.length === 0, `Mobile browser errors: ${JSON.stringify(mobileEvents)}`);
  result.checks.mobileErrors = mobileEvents;

  const fallbackContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await fallbackContext.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (['webgl', 'webgl2', 'experimental-webgl'].includes(type)) return null;
      return original.call(this, type, ...args);
    };
  });
  const fallback = await fallbackContext.newPage();
  await fallback.goto(baseURL, { waitUntil: 'networkidle' });
  await fallback.getByTestId('model-card-armchair').click();
  const fallbackViewer = fallback.locator('[data-viewer-state="fallback"]');
  await fallbackViewer.waitFor({ timeout: 20000 });
  const fallbackImage = fallbackViewer.locator('img').first();
  await fallbackImage.waitFor({ state: 'visible' });
  await fallbackImage.evaluate(image => image.decode());
  const imageState = await fallbackImage.evaluate(image => ({ complete: image.complete, width: image.naturalWidth, height: image.naturalHeight, alt: image.alt, source: image.currentSrc }));
  assert(imageState.complete && imageState.width > 0 && imageState.height > 0 && imageState.alt, 'WebGL-unavailable fallback image failed to load/accessibility name missing');
  await assertNoOverflow(fallback, 'Fallback viewer');
  await snapshot(fallback, 'mobile-webgl-fallback.png', false);
  result.checks.webglUnavailableFallback = { passed: true, image: imageState };
  await closeViewer(fallback, true);
  await fallbackContext.close();
  result.status = 'passed';
  await Promise.all(['failure-desktop.png', 'failure-mobile.png'].map(filename => rm(path.join(output, filename), { force: true }))); 
} catch (error) {
  result.status = 'failed';
  result.errors.push(error.stack || String(error));
  if (desktop && !desktop.isClosed()) await snapshot(desktop, 'failure-desktop.png', false).catch(() => {});
  if (mobile && !mobile.isClosed()) await snapshot(mobile, 'failure-mobile.png', false).catch(() => {});
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, 'e2e-report.json'), JSON.stringify(result, null, 2) + '\n');
  if (browser) await browser.close();
  console.log(JSON.stringify({ status: result.status, testedModels: result.models.length, screenshots: result.screenshots, errors: result.errors, report: 'reports/showcase/e2e-report.json' }, null, 2));
}
