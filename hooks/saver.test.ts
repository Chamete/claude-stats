import { test, expect } from 'claude-code/testing'
import { addSample, downgrade, forecast, saverActive, sparkline, SAVER_MODEL, WEEK } from './format'

const now = Date.parse('2026-10-06T10:00:00Z')
const reset = '2026-10-06T12:00:00Z' // la ventana empezó a las 07:00
const min = 60_000

test('predice el 100 % antes del reinicio con un ritmo alto', () => {
  const s = [
    { t: now - 60 * min, pct: 40, resetsAt: reset },
    { t: now, pct: 70, resetsAt: reset },
  ]
  const fc = forecast(s, 70, reset, now)!
  expect(fc.ratePerHour).toBe(30)
  expect(Math.round(fc.etaMs! / min)).toBe(60)
  expect(fc.hitsBeforeReset).toBe(true)
})

test('ritmo bajo: llega después del reinicio; sin datos: undefined', () => {
  const s = [
    { t: now - 60 * min, pct: 40, resetsAt: reset },
    { t: now, pct: 45, resetsAt: reset },
  ]
  expect(forecast(s, 45, reset, now)!.hitsBeforeReset).toBe(false)
  expect(forecast([{ t: now, pct: 45, resetsAt: reset }], 45, reset, now)).toBeUndefined()
  // Lecturas de otra ventana no cuentan.
  expect(forecast([{ t: now - 30 * min, pct: 90, resetsAt: 'x' }, ...s], 45, reset, now)!.ratePerHour).toBe(5)
})

test('el gráfico sube con el uso y deja el futuro punteado', () => {
  const s = [
    { t: Date.parse('2026-10-06T07:30:00Z'), pct: 10, resetsAt: reset },
    { t: Date.parse('2026-10-06T09:30:00Z'), pct: 100, resetsAt: reset },
  ]
  const line = sparkline(s, reset, now, 10)
  expect(line.length).toBe(10)
  expect(line.endsWith('···')).toBe(true)
  expect(line[0]).toBe('▁')
  expect(line[5]).toBe('█')
})

test('modo ahorro: cuándo se activa y qué cambia', () => {
  expect(saverActive('auto', 84)).toBe(false)
  expect(saverActive('auto', 85)).toBe(true)
  expect(saverActive('on', 0)).toBe(true)
  expect(saverActive('off', 99)).toBe(false)
  expect(downgrade('claude-opus-5-5', 'high')).toEqual({ model: SAVER_MODEL, effort: 'medium' })
  expect(downgrade('claude-opus-5-5', undefined)).toEqual({ model: SAVER_MODEL, effort: undefined })
  expect(downgrade('claude-sonnet-5-5', 'low')).toBeUndefined()
  expect(downgrade('claude-sonnet-5-5', 'max')).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' })
})

test('el historial no repite lecturas iguales seguidas', () => {
  const a = addSample([], { t: now, pct: 10, resetsAt: reset })
  const b = addSample(a, { t: now + min, pct: 10, resetsAt: reset })
  const c = addSample(b, { t: now + 2 * min, pct: 11, resetsAt: reset })
  expect(b.length).toBe(1)
  expect(c.length).toBe(2)
})

test('la ventana semanal usa su propio periodo', () => {
  const wreset = '2026-10-09T10:00:00Z' // empezó el 2 de octubre
  const s = [
    { t: now - 24 * 60 * min, pct: 20, resetsAt: wreset },
    { t: now, pct: 30, resetsAt: wreset },
  ]
  const fc = forecast(s, 30, wreset, now, WEEK, 24 * 60 * min)!
  expect(Math.round(fc.ratePerHour * 24)).toBe(10)
  expect(fc.hitsBeforeReset).toBe(false)
  const line = sparkline(s, wreset, now, 7, WEEK)
  expect(line.slice(-2)).toBe('··')
})
