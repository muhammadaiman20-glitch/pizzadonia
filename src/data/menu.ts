export type CategoryId = 'semua' | 'ayam' | 'daging' | 'seafood' | 'premium'

export interface PizzaSize {
  id: string
  label: string
  price: number
}

export interface MenuItem {
  id: string
  name: string
  desc: string
  img: string
  category: Exclude<CategoryId, 'semua'>
  tag?: string
  sizes: PizzaSize[]
  available: boolean
}

export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'semua', label: 'Semua' },
  { id: 'ayam', label: 'Ayam' },
  { id: 'daging', label: 'Daging' },
  { id: 'seafood', label: 'Seafood' },
  { id: 'premium', label: 'Premium' },
]

export const MENU: MenuItem[] = [
  {
    id: 'ayam',
    name: 'Peperoni Ayam',
    desc: 'Pepperoni ayam, sos pizza dan keju mozzarella cair yang melimpah.',
    img: '/pizzas/ayam.jpg',
    category: 'ayam',
    sizes: [
      { id: '8inci', label: '8 inci', price: 21.9 },
      { id: '10inci', label: '10 inci', price: 25.9 },
    ],
    available: true,
  },
  {
    id: 'daging',
    name: 'Peperoni Daging',
    desc: 'Pepperoni daging berempah, sos pizza dan keju cair yang melimpah.',
    img: '/pizzas/daging.jpg',
    category: 'daging',
    tag: 'Paling laris',
    sizes: [
      { id: '8inci', label: '8 inci', price: 21.9 },
      { id: '10inci', label: '10 inci', price: 25.9 },
    ],
    available: true,
  },
  {
    id: 'isi-ketam',
    name: 'Isi Ketam',
    desc: 'Isi ketam, nanas dan keju mozzarella. Manis-masin yang seimbang.',
    img: '/pizzas/isi-ketam.jpg',
    category: 'seafood',
    sizes: [
      { id: '8inci', label: '8 inci', price: 21.9 },
      { id: '10inci', label: '10 inci', price: 25.9 },
    ],
    available: true,
  },
  {
    id: 'meatball',
    name: 'Meatball',
    desc: 'Bebola daging juicy, lada benggala dan keju yang meleleh.',
    img: '/pizzas/meatball.jpg',
    category: 'daging',
    sizes: [
      { id: '8inci', label: '8 inci', price: 25.9 },
      { id: '10inci', label: '10 inci', price: 31.9 },
    ],
    available: true,
  },
  {
    id: 'tuna',
    name: 'Tuna',
    desc: 'Tuna, jagung manis dan cendawan dengan keju cheddar.',
    img: '/pizzas/tuna.jpg',
    category: 'seafood',
    sizes: [
      { id: '8inci', label: '8 inci', price: 25.9 },
      { id: '10inci', label: '10 inci', price: 31.9 },
    ],
    available: true,
  },
  {
    id: 'mix',
    name: 'Mix',
    desc: 'Semua sekali: ayam, daging, isi ketam, cendawan, nanas dan capsicum.',
    img: '/pizzas/mix.jpg',
    category: 'premium',
    tag: 'Untuk yang tak boleh pilih',
    sizes: [
      { id: '8inci', label: '8 inci', price: 25.9 },
      { id: '10inci', label: '10 inci', price: 31.9 },
    ],
    available: true,
  },
  {
    id: 'hawaii-beef',
    name: 'Hawaii Beef',
    desc: 'Daging cincang, nanas, capsicum hijau dan merah. Klasik Hawaii.',
    img: '/pizzas/hawaii-beef.jpg',
    category: 'daging',
    sizes: [
      { id: '8inci', label: '8 inci', price: 25.9 },
      { id: '10inci', label: '10 inci', price: 31.9 },
    ],
    available: true,
  },
  {
    id: 'hawaii-chicken',
    name: 'Hawaii Chicken',
    desc: 'Ayam, nanas, capsicum dan sos istimewa di atas keju.',
    img: '/pizzas/hawaii-chicken.jpg',
    category: 'ayam',
    sizes: [
      { id: '8inci', label: '8 inci', price: 25.9 },
      { id: '10inci', label: '10 inci', price: 31.9 },
    ],
    available: true,
  },
  {
    id: 'udang',
    name: 'Udang Solo A',
    desc: 'Udang besar penuh satu pizza, nanas dan keju. Yang paling premium.',
    img: '/pizzas/udang.jpg',
    category: 'seafood',
    tag: 'Premium',
    sizes: [
      { id: '8inci', label: '8 inci', price: 31.9 },
      { id: '10inci', label: '10 inci', price: 36.9 },
    ],
    available: true,
  },
  {
    id: 'wagyu',
    name: 'Wagyu',
    desc: 'Daging wagyu premium, keju mozzarella dan sos istimewa. Pizza paling mewah kami.',
    img: '/pizzas/daging.jpg',
    category: 'premium',
    tag: 'Paling mewah',
    sizes: [
      { id: '8inci', label: '8 inci', price: 71.9 },
      { id: '10inci', label: '10 inci', price: 76.9 },
    ],
    available: true,
  },
]

export const getPizza = (id: string) => MENU.find((item) => item.id === id)
