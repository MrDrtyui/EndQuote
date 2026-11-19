export type Upholstery = 'standard' | 'natural' | 'delicate'
export type Contamination = 'light' | 'normal' | 'heavy'
export type ExtraService = 'odor' | 'protection' | 'pet-hair'
export interface ItemConfiguration {
  modelId: string
  quantity: number
  upholstery: Upholstery
  contamination: Contamination
  extras: ExtraService[]
  notes: string
}
export interface CartItem {
  id: string
  configuration: ItemConfiguration
  quotedUnitPrice?: number
  quotedTotal?: number
}
export interface PhotoAttachment { id: string; name: string; dataUrl: string; file?:File }
export interface CustomerDetails {
  name: string
  phone: string
  address: string
  preferredDate: string
  comment: string
  photos: PhotoAttachment[]
}
export interface DemoOrder {
  id: string
  number: string
  createdAt: string
  customer: CustomerDetails
  items: CartItem[]
  total: number
  pricingVersion: string
  demo: true
}
