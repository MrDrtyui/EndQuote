import { chromium, expect } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'reports/booking')
await mkdir(output, { recursive: true })
const url = process.env.BOOKING_URL || 'http://127.0.0.1:5173/chistodom'
const report = { status: 'running', url, checks: {}, models: [], errors: [], screenshots: [] }
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] })
let currentPage
function assert(value, message) { if (!value) throw new Error(message) }
const digits = (text) => Number(text.replace(/\D/g, ''))
async function overflow(page) {
  const size = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }))
  assert(size.document <= size.viewport + 1, `Horizontal overflow: ${JSON.stringify(size)}`)
}
async function screenshot(page, name, fullPage = false) {
  const scroll = fullPage ? await page.evaluate(() => { const y = scrollY; scrollTo({ top: 0, behavior: 'instant' }); return y }) : 0
  await page.screenshot({ path: path.join(output, name), fullPage, animations: 'disabled', scale: 'css' })
  if (scroll) await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), scroll)
  report.screenshots.push(name)
}
async function open(page, id, fallback = false) {
  await page.getByTestId(`booking-card-${id}`).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.locator(`[data-viewer-state="${fallback ? 'fallback' : 'ready'}"][data-model-id="${id}"]`).waitFor({ timeout: 45000 })
  await overflow(page)
  if (!fallback) {
    const canvas = page.locator('[data-viewer-state] canvas')
    const dimensions = await canvas.evaluate((element) => ({ width: element.width, css: element.getBoundingClientRect().width }))
    assert(dimensions.width > 0 && dimensions.width / dimensions.css <= 1.52, 'Canvas missing or exceeds DPR1.5')
  }
}
async function contact(page, name = 'Алия') {
  await page.getByLabel('Ваше имя', { exact: false }).fill(name)
  await page.getByLabel('Номер телефона', { exact: false }).fill('+7 (701) 123-45-67')
  await page.getByLabel('Адрес', { exact: false }).fill('Алматы, проспект Абая 10, кв. 5')
  const date = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 2); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
  await page.getByLabel('Желаемая дата', { exact: false }).fill(date)
  await page.getByLabel('Комментарий к заказу', { exact: false }).fill('Пожалуйста, после 11:00.')
}

