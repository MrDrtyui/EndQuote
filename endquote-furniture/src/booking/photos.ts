import type { PhotoAttachment } from './domain'

export async function preparePhoto(file: File): Promise<PhotoAttachment> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Выберите фотографию в формате JPG, PNG или WebP.')
  if (file.size > 10_000_000) throw new Error('Фотография слишком большая. Максимум — 10 МБ.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Не удалось подготовить фотографию.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    let dataUrl = canvas.toDataURL('image/jpeg', 0.78)
    if (dataUrl.length > 600_000) dataUrl = canvas.toDataURL('image/jpeg', 0.5)
    if (dataUrl.length > 650_000) throw new Error('Выберите фотографию меньшего размера.')
    return { id: crypto.randomUUID(), name: file.name, dataUrl }
  } catch (error) {
    if (error instanceof Error && /Выберите|подготовить/.test(error.message)) throw error
    throw new Error('Не удалось открыть фотографию. Попробуйте другой файл.')
  } finally { URL.revokeObjectURL(url) }
}
