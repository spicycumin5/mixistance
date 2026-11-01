import { Fragment } from 'react'

/** Tiny renderer for lesson/coach text: paragraphs, "- " bullets, **bold**. No HTML injection. */
export function Markdownish({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
    )
  const blocks = text.trim().split(/\n\s*\n/)
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return (
            <ul key={i} className="mb-2 list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*] /, ''))}</li>)}
            </ul>
          )
        }
        return <p key={i}>{inline(b.replace(/^#+\s*/, ''))}</p>
      })}
    </>
  )
}
