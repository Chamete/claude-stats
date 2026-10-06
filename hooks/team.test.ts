import { test, expect } from 'claude-code/testing'
import {
  PACKET_MS,
  STATS_WIDTH,
  fit,
  rowLayout,
  activePacket,
  elapsed,
  enqueue,
  justArrived,
  orchestratorSaying,
  species,
  spinner,
  visibleWorkers,
  wire,
  wireText,
} from './team'

const now = 1_000_000
const draw = (w: Parameters<typeof wire>[0], at: number, frame = 0, width = 12) => wireText(wire(w, at, frame, width).segments)

test('la tarea baja con su estela y el resultado sube', () => {
  const task = { status: 'running' as const, packets: [{ kind: 'task' as const, since: now }] }
  expect(draw(task, now)).toBe('●──────────▶')
  expect(draw(task, now + PACKET_MS / 2)).toBe('───━━●─────▶')
  expect(draw(task, now + PACKET_MS - 1)).toBe('────────━━●▶')

  const result = { status: 'done' as const, packets: [{ kind: 'result' as const, since: now }] }
  expect(draw(result, now)).toBe('◀──────────■')
  expect(draw(result, now + PACKET_MS / 2)).toBe('◀─────■━━───')
  expect(draw(result, now + PACKET_MS - 1)).toBe('◀■━━────────')
})

test('el cable mide siempre lo mismo, en todos los fotogramas y estados', () => {
  const states = [
    { status: 'running' as const, packets: [] },
    { status: 'running' as const, packets: [{ kind: 'progress' as const, since: now - 500 }] },
    { status: 'done' as const, packets: [] },
    { status: 'failed' as const, packets: [] },
  ]
  for (const width of [6, 10, 12])
    for (const s of states)
      for (let f = 0; f < 40; f++) expect([...draw(s, now, f, width)].length).toBe(width)
})

test('sin paquetes, la información fluye y cambia de sentido', () => {
  const running = { status: 'running' as const, packets: [] }
  const frames = Array.from({ length: 40 }, (_, f) => draw(running, now, f))
  expect(frames.some(t => t.endsWith('▶'))).toBe(true)
  expect(frames.some(t => t.startsWith('◀'))).toBe(true)
  expect(new Set(frames).size).toBeGreaterThan(4) // se mueve
  expect(draw({ status: 'done', packets: [] }, now)).toBe('───────────✓')
  expect(draw({ status: 'failed', packets: [] }, now, 0, 6)).toBe('─────✗')
})

test('los paquetes van en fila: un subagente rápido no pisa su tarea', () => {
  const q = enqueue(enqueue([], 'task', now), 'result', now + 300)
  expect(q.map(p => p.kind)).toEqual(['task', 'result'])
  expect(q[1]!.since).toBe(now + PACKET_MS)
  expect(activePacket(q, now + 400)?.packet.kind).toBe('task')
  expect(activePacket(q, now + PACKET_MS + 10)?.packet.kind).toBe('result')
  expect(justArrived(q, 'task', now + PACKET_MS + 100)).toBe(true)
  expect(justArrived(q, 'result', now + 2 * PACKET_MS + 100)).toBe(true)
  expect(justArrived(q, 'result', now + 2 * PACKET_MS + 5_000)).toBe(false)
})

test('especies, visibilidad y textos', () => {
  expect(species('Explore').label).toBe('Explorador')
  expect(species('Plan').badge).toBe('△')
  expect(species('general-purpose').label).toBe('Ayudante')
  expect(species('mi-plugin:traductor').label).toBe('traductor')
  const base = { type: 'x', description: '', mood: 'thinking' as const, startedAt: 0, tokens: 0, packets: [] }
  const ws = [
    { ...base, id: 'a', status: 'running' as const },
    { ...base, id: 'b', status: 'done' as const, finishedAt: now - 5_000 },
    { ...base, id: 'c', status: 'done' as const, finishedAt: now - 60_000 },
    // Terminó hace rato pero su resultado aún viaja.
    { ...base, id: 'd', status: 'done' as const, finishedAt: now - 60_000, packets: [{ kind: 'result' as const, since: now - 100 }] },
  ]
  expect(visibleWorkers(ws, now).map(w => w.id)).toEqual(['a', 'b', 'd'])
  expect(orchestratorSaying(0)).toBeUndefined()
  expect(orchestratorSaying(3)).toBe('Coordinando a 3 subagentes')
  expect(elapsed(42_000)).toBe('42s')
  expect(elapsed(65 * 60_000)).toBe('1h05m')
  expect(spinner(0)).not.toBe(spinner(1))
})

test('cada fila cabe en su ancho, como los prompts', () => {
  for (const width of [20, 32, 46, 60, 74, 96, 140])
    for (const depth of [0, 1, 3]) {
      const rl = rowLayout(width, depth)
      const used = Math.min(depth, 4) * 2 + 14 + rl.wireWidth + (rl.showStats ? STATS_WIDTH : 0) + rl.textWidth
      expect(used).toBeLessThanOrEqual(Math.max(width, Math.min(depth, 4) * 2 + 14 + rl.wireWidth))
    }
  expect(rowLayout(40, 0)).toMatchObject({ wireWidth: 4, showStats: false, showDescription: false })
  expect(rowLayout(120, 0)).toMatchObject({ wireWidth: 12, showStats: true, showDescription: true })
  expect(fit('Explorador busca useAuth en todo el repo', 12)).toBe('Explorador …')
  expect(fit('corto', 12)).toBe('corto')
  // Insignias de una sola columna.
  for (const t of ['Explore', 'Plan', 'review', 'teammate', 'general-purpose', 'x:y']) expect([...species(t).badge].length).toBe(1)
})
