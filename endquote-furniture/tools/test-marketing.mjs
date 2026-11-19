import { chromium, expect } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'reports/marketing')
const url = process.env.MARKETING_URL || 'http://127.0.0.1:5173/'
await mkdir(output, { recursive: true })
const report = { status: 'running', url, widths: [], checks: {}, errors: [] }
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] })
let currentPage
function assert(value, message) { if (!value) throw new Error(message) }
const digits = (value) => Number(value.replace(/\D/g, ''))
async function overflow(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow: ${page.url()}`)
}
async function shot(page, name, fullPage = false) {
  await page.screenshot({ path: path.join(output, name), fullPage, animations: 'disabled', scale: 'css' })
}
try {
  for (const width of [390, 360, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width > 700 ? 1000 : 844 }, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700, locale: 'ru-RU' })
    const page = await context.newPage(); currentPage = page
    const errors = [], requests = [], writes = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => {
      requests.push(request.url())
      if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url())
    })
    await page.goto(url)
    await expect(page.locator('h1')).toHaveText('Ваши услуги.Ваши цены.Одна ссылка.')
    assert(new URL(page.url()).pathname === '/', 'Landing redirected to storefront')
    await expect(page).toHaveTitle(/EndQuote — ваши услуги/)
    assert(await page.locator('meta[name="description"]').getAttribute('content'), 'Missing SEO description')
    await page.evaluate(() => document.fonts.ready)
    await overflow(page)
    await shot(page, `${width}-hero.png`)
    for (const image of await page.locator('main img').all()) {
      await image.scrollIntoViewIfNeeded()
      await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true)
    }
    assert(!requests.some((value) => /\.glb|FurnitureViewer|three\.module|react-three/.test(value)), 'Heavy 3D fetched without interaction')
    await expect(page.locator('iframe')).toHaveCount(0)
    await shot(page, `${width}-landing.png`, true)
    if (width < 800) {
      await page.getByRole('button', { name: 'Открыть меню', exact: true }).click()
      await expect(page.getByRole('navigation', { name: 'Мобильная навигация' })).toBeVisible()
      await page.getByRole('navigation', { name: 'Мобильная навигация' }).getByRole('link', { name: 'Тарифы' }).click()
      await expect(page.getByRole('navigation', { name: 'Мобильная навигация' })).toHaveCount(0)
    }
    await expect(page.locator('#pricing')).toContainText('Тарифы готовятся')
    assert(!/\d[\s\d]*(?:₸|тенге|\/мес)/.test(await page.locator('#pricing').innerText()), 'Invented subscription price')
    await expect(page.locator('#pricing').getByRole('link', { name: 'Начать бесплатно' })).toHaveAttribute('href', '/owner/register')
    await expect(page.getByRole('link', { name: 'dryuicode@gmail.com' })).toHaveAttribute('href', 'mailto:dryuicode@gmail.com')
    await page.locator('#faq summary').first().click()
    await expect(page.locator('#faq details').first()).toHaveAttribute('open', '')
    await expect(page.locator('#faq details').first()).toContainText('раннему доступу')
    await page.getByRole('button', { name: /^Конфиденциальность/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog')).toContainText('Документ готовится')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const basketKey = 'endquote.demo.basket.chistodom.v1'
    await page.evaluate((key) => localStorage.setItem(key, '[{"preserved":true}]'), basketKey)
    await page.getByRole('button', { name: /Рассмотрите в 3D/ }).click()
    const frame = page.frameLocator('iframe')
    await frame.locator('[data-viewer-state="ready"]').waitFor({ timeout: 45000 })
    await page.locator('iframe').scrollIntoViewIfNeeded()
    await expect(page.locator('iframe')).toHaveCount(1)
    const viewer = frame.locator('[data-camera-position]')
    const before = await viewer.getAttribute('data-camera-position')
    const canvas = frame.locator('canvas'), box = await canvas.boundingBox()
    if (width < 700) {
      const cdp = await context.newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * .3, y: box.y + box.height * .45 }] })
      for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * (.3 + i * .03), y: box.y + box.height * .45 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    } else {
      await page.mouse.move(box.x + box.width * .3, box.y + box.height * .5)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * .7, box.y + box.height * .5, { steps: 12 })
      await page.mouse.up()
    }
    await expect.poll(() => viewer.getAttribute('data-camera-position')).not.toBe(before)
    await shot(page, `${width}-interactive.png`)
    assert(requests.filter((value) => /\.glb(?:\?|$)/.test(value)).every((value) => value.endsWith('/sofa-2-seater.glb')), 'Other models loaded by showcase')
    await page.getByRole('button', { name: /Узнайте стоимость/ }).click()
    await frame.getByRole('button', { name: 'Увеличить количество' }).waitFor()
    await expect.poll(async () => digits(await frame.getByTestId('config-total').innerText())).toBe(9000)
    await frame.getByRole('button', { name: 'Увеличить количество' }).click()
    await expect.poll(async () => digits(await frame.getByTestId('config-total').innerText())).toBe(18000)
    await page.locator('iframe').scrollIntoViewIfNeeded()
    await frame.getByRole('button', { name: 'Добавить в заказ' }).click()
    await frame.getByRole('button', { name: 'Перейти к заказу' }).click()
    await expect(frame.getByTestId('cart-total')).toContainText('18')
    assert(await page.evaluate((key) => localStorage.getItem(key), basketKey) === '[{"preserved":true}]', 'Embedded preview changed standalone basket')
    await page.getByRole('button', { name: /Соберите заявку/ }).click()
    await expect(frame.getByRole('heading', { name: 'Куда приедем?' })).toBeVisible()
    await expect(frame.getByLabel('Ваше имя', { exact: false })).toHaveValue('')
    await expect(frame.getByText(/Сейчас это демо/)).toBeVisible()
    await expect(frame.getByRole('button', { name: 'Отправить демо-заявку' })).toBeVisible()
    await overflow(page)
    assert(writes.length === 0, 'Backend or outbound write request detected')
    assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`)
    report.widths.push({ width, noOverflow: true, previewsLoaded: true, noInitial3D: true, actualEmbedded3D: true, rotation: width < 700 ? 'touch' : 'mouse', livePrice: '9000 → 18000', basketIsolated: true, realBookingForm: true, errors })
    // Verify normal demo link remains a separate route with the real 12-item catalog.
    await page.getByRole('link', { name: 'Посмотреть демо', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: 'ЧистоДом', exact: true })).toBeVisible()
    await expect(page.locator('[data-testid^="booking-card-"]')).toHaveCount(12)
    assert(new URL(page.url()).pathname === '/chistodom', 'Wrong demo route')
    await context.close()
  }
  const baseline = JSON.parse(await readFile(path.join(root, 'reports/booking/assets-before.json'), 'utf8'))
  for (const [file, expected] of Object.entries(baseline)) {
    const hash = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex')
    assert(hash === expected, `Furniture asset changed: ${file}`)
  }
  report.checks = { assetsBytePreserved: Object.keys(baseline).length, realContactLinks: true, honestPricingAndLegal: true, noBackendRequests: true, demoNavigation: true }
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.errors.push(String(error.stack || error))
  if (currentPage && !currentPage.isClosed()) await shot(currentPage, 'failure.png', true).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
  await writeFile(path.join(output, 'e2e-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}
