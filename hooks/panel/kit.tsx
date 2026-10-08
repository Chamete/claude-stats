import type { EngineInterface, SessionUsage } from 'claude-code'
import type { CardLayout, ModelInfo, Pet, PetConfig, Progress, Sample, SaverMode, ToolStat, Tokens, Turn, Worker } from '../../types'
import { duration, forecast, level, untilReset } from '../format'
import type { Layout } from '../format'

/** Las piezas con las que se dibuja (Box, Text, Button…), según la superficie. */
export type Ui = ReturnType<EngineInterface['ui']['resolve']>

/** Una ventana de límite: la de 5 h o la semanal. */
export type RateLimit = SessionUsage['rateLimits'][number]

/** Todo lo que el panel necesita para dibujarse: lo leído del estado y lo que se puede hacer desde él. */
export type PaneData = {
  ui: Ui
  kit: Kit
  L: Layout
  now: number
  bodyWidth: number
  u: SessionUsage
  five: RateLimit | undefined
  week: RateLimit | undefined
  list: Sample[]
  weekList: Sample[]
  m: SaverMode
  sAt: number
  saving: boolean
  tok: Tokens
  turnList: Turn[]
  ws: Worker[]
  tf: number
  p: Pet
  ts: ToolStat[]
  pr: Progress
  mi: ModelInfo
  layoutCards: CardLayout
  editing: boolean
  pc0: PetConfig
  lastPct: number | undefined
  setMode: (m: SaverMode) => Promise<unknown>
  setCards: (change: (c: CardLayout) => CardLayout) => Promise<unknown>
  setEditing: (isEditing: boolean) => Promise<unknown>
}

export type Kit = ReturnType<typeof makeKit>

/** Las piezas comunes de las tarjetas: el marco, la barra, las cifras, el ritmo y la cabecera. */
export function makeKit(ui: Ui, L: Layout, now: number) {
  const { Box, Text } = ui
  const { inner } = L
  const card = (key: string, title: string, accent: string, ...body: (JSX.Element | false | undefined)[]) => (
    <Box key={key} flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1} width={L.cardWidth}>
      <Text bold color={accent} wrap="truncate">
        {title}
      </Text>
      {body}
    </Box>
  )
  // Por defecto el color dice cuánto queda; donde lleno es bueno, se pasa otro.
  const meter = (pct: number, width: number, color: string = level(pct)) => {
    const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
    return (
      <Box flexDirection="row">
        <Text color={color}>{'█'.repeat(filled)}</Text>
        <Text dimColor>{'░'.repeat(width - filled)}</Text>
      </Box>
    )
  }
  // Las cifras se reparten en filas según el ancho que haya.
  const stats = (items: [string, string][]) => {
    const perRow = Math.max(1, Math.min(items.length, Math.floor(inner / 14)))
    const width = Math.floor(inner / perRow)
    return (
      <Box flexDirection="row" flexWrap="wrap" width={inner}>
        {items.map(([label, value]) => (
          <Box key={label} flexDirection="column" width={width}>
            <Text dimColor wrap="truncate">
              {label}
            </Text>
            <Text bold wrap="truncate">
              {value}
            </Text>
          </Box>
        ))}
      </Box>
    )
  }
  const pace = (f: ReturnType<typeof forecast>, unit: (r: number) => string, quiet: string, waiting = 'Ritmo: reuniendo datos…') =>
    !f ? (
      <Text dimColor>{waiting}</Text>
    ) : f.etaMs === undefined ? (
      <Text color="success">✓ {quiet}</Text>
    ) : (
      <Text color={f.hitsBeforeReset ? 'error' : 'success'}>
        {f.hitsBeforeReset ? '⚠ ' : '✓ '}
        {unit(f.ratePerHour)} → 100% en {duration(f.etaMs)}
        {L.isCompact
          ? ''
          : f.hitsBeforeReset === true
            ? ', antes del reinicio'
            : f.hitsBeforeReset === false
              ? ', después del reinicio'
              : ''}
      </Text>
    )
  const head = (pct: number, resetsAt: string | undefined) => (
    <Box flexDirection="row" justifyContent="space-between" width={inner}>
      <Text bold color={level(pct)}>
        {pct}% usado
      </Text>
      <Text dimColor>↻ {untilReset(resetsAt, now) ?? '?'}</Text>
    </Box>
  )
  return { card, meter, stats, pace, head }
}
