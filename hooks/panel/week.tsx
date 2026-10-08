import { WEEK, level, sparkline, weekForecast } from '../format'
import type { PaneData } from './kit'

/** Semana: lo gastado de la ventana de 7 días y su ritmo diario. */
export function weekCard(d: PaneData) {
  const { ui: { Box, Text }, kit: { card, meter, head, pace }, L, now, week, weekList } = d
  const { inner } = L
  const weekFc = week && weekForecast(week.percentUsed, week.resetsAt, now)
  return card(
    'week',
    '📅  Semana',
    week ? level(week.percentUsed) : 'subtle',
    week ? (
      <Box flexDirection="column">
        {head(week.percentUsed, week.resetsAt)}
        {meter(week.percentUsed, inner)}
        {!L.isShort && <Text color="suggestion">{sparkline(weekList, week.resetsAt, now, inner, WEEK)}</Text>}
        {pace(weekFc, r => `${Math.round(r * 24 * 10) / 10}%/día`, 'Sin consumo esta semana', 'Ritmo: se calcula tras el primer día de la ventana')}
      </Box>
    ) : (
      <Text dimColor>Sin lectura semanal todavía.</Text>
    ),
  )
}