try {
  const manifest = JSON.parse(await readFile(path.join(root, 'public/manifest.json'), 'utf8'))
  for (const width of [390, 360, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width > 700 ? 1000 : 844 }, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700, locale: 'ru-RU' })
    const page = await context.newPage(); currentPage = page
    const errors = [], glbs = [], writes = [], outbound = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('request', (request) => {
      if (/\.glb(?:\?|$)/.test(request.url())) glbs.push(request.url())
      if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url())
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(url).origin) outbound.push(request.url())
    })
    await page.goto(url)
    await expect(page.getByRole('heading', { name: 'ЧистоДом', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Услуги и цены/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Рассчитать стоимость' })).toHaveCount(0)
    await overflow(page)
    assert(glbs.length === 0, 'GLB fetched before viewer opening')
    await page.getByRole('button', { name: /^Связаться/ }).click()
    await expect(page.getByRole('heading', { name: 'Связаться с «ЧистоДом»' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Позвонить/ })).toHaveAttribute('href', 'tel:+77000000000')
    await expect(page.getByText(/Это демо-профиль/)).toBeVisible()
    await page.getByRole('button', { name: 'Закрыть контакты' }).click()
    await expect(page.getByRole('link', { name: /Инстаграм — пример/ })).toHaveAttribute('target', '_blank')
    await expect(page.getByRole('link', { name: /ТикТок — пример/ })).toHaveAttribute('rel', /noopener/)
    const cards = page.locator('[data-testid^="booking-card-"]')
    await expect(cards).toHaveCount(12)
    if (width === 390) {
      await page.getByLabel('Сортировка мебели').selectOption('ascending')
      await expect(cards.first()).toHaveAttribute('data-testid', 'booking-card-dining-chair')
      await page.getByLabel('Сортировка мебели').selectOption('catalog')
    }
    await overflow(page)
    const firstPrice = await cards.first().locator('.booking-card-details').boundingBox()
    assert(firstPrice.y + firstPrice.height < (width > 700 ? 1000 : 844), `Starting price not immediately visible at ${width}px`)
    await screenshot(page, `${width}-storefront-first-screen.png`)
    await page.getByRole('button', { name: 'Матрасы', exact: true }).click()
    await expect(cards).toHaveCount(2)
    await page.getByRole('button', { name: 'Другая мебель', exact: true }).click()
    await expect(cards).toHaveCount(2)
    await page.getByRole('button', { name: 'Всё', exact: true }).click()
    await page.getByRole('searchbox', { name: 'Найти мебель' }).fill('матрас')
    await expect(cards).toHaveCount(2)
    await page.getByRole('button', { name: 'Очистить поиск' }).click()
    await expect(cards).toHaveCount(12)
    for (const asset of manifest) {
      const image = page.getByTestId(`booking-card-${asset.id}`).locator('img')
      await image.scrollIntoViewIfNeeded()
      await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth === 512)).toBe(true)
    }
    await page.evaluate(() => scrollTo(0, 0))
    await screenshot(page, `${width}-catalog.png`, true)
    if (width === 390) {
      for (const asset of manifest) {
        const before = glbs.length
        await open(page, asset.id)
        assert(glbs.slice(before).every((value) => value.endsWith(`/${asset.id}.glb`)), 'Unselected model downloaded')
        report.models.push({ id: asset.id, ready: true, onlySelectedGLB: true })
        await page.getByRole('button', { name: 'Закрыть настройку' }).click()
        await expect(page.getByRole('dialog')).toBeHidden()
      }
    }
    await open(page, 'sofa-2-seater')
    const dialog = page.getByRole('dialog')
    if (width === 390) {
      const canvas = dialog.locator('canvas')
      const before = await page.locator('[data-camera-position]').getAttribute('data-camera-position')
      const box = await canvas.boundingBox()
      const cdp = await context.newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * .3, y: box.y + box.height * .45 }] })
      for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * (.3 + .04 * i), y: box.y + box.height * .46 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(250)
      assert(before !== await page.locator('[data-camera-position]').getAttribute('data-camera-position'), 'Touch did not rotate model')
      report.checks.touchRotation = true
      await screenshot(page, '390-3d-viewer.png')
      await dialog.getByRole('button', { name: 'Увеличить количество' }).click()
      await dialog.getByText('Натуральная ткань', { exact: true }).click()
      await dialog.getByText('Сильные', { exact: true }).click()
      await dialog.getByText('Устранение запаха', { exact: true }).click()
      await expect.poll(async () => digits(await page.getByTestId('config-total').innerText())).toBe(28400)
      await dialog.getByRole('button', { name: /^Показать состав расчёта/ }).click()
      await expect(dialog.getByRole('region', { name: 'Состав расчёта' })).toContainText('2 шт.')
      await page.keyboard.press('Escape')
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Примечание к этому предмету' }).click()
      await dialog.getByLabel('Примечание к мебели').fill('Пятно от кофе на подлокотнике')
      await screenshot(page, '390-configuration.png')
    }
    if (width === 1440) {
      const canvas = dialog.locator('canvas')
      const box = await canvas.boundingBox()
      const before = await page.locator('[data-camera-position]').getAttribute('data-camera-position')
      await page.mouse.move(box.x + box.width * .3, box.y + box.height * .5)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * .7, box.y + box.height * .5, { steps: 12 })
      await page.mouse.up()
      await page.waitForTimeout(250)
      assert(before !== await page.locator('[data-camera-position]').getAttribute('data-camera-position'), 'Desktop mouse did not rotate')
      await screenshot(page, '1440-3d-viewer.png')
      report.checks.mouseRotation = true
    }
    await dialog.getByRole('button', { name: /Добавить в заказ/ }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await open(page, 'dining-chair')
    await page.getByRole('button', { name: 'Увеличить количество' }).click()
    await page.getByRole('button', { name: 'Увеличить количество' }).click()
    await page.getByRole('button', { name: /Добавить в заказ/ }).click()
    await open(page, 'ottoman')
    await page.getByRole('button', { name: /Добавить в заказ/ }).click()
    await page.getByRole('button', { name: 'Перейти к заказу' }).click()
    await page.getByRole('button', { name: 'Удалить Пуф', exact: true }).click()
    await expect(page.getByTestId('cart-item-ottoman')).toHaveCount(0)
    if (width === 390) {
      await page.getByRole('button', { name: 'Изменить Двухместный диван', exact: true }).click()
      await page.locator('[data-viewer-state="ready"]').waitFor()
      await page.getByRole('dialog').getByRole('button', { name: 'Уменьшить количество', exact: true }).click()
      await page.getByRole('button', { name: 'Сохранить изменения' }).click()
      await expect.poll(async () => digits(await page.getByTestId('cart-total').innerText())).toBe(20200)
      const sofaLine = page.getByTestId('cart-item-sofa-2-seater')
      await sofaLine.getByRole('button', { name: /^Увеличить количество:/ }).click()
      await expect.poll(async () => digits(await page.getByTestId('cart-total').innerText())).toBe(34400)
      await sofaLine.getByRole('button', { name: /^Уменьшить количество:/ }).click()
      await expect.poll(async () => digits(await page.getByTestId('cart-total').innerText())).toBe(20200)
    } else await expect.poll(async () => digits(await page.getByTestId('cart-total').innerText())).toBe(15000)
    await overflow(page)
    await screenshot(page, `${width}-cart.png`, true)
    if (width === 390) {
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('endquote.demo.basket.chistodom.v1')).length)).toBe(2)
      await page.reload()
      await expect(page.getByRole('heading', { name: 'ЧистоДом', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Перейти к заказу' }).click()
      await expect.poll(async () => digits(await page.getByTestId('cart-total').innerText())).toBe(20200)
      report.checks.basketSurvivesRefresh = true
    }
    await page.getByRole('button', { name: 'Перейти к контактам' }).click()
    if (width === 390) {
      await page.getByRole('button', { name: 'Завтра', exact: true }).click()
      await expect(page.getByLabel('Желаемая дата', { exact: false })).not.toHaveValue('')
      await page.goBack()
      await expect(page.getByRole('heading', { name: 'Ваш заказ', exact: true })).toBeVisible()
      await page.goForward()
      await expect(page.getByRole('button', { name: 'Завтра', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await page.getByLabel('Желаемая дата', { exact: false }).fill('')
    }
    await expect(page.locator('#error-name')).toHaveCount(0)
    await page.getByRole('button', { name: 'Отправить демо-заявку' }).click()
    await expect(page.locator('#error-name')).toBeVisible()
    await expect(page.locator('#error-phone')).toBeVisible()
    await expect(page.locator('#error-address')).toBeVisible()
    await expect(page.locator('#error-date')).toBeVisible()
    await contact(page)
    if (width === 390) {
      const input = page.getByLabel('Фотографии мебели', { exact: true })
      await input.setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not a photograph') })
      await expect(page.getByText('Выберите фотографию в формате JPG, PNG или WebP.')).toBeVisible()
      await input.setInputFiles(path.join(root, 'public/previews/sofa-2-seater.webp'))
      await expect(page.locator('.booking-photo')).toHaveCount(1)
      await expect(page.getByRole('button', { name: 'Отправить демо-заявку' })).toBeEnabled()
    }
    await overflow(page)
    await screenshot(page, `${width}-contact.png`, true)
    await page.getByRole('button', { name: 'Отправить демо-заявку' }).click()
    await expect(page.getByRole('heading', { name: 'Заявка сохранена', exact: true })).toBeVisible()
    await expect(page.getByText(/не отправлена в «ЧистоДом»/)).toBeVisible()
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('endquote.demo.orders.v1')))
    assert(stored.length === 1 && stored[0].demo === true && stored[0].items.length === 2, 'Demo order not persisted correctly')
    assert(stored[0].total === (width === 390 ? 20200 : 15000), 'Persisted quote differs from configuration')
    if (width === 390) assert(stored[0].customer.photos.length === 1, 'Photo not persisted')
    const orderNumber = stored[0].number
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Заявка сохранена', exact: true })).toBeVisible()
    await expect(page.getByText(orderNumber, { exact: true })).toBeVisible()
    await overflow(page)
    await screenshot(page, `${width}-confirmation.png`, true)
    if (width === 390) {
      await page.getByRole('button', { name: 'Вернуться к услугам' }).click()
      await expect(page.getByRole('heading', { name: 'ЧистоДом', exact: true })).toBeVisible()
      assert(!new URL(page.url()).searchParams.has('order'), 'Returning to storefront retained stale order URL')
      await open(page, 'ottoman')
      await page.getByRole('button', { name: /Добавить в заказ/ }).click()
      await page.getByRole('button', { name: /Ваша демо-заявка/ }).click()
      await expect(page.getByRole('heading', { name: 'Заявка сохранена', exact: true })).toBeVisible()
      await page.getByRole('link', { name: 'EndQuote — к услугам ЧистоДом' }).click()
      await page.getByRole('button', { name: 'Перейти к заказу' }).click()
      await expect.poll(async () => digits(await page.getByTestId('cart-total').innerText())).toBe(3000)
      await page.getByRole('button', { name: 'Перейти к контактам' }).click()
      await contact(page, 'Дана')
      await page.getByRole('button', { name: 'Отправить демо-заявку' }).click()
      await expect(page.getByRole('heading', { name: 'Заявка сохранена', exact: true })).toBeVisible()
      await page.getByRole('link', { name: 'EndQuote — к услугам ЧистоДом' }).click()
      await open(page, 'dining-chair')
      await page.getByRole('button', { name: /Добавить в заказ/ }).click()
      await page.getByRole('button', { name: 'Перейти к заказу' }).click()
      await page.getByRole('button', { name: 'Перейти к контактам' }).click()
      await contact(page, 'Дана')
      await page.getByRole('button', { name: 'Отправить демо-заявку' }).click()
      await expect(page.getByRole('heading', { name: 'Заявка сохранена', exact: true })).toBeVisible()
      assert(await page.evaluate(() => JSON.parse(localStorage.getItem('endquote.demo.orders.v1')).length) === 3, 'Repeated storefront booking did not persist')
      report.checks.repeatVisitsAndOrders = { passed: true, existingBasketPreserved: true, consecutiveOrders: 3 }
    }
    assert(writes.length === 0 && outbound.length === 0, 'Prototype made backend/outbound requests')
    assert(errors.length === 0, `Browser errors: ${errors.join('\n')}`)
    report.checks[`flow${width}`] = { passed: true, photos: stored[0].customer.photos.length, total: stored[0].total, orderNumber, noBackendRequests: true, persistedAfterRefresh: true, consoleErrors: errors }
    await context.close()
  }
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'ru-RU' })
  await context.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl' || type === 'webgl2' ? null : original.call(this, type, ...args) } })
  const page = await context.newPage(); currentPage = page
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'ЧистоДом', exact: true })).toBeVisible()
  await open(page, 'sofa-3-seater', true)
  await expect(page.locator('.viewer-fallback img')).toBeVisible()
  await page.getByRole('button', { name: /Добавить в заказ/ }).click()
  await page.getByRole('button', { name: 'Перейти к заказу' }).click()
  await expect(page.getByTestId('cart-total')).toContainText('12')
  report.checks.webglFallbackStillAllowsBooking = true
  await context.close()
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.errors.push(error.stack || String(error))
  if (currentPage && !currentPage.isClosed()) await screenshot(currentPage, 'failure.png', true).catch(() => {})
} finally {
  await browser.close()
  await writeFile(path.join(output, 'e2e-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}
if (report.status !== 'passed') process.exitCode = 1
