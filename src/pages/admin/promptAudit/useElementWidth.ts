import { useLayoutEffect, useRef, useState } from 'react'

/**
 * The width of the element given the returned ref, kept current; null until it is measured.
 * The measuring starts once, so that element has to be rendered from the first render on.
 */
export function useElementWidth() {
  const ref = useRef<HTMLElement>(null)
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    setWidth(node.clientWidth)
    const observer = new ResizeObserver(() => setWidth(node.clientWidth))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}
