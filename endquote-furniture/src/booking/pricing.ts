import type { CartItem, Contamination, ExtraService, ItemConfiguration, Upholstery } from './domain.ts'

export interface PricingConfiguration {
  version: string
  basePrices: Record<string, number>
  upholstery: Record<Upholstery, number>
  contamination: Record<Contamination, number>
  extras: Record<ExtraService, number>
}

/** Example company-owned KZT tariffs. Replace configuration, not UI, for live pricing. */
export const DEMO_PRICING: PricingConfiguration = {
  version: 'chistodom-demo-2026-01',
  basePrices: {
    'sofa-2-seater': 9000, 'sofa-3-seater': 12000, 'sofa-4-seater': 15000,
    'sofa-l-shaped': 17000, 'sofa-u-shaped': 22000, 'sofa-bed': 16000,
    armchair: 5000, 'dining-chair': 2000, ottoman: 3000,
    'mattress-single': 7000, 'mattress-double': 10000, 'upholstered-headboard': 6000,
  },
  upholstery: { standard: 0, natural: 0.15, delicate: 0.25 },
  contamination: { light: 0, normal: 0, heavy: 0.20 },
  extras: { odor: 2000, protection: 2500, 'pet-hair': 1500 },
}

export const UPHOLSTERY_OPTIONS: { value: Upholstery; label: string; description: string }[] = [
  { value: 'standard', label: 'Обычная ткань', description: 'Рогожка, микрофибра, синтетика' },
  { value: 'natural', label: 'Натуральная ткань', description: 'Хлопок, лён, смесовые ткани' },
  { value: 'delicate', label: 'Деликатная ткань', description: 'Велюр, бархат и другие нежные ткани' },
]
export const CONTAMINATION_OPTIONS: { value: Contamination; label: string; description: string }[] = [
  { value: 'light', label: 'Небольшие', description: 'Освежить, убрать пыль' },
  { value: 'normal', label: 'Обычные', description: 'Следы использования, пятна' },
  { value: 'heavy', label: 'Сильные', description: 'Много пятен, въевшаяся грязь' },
]
export const EXTRA_OPTIONS: { value: ExtraService; label: string; description: string }[] = [
  { value: 'odor', label: 'Устранение запаха', description: 'Дополнительная обработка' },
  { value: 'protection', label: 'Защитная обработка', description: 'Обработка ткани после чистки' },
  { value: 'pet-hair', label: 'Удаление шерсти', description: 'Если дома есть питомцы' },
]

const moneyFormatter = new Intl.NumberFormat('ru-KZ', { maximumFractionDigits: 0 })
export const formatMoney = (amount: number) => `${moneyFormatter.format(amount)} ₸`
const roundMoney = (amount: number) => Math.round(amount / 100) * 100

export function calculateItemPrice(configuration: ItemConfiguration, pricing = DEMO_PRICING) {
  const { modelId, quantity, upholstery, contamination, extras } = configuration
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error('Количество должно быть от 1 до 20.')
  if (!Object.hasOwn(pricing.basePrices, modelId)) throw new Error('Для этой мебели пока не настроена цена.')
  if (!Object.hasOwn(pricing.upholstery, upholstery) || !Object.hasOwn(pricing.contamination, contamination)) throw new Error('Проверьте выбранные параметры чистки.')
  if (!Array.isArray(extras) || extras.some((extra) => !Object.hasOwn(pricing.extras, extra))) throw new Error('Проверьте дополнительные услуги.')
  const base = pricing.basePrices[modelId]
  const upholsterySurcharge = roundMoney(base * pricing.upholstery[upholstery])
  const contaminationSurcharge = roundMoney(base * pricing.contamination[contamination])
  const extrasTotal = [...new Set(extras)].reduce((sum, extra) => sum + pricing.extras[extra], 0)
  const unitPrice = base + upholsterySurcharge + contaminationSurcharge + extrasTotal
  if (![base, upholsterySurcharge, contaminationSurcharge, extrasTotal, unitPrice].every((value) => Number.isFinite(value) && value >= 0)) throw new Error('Не удалось рассчитать цену. Проверьте тарифы.')
  return { base, upholsterySurcharge, contaminationSurcharge, extrasTotal, unitPrice, total: unitPrice * quantity }
}

export function calculateCartTotal(items: CartItem[], pricing = DEMO_PRICING) {
  return items.reduce((total, item) => total + calculateItemPrice(item.configuration, pricing).total, 0)
}

export function defaultConfiguration(modelId: string): ItemConfiguration {
  return { modelId, quantity: 1, upholstery: 'standard', contamination: 'normal', extras: [], notes: '' }
}

export function describeConfiguration(configuration: ItemConfiguration) {
  return [UPHOLSTERY_OPTIONS.find((option) => option.value === configuration.upholstery)?.label,
    CONTAMINATION_OPTIONS.find((option) => option.value === configuration.contamination)?.label + ' загрязнения',
    ...EXTRA_OPTIONS.filter((option) => configuration.extras.includes(option.value)).map((option) => option.label)]
    .filter(Boolean).join(' · ')
}
