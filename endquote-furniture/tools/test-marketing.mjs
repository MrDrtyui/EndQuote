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
    const modelResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/models/sofa-2-seater.glb')
    await page.goto(url)
    assert((await modelResponse).ok(), 'Hero sofa failed to load')
    await expect(page.locator('.eq-hero canvas[data-model-ready]')).toBeVisible()
    await expect(page.locator('h1')).toHaveText('Ваши услуги. Ваши цены. Одна ссылка.')
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
    const models = requests.filter(value => new URL(value).pathname.endsWith('.glb'))
    assert(models.every(value => new URL(value).pathname === '/models/sofa-2-seater.glb'), 'Unrelated furniture model fetched on landing')
    await expect(page.locator('iframe')).toHaveCount(0)
    await expect(page.locator('.eq-hero')).toHaveCSS('background-color', 'rgb(248, 249, 244)')
    await expect(page.locator('.eq-studio, .eq-sofa-stage')).toHaveCount(0)
    await expect(page.locator('.eq-hero').getByRole('link', { name: 'Посмотреть демо' })).toHaveCount(0)
    await expect(page.locator('.eq-hero').getByRole('link', { name: 'Как это работает' })).toBeVisible()
    await expect(page.locator('.eq-header')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(page.locator('#how-it-works')).toBeVisible()
    await expect(page.locator('#features')).toHaveCount(0)
    await expect(page.locator('.eq-benefits')).toHaveCount(0)
    await expect(page.locator('#faq')).toHaveCount(0)
    await shot(page, `${width}-landing.png`, true)
    await page.locator('.eq-hero-learn').click()
    await expect(page.locator('.eq-header')).toHaveClass(/eq-header--dark/)
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(page.locator('.eq-header')).not.toHaveClass(/eq-header--dark/)
    if (width < 800) {
      await page.getByRole('button', { name: 'Открыть меню', exact: true }).click()
      await expect(page.getByRole('navigation', { name: 'Мобильная навигация' })).toBeVisible()
      await page.getByRole('navigation', { name: 'Мобильная навигация' }).getByRole('link', { name: 'Тарифы' }).click()
      await expect(page.getByRole('navigation', { name: 'Мобильная навигация' })).toHaveCount(0)
    }
    await expect(page.locator('#pricing')).toContainText('Один продукт.')
    await expect(page.locator('#pricing')).toContainText('Четыре тарифа.')
    await expect(page.locator('.eq-plan-card')).toHaveCount(4)
    await expect(page.locator('#pricing .eq-plan-index')).toHaveCount(0)
    await expect(page.locator('.eq-plan-card').first().locator('.eq-plan-features li')).toHaveCount(3)
    await expect(page.locator('.eq-pricing-copy')).toHaveCSS('text-align', 'center')
    await expect(page.locator('.eq-pricing-copy .eq-section-label')).toHaveCSS('justify-content', 'center')
    await expect(page.locator('.eq-plan-card').first()).toHaveCSS('text-align', 'center')
    await expect(page.locator('.eq-plan-card').first().locator('.eq-plan-rate strong')).toHaveCSS('color', 'rgb(242, 243, 237)')
    if (width === 1440) {
      const card = page.locator('.eq-plan-card').first()
      assert(await card.evaluate(element => element.getBoundingClientRect().height < 360), 'Pricing card is too tall')
    }
    await expect(page.locator('.eq-plan-card--trial h3')).toHaveText('Free')
    await expect(page.locator('.eq-plan-card--trial .eq-plan-rate strong')).toHaveText('0 ₸')
    await expect(page.locator('.eq-plan-card--trial')).toContainText('14 дней')
    await expect(page.locator('.eq-plan-card--trial a.eq-plan-action')).toHaveAttribute('href', '/owner/register')
    const expectedColumns = width <= 760 ? 1 : width <= 1180 ? 2 : 4
    assert(await page.locator('.eq-plan-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length) === expectedColumns, 'Pricing responsive columns')
    for (const amount of ['4 999', '13 490', '47 990']) await expect(page.locator('#pricing')).toContainText(amount)
    for (const card of await page.locator('.eq-plan-card').all()) {
      await expect(card).toHaveCSS('background-color', 'rgb(37, 39, 33)')
    }
    for (const card of await page.locator('.eq-plan-card:not(.eq-plan-card--trial)').all()) {
      const link = card.locator('a.eq-plan-action')
      await expect(link).toHaveAttribute('href', /^https:\/\/wa\.me\/77088056548\?text=/)
      await expect(link).toHaveAttribute('target', '_blank')
    }
    await expect(page.locator('.eq-plan-card--recommended .eq-plan-badge')).toHaveCSS('background-color', 'rgb(200, 248, 133)')
    await expect(page.locator('.eq-plan-action').first()).toHaveCSS('background-color', 'rgb(242, 243, 237)')
    await expect(page.locator('#pricing')).toContainText('Автоматических списаний нет.')
    await expect(page.getByRole('link', { name: 'dryuicode@gmail.com' })).toHaveAttribute('href', 'mailto:dryuicode@gmail.com')
    await page.getByRole('button', { name: /^Конфиденциальность/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog')).toContainText('Документ готовится')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await overflow(page)
    assert(writes.length === 0, 'Backend or outbound write request detected')
    assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`)
    report.widths.push({ width, noOverflow: true, heroCanvasVisible: true, transparentHeader: true, onlyHeroModelFetched: true, removedSectionsAbsent: true, errors })
    // Verify normal demo link remains a separate route with the real 12-item catalog.
    await page.getByRole('link', { name: 'Посмотреть демо', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: 'Химчистка мебели на дому', exact: true })).toBeVisible()
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
