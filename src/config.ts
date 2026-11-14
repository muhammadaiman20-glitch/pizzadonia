/**
 * Pizzadonia — tetapan utama kedai.
 * Tukar `whatsapp` di sini sebelum guna untuk bisnes sebenar.
 *
 * PIN penjual sengaja tiada di sini: ia disimpan sebagai secret pelayan
 * (`wrangler secret put ADMIN_PIN`) dan disemak oleh Worker.
 */
export const SHOP = {
  name: 'Pizzadonia',
  tagline: 'Pizza bakar segar. Hangat sampai pintu.',
  /** Nombor WhatsApp format antarabangsa tanpa "+" atau sengkang. */
  whatsapp: '601162260552',
  hours: 'Setiap hari · 11:00 pagi – 11:00 malam',
  area: 'Penghantaran dalam 15 km',
  delivery: {
    fee: 3,
    freeAbove: 60,
    maxKm: 15,
  },
  payment: {
    /** Payload QR DuitNow asal penjual (decode dari QR bank). Jumlah dimasukkan manual oleh pelanggan. */
    duitnowQr:
      '00020201021126420014A00000061500010106629287021085969082905204000053034585802MY5924MUHAMMAD AIMAN BIN YAHYA6002MY6304589E',
    merchant: 'Muhammad Aiman bin Yahya',
  },
} as const

export const STATUS_FLOW = ['baru', 'diterima', 'dibakar', 'siap', 'selesai'] as const

export const STATUS_META = {
  baru: { label: 'Baru', short: 'Baru', tone: 'tomato', next: 'diterima' },
  diterima: { label: 'Diterima', short: 'Diterima', tone: 'crust', next: 'dibakar' },
  dibakar: { label: 'Sedang Dibakar', short: 'Dibakar', tone: 'cheese', next: 'siap' },
  siap: { label: 'Sedia', short: 'Sedia', tone: 'basil', next: 'selesai' },
  selesai: { label: 'Selesai', short: 'Selesai', tone: 'ink', next: null },
  batal: { label: 'Dibatalkan', short: 'Batal', tone: 'muted', next: null },
} as const

export type OrderStatus = keyof typeof STATUS_META
