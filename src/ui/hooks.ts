import { useEffect, useRef, useState } from 'react'

/** Run `fn` every animation frame while mounted. */
export function useRaf(fn: () => void) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    let id = 0
    const loop = () => {
      ref.current()
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [])
}

/** Sample a value every frame and re-render at most ~20 times a second. */
export function usePolled<T>(read: () => T, intervalMs = 50): T {
  const [v, setV] = useState(read)
  const readRef = useRef(read)
  readRef.current = read
  useEffect(() => {
    const id = setInterval(() => setV(readRef.current()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return v
}
