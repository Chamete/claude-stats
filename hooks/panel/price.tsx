import { duration, money, priceForecast, turnPrice } from '../format'
import type { PaneData } from './kit'

/** Precio de la sesión, a precios de API: total, por hora, por prompt y proyección. */
export function priceCard(d: PaneData) {
  const { ui: { Box, Text }, kit: { card, stats }, L, now, u, five, turnList } = d
  const { inner } = L
  const usd = u.cost?.usd
  const price = usd === undefined ? undefined : priceForecast(usd, u.startedAt, now, five?.resetsAt, turnList)
  const lastPrice = [...turnList].reverse().map(turnPrice).find(p => p !== undefined)
  return card(
    'price',
    '💲  Precio de la sesión',
    'warning',
    usd === undefined ? (
      <Text dimColor>Este entorno no lleva la cuenta del coste.</Text>
    ) : (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" width={inner}>
          <Text bold color="warning">
            {money(usd)}
          </Text>
          <Text dimColor>en {duration(now - u.startedAt)}</Text>
        </Box>
        {stats([
          ['Por hora', price?.perHour === undefined ? '—' : money(price.perHour)],
          ['Por prompt', price?.perPrompt === undefined ? '—' : money(price.perPrompt)],
          ['Último', lastPrice === undefined ? '—' : money(lastPrice)],
        ])}
        {price?.atReset !== undefined && (
          <Text color="warning">
            ≈ {money(price.atReset)} al reiniciarse la ventana{L.isCompact ? '' : ', a este ritmo'}
          </Text>
        )}
        <Text dimColor>
          {L.isCompact ? 'Equivalente a precios de API' : 'Equivalente a precios de API: con tu suscripción no lo pagas aparte.'}
        </Text>
      </Box>
    ),
  )
}
