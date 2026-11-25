import { useEffect, useState } from 'react'

function read() {
  if (typeof window === 'undefined') {
    return { path: '/', params: new URLSearchParams() }
  }
  const hash = window.location.hash.replace(/^#/, '')
  const raw = hash || window.location.pathname || '/'
  const [path, query = ''] = raw.split('?')
  const searchParams = query ? new URLSearchParams(query) : new URLSearchParams(window.location.search)
  return { path, params: searchParams }
}

export function useRoute() {
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => {
      setRoute(read())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onChange)
    window.addEventListener('popstate', onChange)
    return () => {
      window.removeEventListener('hashchange', onChange)
      window.removeEventListener('popstate', onChange)
    }
  }, [])
  return route
}

export function navigate(to: string) {
  if (typeof window !== 'undefined') {
    window.location.hash = to
  }
}

/** Matches a pattern like `/exit/fee/:id` and returns its params. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean)
  const b = path.split('/').filter(Boolean)
  if (a.length !== b.length) return null
  const out: Record<string, string> = {}
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) {
      try { out[a[i].slice(1)] = decodeURIComponent(b[i]) } catch { return null }
    }
    else if (a[i] !== b[i]) return null
  }
  return out
}
