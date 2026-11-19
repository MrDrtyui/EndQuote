export interface FurnitureAsset {
  id: string
  name: string
  category: string
  model: string
  preview: string
  dimensions: { width: number; depth: number; height: number }
  triangle_count: number
  file_size_bytes: number
  material_count: number
  draw_calls: number
  source?: string
  seat_count?: number
}

export const categoryNames: Record<string, string> = {
  sofa: 'Диван',
  armchair: 'Кресло',
  chair: 'Стул',
  ottoman: 'Пуф',
  mattress: 'Матрас',
  headboard: 'Изголовье',
}

export function formatFileSize(bytes: number): string {
  return bytes >= 1_000_000
    ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(bytes / 1_000_000)} МБ`
    : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(bytes / 1_000)} КБ`
}

export function isFurnitureAsset(value: unknown): value is FurnitureAsset {
  if (!value || typeof value !== 'object') return false
  const asset = value as Partial<FurnitureAsset>
  return ['id', 'name', 'category', 'model', 'preview'].every((key) => typeof asset[key as keyof FurnitureAsset] === 'string')
    && ['triangle_count', 'file_size_bytes', 'material_count', 'draw_calls'].every((key) => {
      const number = asset[key as keyof FurnitureAsset]
      return typeof number === 'number' && Number.isFinite(number) && number > 0
    })
    && !!asset.dimensions && ['width', 'depth', 'height'].every((key) => {
      const number = asset.dimensions?.[key as keyof FurnitureAsset['dimensions']]
      return typeof number === 'number' && Number.isFinite(number) && number > 0
    })
}
