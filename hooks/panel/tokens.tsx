import { cacheHit, compact } from '../format'
import type { PaneData } from './kit'

/** Tokens de la sesión: entrada, salida, caché y peticiones. */
export function tokenCard(d: PaneData) {
  const { ui: { Box, Text }, kit: { card, stats, meter }, L, u, tok } = d
  const { inner } = L
  return card(
    'tokens',
    '🔢  Tokens',
    'suggestion',
    stats([
      ['Entrada', compact(tok.input)],
      ['Salida', compact(tok.output)],
      ['Caché leída', compact(tok.cacheRead)],
      ['Caché escrita', compact(tok.cacheWrite)],
    ]),
    <Box flexDirection="row" gap={1}>
      <Text dimColor>Caché</Text>
      {meter(cacheHit(tok), Math.max(6, Math.min(20, inner - 12)), cacheHit(tok) >= 70 ? 'success' : 'warning')}
      <Text color={cacheHit(tok) >= 70 ? 'success' : 'warning'}>{cacheHit(tok)}%</Text>
    </Box>,
    <Text dimColor wrap="truncate">
      {tok.requests} peticiones{u.context.percent !== undefined ? ` · contexto ${u.context.percent}%` : ''}
    </Text>,
  )
}
