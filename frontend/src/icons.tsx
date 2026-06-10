/* Tracery icons — node-type glyphs + minimal UI glyphs (ported from the inspo). */
import type { ReactNode } from 'react'

const NODE_PATHS: Record<string, ReactNode> = {
  input: (
    <g>
      <path d="M4 12h11" />
      <path d="M11 8l4 4-4 4" />
      <path d="M19 4v16" />
    </g>
  ),
  retrieval: (
    <g>
      <path d="M5 6c0 1.66 3.13 3 7 3s7-1.34 7-3-3.13-3-7-3-7 1.34-7 3z" />
      <path d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6" />
      <path d="M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" />
    </g>
  ),
  prompt: (
    <g>
      <path d="M9 8l-4 4 4 4" />
      <path d="M15 8l4 4-4 4" />
    </g>
  ),
  model: <path d="M12 3l2.1 6.1L20.5 11l-6.4 1.9L12 19l-2.1-6.1L3.5 11l6.4-1.9z" />,
  output: (
    <g>
      <path d="M9 5H5v14h4" />
      <path d="M13 12h8" />
      <path d="M17 8l4 4-4 4" />
    </g>
  ),
  evaluator: (
    <g>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12l2.4 2.4L15.5 9.6" />
    </g>
  ),
  tool: <path d="M14.6 6.3a4 4 0 00-5.45 5.45L3.5 17.4 6.6 20.5l5.65-5.65a4 4 0 005.45-5.45l-2.6 2.6-2.55-2.55z" />,
}

export function Icon({ type, size = 18, stroke = 2 }: { type: string; size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {NODE_PATHS[type] || NODE_PATHS.input}
    </svg>
  )
}

const UI: Record<string, ReactNode> = {
  play: <path d="M6 4l13 8-13 8z" fill="currentColor" stroke="none" />,
  plus: (
    <g>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </g>
  ),
  fit: (
    <g>
      <path d="M4 9V5a1 1 0 011-1h4" />
      <path d="M20 9V5a1 1 0 00-1-1h-4" />
      <path d="M4 15v4a1 1 0 001 1h4" />
      <path d="M20 15v4a1 1 0 01-1 1h-4" />
    </g>
  ),
  undo: (
    <g>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 010 10h-1" />
    </g>
  ),
  check: <path d="M5 12l4.5 4.5L19 7" />,
  warn: (
    <g>
      <path d="M12 8v5" />
      <path d="M12 16.5v.5" />
      <circle cx="12" cy="12" r="9" />
    </g>
  ),
  x: (
    <g>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </g>
  ),
  trash: (
    <g>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
      <path d="M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" />
    </g>
  ),
  info: (
    <g>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8v.5" />
    </g>
  ),
  history: (
    <g>
      <path d="M3 12a9 9 0 109-9 9 9 0 00-7.5 4" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4l3 2" />
    </g>
  ),
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor" stroke="none" />,
  logo: (
    <g>
      <circle cx="5" cy="12" r="2.4" />
      <circle cx="19" cy="6.5" r="2.4" />
      <circle cx="19" cy="17.5" r="2.4" />
      <path d="M7.2 11l9.6-3.6M7.2 13l9.6 3.6" />
    </g>
  ),
  home: (
    <g>
      <path d="M4 11l8-6 8 6" />
      <path d="M6 10v9a1 1 0 001 1h10a1 1 0 001-1v-9" />
    </g>
  ),
  book: (
    <g>
      <path d="M5 4h11a2 2 0 012 2v14H7a2 2 0 01-2-2z" />
      <path d="M5 16h13" />
    </g>
  ),
  layers: (
    <g>
      <path d="M12 4l8 4-8 4-8-4z" />
      <path d="M4 12l8 4 8-4" />
    </g>
  ),
  zoomIn: (
    <g>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21" />
      <path d="M10.5 7.5v6M7.5 10.5h6" />
    </g>
  ),
  zoomOut: (
    <g>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21" />
      <path d="M7.5 10.5h6" />
    </g>
  ),
  tidy: (
    <g>
      <path d="M4 6l3-2 3 2-3 2z" />
      <path d="M14 6l3-2 3 2-3 2z" />
      <path d="M9 16l3-2 3 2-3 2z" />
    </g>
  ),
  flask: (
    <g>
      <path d="M9 3h6" />
      <path d="M10 3v6l-5 9a1.5 1.5 0 001.3 2.2h11.4A1.5 1.5 0 0019 18l-5-9V3" />
      <path d="M7.5 14h9" />
    </g>
  ),
  chatb: <path d="M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1H9l-4 3v-3a1 1 0 01-1-1V6a1 1 0 011-1z" />,
  send: <path d="M4 12l16-7-7 16-2.5-6.5z" />,
  dots: (
    <g>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </g>
  ),
  share: (
    <g>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.2 11l7.6-4M8.2 13l7.6 4" />
    </g>
  ),
  bolt: <path d="M13 2L5 13h6l-1 9 8-12h-6z" fill="currentColor" stroke="none" />,
  caretD: <path d="M6 10l6 6 6-6" />,
  refresh: (
    <g>
      <path d="M20 11a8 8 0 10-2.3 6.3" />
      <path d="M20 4v6h-6" />
    </g>
  ),
  rocket: (
    <g>
      <path d="M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5a2.1 2.1 0 00-2.5-2.5z" />
      <path d="M9 13l-2-2c2-5 6-8 11-8 0 5-3 9-8 11z" />
      <circle cx="14.5" cy="8.5" r="1.4" />
    </g>
  ),
  copy: (
    <g>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 012-2h8" />
    </g>
  ),
}

export function Glyph({ name, size = 16, stroke = 1.7 }: { name: string; size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {UI[name] || null}
    </svg>
  )
}
