import { test, expect } from 'claude-code/testing'
import { addTokens, cacheHit, compact, layout, money, NO_TOKENS, priceForecast, promptLine, promptRow, threshold, turnCost, turnPrice, untilReset, weekForecast , modelFamily, modelName } from './format'

const now = Date.parse('2026-10-06T10:00:00Z')

test('umbrales y cuenta atrás', () => {
  expect(threshold({ rateLimits: [{ kind: 'five_hour', percentUsed: 91 }] })).toBe(90)
  expect(threshold({ rateLimits: [{ kind: 'five_hour', percentUsed: 50 }] })).toBe(0)
  expect(untilReset('2026-10-06T12:13:00Z', now)).toBe('2h13m')
  expect(untilReset('2026-10-09T12:00:00Z', now)).toBe('3d2h')
  expect(untilReset('2026-10-06T09:00:00Z', now)).toBe('ya')
})

test('suma tokens y calcula el acierto de caché', () => {
  const u = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 800, cache_creation_input_tokens: 100 }
  const t = addTokens(addTokens(NO_TOKENS, u), u)
  expect(t).toEqual({ input: 200, output: 100, cacheRead: 1600, cacheWrite: 200, requests: 2 })
  expect(cacheHit(t)).toBe(80)
  expect(cacheHit(NO_TOKENS)).toBe(0)
  expect(compact(950)).toBe('950')
  expect(compact(1234)).toBe('1.2k')
  expect(compact(45_600)).toBe('46k')
  expect(compact(2_300_000)).toBe('2.3M')
})

test('coste de cada turno', () => {
  const base = { turnId: 't', text: 'hola', startedAt: now, tokens: 0 }
  expect(turnCost({ ...base, isDone: false, startPct: 10 })).toBe('…')
  expect(turnCost({ ...base, isDone: true, startPct: 10, endPct: 13.5 })).toBe('+3.5%')
  expect(turnCost({ ...base, isDone: true, startPct: 90, endPct: 2 })).toBe('↻')
  expect(turnCost({ ...base, isDone: true, endPct: 2 })).toBe('?')
  expect(promptLine('arregla\n el   bug', 50)).toBe('arregla el bug')
  expect(promptLine('abcdefghij', 5)).toBe('abcd…')
})

test('precio: formato, por turno y proyección', () => {
  expect(money(0)).toBe('$0')
  expect(money(0.0042)).toBe('$0.0042')
  expect(money(0.00001)).toBe('<$0.0001')
  expect(money(0.4)).toBe('$0.40')
  expect(money(12.3)).toBe('$12.30')
  const hour = 3_600_000
  const t = (startCost?: number, endCost?: number) => ({
    turnId: 't', text: '', startedAt: 0, tokens: 0, isDone: true, startCost, endCost,
  })
  expect(turnPrice(t(1, 1.5))).toBe(0.5)
  expect(turnPrice(t(undefined, 1))).toBeUndefined()
  // $2 en 1 h, quedan 2 h para el reinicio → $6.
  const f = priceForecast(2, now - hour, now, new Date(now + 2 * hour).toISOString(), [t(0, 1), t(1, 2)])
  expect(f.perHour).toBe(2)
  expect(f.perPrompt).toBe(1)
  expect(f.atReset).toBe(6)
  // Con dos minutos de sesión aún no hay ritmo.
  expect(priceForecast(0.1, now - 2 * 60_000, now, undefined, []).perHour).toBeUndefined()
})

test('el panel se adapta al ancho y al alto', () => {
  expect(layout(60, 50)).toMatchObject({ columns: 1, isCompact: false, isShort: false })
  expect(layout(44, 50)).toMatchObject({ columns: 1, isCompact: true })
  expect(layout(44, 20)).toMatchObject({ isShort: true, promptRows: 3 })
  expect(layout(110, 40)).toMatchObject({ columns: 2, cardWidth: 54, isCompact: true })
  expect(layout(130, 40)).toMatchObject({ columns: 2, isCompact: false })
  expect(layout(180, 40)).toMatchObject({ columns: 3, cardWidth: 59 })
  for (const w of [30, 60, 99, 120, 200]) expect(layout(w, 40).cardWidth * layout(w, 40).columns).toBeLessThanOrEqual(w)
})

test('ritmo semanal: media de la ventana, no las últimas horas', () => {
  const day = 24 * 3_600_000
  // Tu captura: 7 % usado, reinicio en 5d23h → la ventana empezó hace 1d1h.
  const reset = new Date(now + 5 * day + 23 * 3_600_000).toISOString()
  const f = weekForecast(7, reset, now)!
  expect(Math.round(f.ratePerHour * 24 * 10) / 10).toBe(6.7)
  expect(f.hitsBeforeReset).toBe(false)
  // Menos de un día de ventana: aún no avisa.
  expect(weekForecast(7, new Date(now + 6.5 * day).toISOString(), now)).toBeUndefined()
  // Ritmo alto de verdad: 60 % en 2 días → llega antes del reinicio.
  expect(weekForecast(60, new Date(now + 5 * day).toISOString(), now)!.hitsBeforeReset).toBe(true)
})

test('las filas de prompts caben en su ancho', () => {
  for (const inner of [20, 30, 40, 52, 80])
    for (const isCompact of [true, false]) {
      const r = promptRow(inner, isCompact)
      const used = 7 + (r.showPrice ? 8 : 0) + (r.showTokens ? 6 : 0) + r.textWidth
      expect(used).toBeLessThanOrEqual(Math.max(inner, 7 + 4))
    }
  expect(promptRow(52, false).textWidth).toBe(52 - 21)
  expect(promptRow(30, true)).toMatchObject({ showPrice: false, showTokens: false, textWidth: 23 })
})

test('nombres de modelo legibles', () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5 · 1M')
  expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelName('opus')).toBe('Opus')
  expect(modelName(undefined)).toBe('—')
  expect(modelFamily('claude-fable-5-1')).toBe('fable')
})
