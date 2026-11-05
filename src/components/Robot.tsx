import type { AgentStatus } from '../lib/agents'

/** Roboter-Avatar für einen Agenten. Animation zeigt den Status (arbeitet = Augen scannen, Antenne blinkt). */
export function Robot({ status, color, size = 88 }: { status: AgentStatus; color: string; size?: number }) {
  const eye = status === 'fehler' ? '#f87171' : status === 'pausiert' ? '#4b5563' : color
  return (
    <svg className={`robot robot-${status}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`Agent ${status}`}>
      <defs>
        <radialGradient id={`glow-${color.replace('#', '')}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="robot-halo" cx="60" cy="64" r="56" fill={`url(#glow-${color.replace('#', '')})`} />
      <line x1="60" y1="20" x2="60" y2="34" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <circle className="robot-antenna" cx="60" cy="16" r="6" fill={color} />
      <rect x="14" y="56" width="9" height="22" rx="4.5" fill={color} opacity="0.55" />
      <rect x="97" y="56" width="9" height="22" rx="4.5" fill={color} opacity="0.55" />
      <rect x="22" y="34" width="76" height="64" rx="22" fill="#1b202a" stroke={color} strokeWidth="3" />
      <rect x="32" y="48" width="56" height="28" rx="14" fill="#05070b" />
      <g className="robot-eyes">
        <circle cx="48" cy="62" r="6.5" fill={eye} />
        <circle cx="72" cy="62" r="6.5" fill={eye} />
      </g>
      <rect className="robot-mouth" x="47" y="84" width="26" height="4" rx="2" fill={color} opacity="0.7" />
    </svg>
  )
}
