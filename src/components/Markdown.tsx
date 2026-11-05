// Sicherer Mini-Markdown-Renderer (ohne HTML-Einfügen): Überschriften, Listen,
// Tabellen, Absätze, **fett**, `Code` und Links (nur http/https).
// Agenten-Reports enthalten Text aus dem Web – deshalb wird nichts als HTML interpretiert.

import type { ReactNode } from 'react'

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s)]+)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    const key = `${keyBase}-${i++}`
    if (tok.startsWith('**')) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) out.push(<code key={key}>{tok.slice(1, -1)}</code>)
    else if (tok.startsWith('[')) {
      const label = tok.slice(1, tok.indexOf(']'))
      out.push(
        <a key={key} href={m[2]} target="_blank" rel="noopener noreferrer">
          {label}
        </a>,
      )
    } else
      out.push(
        <a key={key} href={tok} target="_blank" rel="noopener noreferrer">
          {tok.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}
        </a>,
      )
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let k = 0
  while (i < lines.length) {
    const line = lines[i]
    const t = line.trim()
    if (!t) {
      i++
      continue
    }
    const h = t.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      const content = inline(h[2], `h${k}`)
      blocks.push(level <= 2 ? <h4 key={k++}>{content}</h4> : <h5 key={k++}>{content}</h5>)
      i++
      continue
    }
    if (/^[-*•]\s+/.test(t)) {
      const items: ReactNode[] = []
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(<li key={i}>{inline(lines[i].trim().replace(/^[-*•]\s+/, ''), `li${i}`)}</li>)
        i++
      }
      blocks.push(<ul key={k++}>{items}</ul>)
      continue
    }
    if (/^\d+[.)]\s+/.test(t)) {
      const items: ReactNode[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(<li key={i}>{inline(lines[i].trim().replace(/^\d+[.)]\s+/, ''), `ol${i}`)}</li>)
        i++
      }
      blocks.push(<ol key={k++}>{items}</ol>)
      continue
    }
    if (t.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells)
        i++
      }
      const [head, ...body] = rows
      blocks.push(
        <div className="md-table" key={k++}>
          <table>
            {head && (
              <thead>
                <tr>
                  {head.map((c, j) => (
                    <th key={j}>{inline(c, `th${k}${j}`)}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j}>{inline(c, `td${k}${ri}${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    // Absatz: aufeinanderfolgende normale Zeilen
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|[-*•]\s|\d+[.)]\s|\|)/.test(lines[i].trim())) {
      para.push(lines[i].trim())
      i++
    }
    blocks.push(<p key={k++}>{inline(para.join(' '), `p${k}`)}</p>)
  }
  return <div className="md">{blocks}</div>
}
