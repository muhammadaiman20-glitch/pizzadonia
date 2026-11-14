import { useCallback, useEffect, useState } from 'react'
import type { CartLine } from '../types'

const CART_KEY = 'pizzadonia.cart.v1'

function loadCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CartLine[]) : []
  } catch {
    return []
  }
}

export function useCart() {
  const [lines, setLines] = useState<CartLine[]>(loadCart)

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(lines))
  }, [lines])

  const add = useCallback((itemId: string, sizeId: string) => {
    const key = `${itemId}:${sizeId}`
    setLines((prev) => {
      const existing = prev.find((line) => line.key === key)
      if (existing) {
        return prev.map((line) => (line.key === key ? { ...line, qty: line.qty + 1 } : line))
      }
      return [...prev, { key, itemId, sizeId, qty: 1 }]
    })
  }, [])

  const setQty = useCallback((key: string, qty: number) => {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((line) => line.key !== key)
        : prev.map((line) => (line.key === key ? { ...line, qty } : line)),
    )
  }, [])

  const remove = useCallback((key: string) => {
    setLines((prev) => prev.filter((line) => line.key !== key))
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const count = lines.reduce((sum, line) => sum + line.qty, 0)

  return { lines, add, setQty, remove, clear, count }
}
