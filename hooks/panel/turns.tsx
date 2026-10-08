import { compact, money, promptLine, promptRow, recentPrompts, turnCost, turnPrice } from '../format'
import type { PaneData } from './kit'

/** Últimos prompts: cuánto de la ventana, precio y tokens gastó cada uno. */
export function turnsCard(d: PaneData) {
  const { ui: { Box, Text }, kit: { card }, L, turnList } = d
  const { inner } = L
  const recent = recentPrompts(turnList, L.promptRows)
  const prow = promptRow(inner, L.isCompact)
  return card(
    'turns',
    '💬  Últimos prompts',
    'claude',
    recent.length === 0 && <Text dimColor>Aún no hay prompts en esta sesión.</Text>,
    ...recent.map(t => {
      const delta = (t.endPct ?? 0) - (t.startPct ?? 0)
      const p = turnPrice(t)
      return (
        // Cada columna con su ancho fijo y el texto recortado a lo que queda: nunca salta de línea.
        <Box key={t.turnId} flexDirection="row" width={inner} overflow="hidden">
          <Text bold color={!t.isDone ? 'claude' : delta >= 5 ? 'error' : delta >= 2 ? 'warning' : 'success'}>
            {turnCost(t).padStart(6)}{' '}
          </Text>
          {prow.showPrice && <Text color="warning">{(p === undefined ? '' : money(p)).padStart(7)} </Text>}
          {prow.showTokens && <Text dimColor>{compact(t.tokens).padStart(5)} </Text>}
          <Text wrap="truncate">{promptLine(t.text, prow.textWidth)}</Text>
        </Box>
      )
    }),
  )
}
