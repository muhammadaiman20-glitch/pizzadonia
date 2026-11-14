import { useCallback, useEffect, useState } from 'react'

export function useHashRoute() {
  const [path, setPath] = useState(() => window.location.hash.replace(/^#/, '') || '/')

  useEffect(() => {
    const onHashChange = () => setPath(window.location.hash.replace(/^#/, '') || '/')
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [path])

  const navigate = useCallback((to: string) => {
    window.location.hash = to.startsWith('#') ? to : `#${to}`
    if ((window.location.hash.replace(/^#/, '') || '/') === to.replace(/^#/, '')) {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
  }, [])

  const scrollToId = useCallback(
    (id: string) => {
      const scroll = () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      const current = window.location.hash.replace(/^#/, '') || '/'
      if (current !== '/') {
        navigate('/')
        window.setTimeout(scroll, 80)
      } else {
        scroll()
      }
    },
    [navigate],
  )

  return { path, navigate, scrollToId }
}
