import { FIVE_HOURS, forecast, level, sparkline } from '../format'
import type { PaneData } from './kit'

/** Ventana de 5 h: lo gastado, el gráfico y si llegarás al 100 % antes del reinicio. */
export function fiveCard(d: PaneData) {
  const { ui: { Box, Text }, kit: { card, meter, head, pace }, L, now, five, list } = d
  const { inner } = L
  const fc = five && forecast(list, five.percentUsed, five.resetsAt, now)
  return card(
    'five',
    '⏱  Ventana de 5 h',
    five ? level(five.percentUsed) : 'subtle',
    five ? (
      <Box flexDirection="column">
        {head(five.percentUsed, five.resetsAt)}
        {meter(five.percentUsed, inner)}
        {!L.isShort && <Text color="claude">{sparkline(list, five.resetsAt, now, inner, FIVE_HOURS)}</Text>}
        {!L.isShort && !L.isCompact && (
          <Box flexDirection="row" justifyContent="space-between" width={inner}>
            <Text dimColor>inicio</Text>
            <Text dimColor>ahora ··· reinicio</Text>
          </Box>
        )}
        {pace(fc, r => `${r}%/h`, 'Estable en la última hora')}
      </Box>
    ) : (
      <Text dimColor>Sin lectura todavía: aparece tras la primera respuesta.</Text>
    ),
  )
}
