import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateItemPrice, calculateCartTotal, defaultConfiguration, DEMO_PRICING } from '../src/booking/pricing.ts'
import { getDemoOrder, isCalendarDate, localDate, normalizePhone, ORDER_STORAGE_KEY, readDemoOrders, submitDemoOrder, validateCustomer } from '../src/booking/orders.ts'

const memory = new Map()
const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) }
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
const validCustomer = () => ({ name: 'Алия', phone: '+7 (701) 123-45-67', address: 'Алматы, Абая 10, кв. 5', preferredDate: localDate(), comment: '', photos: [] })
const cart = () => [{ id: 'one', configuration: defaultConfiguration('sofa-2-seater') }]

test('base tariffs exist for every one of the 12 furniture categories', () => {
  assert.equal(Object.keys(DEMO_PRICING.basePrices).length, 12)
  for (const [modelId, base] of Object.entries(DEMO_PRICING.basePrices)) assert.equal(calculateItemPrice(defaultConfiguration(modelId)).total, base)
})
test('all surcharges are additive, rounded consistently, and apply per furniture unit', () => {
  const configuration = { ...defaultConfiguration('sofa-2-seater'), quantity: 2, upholstery: 'natural', contamination: 'heavy', extras: ['odor'] }
  const price = calculateItemPrice(configuration)
  assert.deepEqual(price, { base: 9000, upholsterySurcharge: 1400, contaminationSurcharge: 1800, extrasTotal: 2000, unitPrice: 14200, total: 28400 })
  assert.equal(calculateCartTotal([{ id: 'a', configuration }, { id: 'b', configuration: { ...defaultConfiguration('dining-chair'), quantity: 3 } }]), 34400)
})
test('pricing configuration can change without UI changes, extras cannot be double charged', () => {
  const duplicate = { ...defaultConfiguration('armchair'), extras: ['odor', 'odor'] }
  assert.equal(calculateItemPrice(duplicate).extrasTotal, 2000)
  const pricing = { ...DEMO_PRICING, basePrices: { ...DEMO_PRICING.basePrices, armchair: 1000 } }
  assert.equal(calculateItemPrice(defaultConfiguration('armchair'), pricing).total, 1000)
})
test('invalid amounts, model identifiers, options and quantities are rejected', () => {
  for (const quantity of [0, 21, 1.5, NaN, Infinity]) assert.throws(() => calculateItemPrice({ ...defaultConfiguration('armchair'), quantity }))
  assert.throws(() => calculateItemPrice(defaultConfiguration('toString')))
  assert.throws(() => calculateItemPrice({ ...defaultConfiguration('armchair'), extras: ['unknown'] }))
  assert.throws(() => calculateItemPrice({ ...defaultConfiguration('armchair'), upholstery: 'unknown' }))
  assert.throws(() => calculateItemPrice(defaultConfiguration('armchair'), { ...DEMO_PRICING, basePrices: { armchair: NaN } }))
})
test('Kazakhstan phone and date validation handles actual calendar values', () => {
  assert.deepEqual(validateCustomer(validCustomer()), {})
  assert.equal(normalizePhone('8 (701) 123-45-67'), '77011234567')
  assert.equal(isCalendarDate('2027-02-31'), false)
  assert.equal(isCalendarDate('2028-02-29'), true)
  assert.ok(validateCustomer({ ...validCustomer(), phone: '+7 (999) 123-45-67' }).phone)
  assert.ok(validateCustomer({ ...validCustomer(), preferredDate: '2020-01-01' }).preferredDate)
  assert.ok(validateCustomer({ ...validCustomer(), address: 'дом' }).address)
})
test('submitted orders persist with independent snapshots and immutable quote amounts', () => {
  memory.clear()
  const items = cart(), customer = validCustomer()
  const order = submitDemoOrder(customer, items)
  assert.match(order.number, /^EQ-\d{6}-[0-9A-F]{4}$/)
  assert.equal(order.demo, true)
  assert.equal(order.total, 9000)
  assert.equal(order.items[0].quotedTotal, 9000)
  items[0].configuration.quantity = 5
  customer.name = 'Другое имя'
  assert.equal(getDemoOrder(order.id).customer.name, 'Алия')
  assert.equal(getDemoOrder(order.id).items[0].configuration.quantity, 1)
  assert.equal(JSON.parse(storage.getItem(ORDER_STORAGE_KEY)).length, 1)
})
test('corrupt records cannot crash the confirmation screen, past saved dates remain readable', () => {
  memory.clear()
  const order = submitDemoOrder(validCustomer(), cart())
  storage.setItem(ORDER_STORAGE_KEY, JSON.stringify([{ ...order, customer: { ...order.customer, preferredDate: 'invalid' } }, { ...order, customer: { ...order.customer, preferredDate: '2020-01-01' } }, null]))
  assert.equal(readDemoOrders().length, 1)
  storage.setItem(ORDER_STORAGE_KEY, 'broken json')
  assert.deepEqual(readDemoOrders(), [])
})
test('quota failure is surfaced instead of claiming a successful submission', () => {
  memory.clear()
  const original = storage.setItem
  storage.setItem = () => { throw new Error('QuotaExceededError') }
  try { assert.throws(() => submitDemoOrder(validCustomer(), cart()), /Не удалось сохранить/) }
  finally { storage.setItem = original }
  assert.deepEqual(readDemoOrders(), [])
})
