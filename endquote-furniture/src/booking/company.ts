export interface BusinessProfile {
  slug: string
  name: string
  initials: string
  tagline: string
  description: string
  city: string
  area: string
  phone: string
  phoneHref: string
  messengerHref: string
  socialLinks: { kind: 'instagram' | 'tiktok'; label: string; href: string }[]
  demo: boolean
}

/** Fictional public storefront. Replace profile data without changing components. */
export const DEMO_COMPANY: BusinessProfile = {
  slug: 'chistodom', name: 'ЧистоДом', initials: 'ЧД',
  tagline: 'Бережная химчистка мебели на дому',
  description: 'Химчистка диванов, кресел и матрасов на дому. Выбирайте услуги, смотрите цены и собирайте заказ.',
  city: 'Алматы', area: 'Выезд по городу и ближайшим районам',
  phone: '+7 (700) 000-00-00', phoneHref: 'tel:+77000000000',
  messengerHref: 'https://www.whatsapp.com/',
  socialLinks: [
    { kind: 'instagram', label: 'Инстаграм', href: 'https://www.instagram.com/' },
    { kind: 'tiktok', label: 'ТикТок', href: 'https://www.tiktok.com/' },
  ],
  demo: true,
}
