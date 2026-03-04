import { useEffect, useState, type RefObject } from 'react'

export function useIsVisible(ref: RefObject<HTMLElement | null>): boolean {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]) setIsVisible(entries[0].isIntersecting) },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return isVisible
}
