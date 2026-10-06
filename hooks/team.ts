import type { Packet, Worker } from '../types'

/** Cuánto tarda un paquete en recorrer el cable. */
export const PACKET_MS = 1_800
/** Cuánto dura la reacción al recibir un paquete. */
export const CATCH_MS = 1_200
/** Cuánto sigue visible un subagente después de su último paquete. */
export const LINGER_MS = 20_000

type Species = { badge: string; label: string; color: 'suggestion' | 'remember' | 'warning' | 'claude' | 'success' }

/**
 * Cada tipo de subagente tiene su propia "especie": insignia, nombre y color.
 * Las insignias ocupan una sola columna (un emoji ocupa dos y descuadra la fila).
 */
export function species(type: string): Species {
  const t = type.toLowerCase()
  if (t.includes('explore')) return { badge: '◎', label: 'Explorador', color: 'suggestion' }
  if (t.includes('plan')) return { badge: '△', label: 'Planificador', color: 'remember' }
  if (t.includes('review') || t.includes('verif')) return { badge: '◇', label: 'Revisor', color: 'warning' }
  if (t.includes('teammate')) return { badge: '◈', label: 'Compañero', color: 'success' }
  if (t.includes('general') || t === '') return { badge: '✦', label: 'Ayudante', color: 'claude' }
  return { badge: '▣', label: type.split(':').pop() ?? type, color: 'claude' }
}

/** Mete un paquete en la fila: sale cuando el anterior ha llegado. */
export function enqueue(packets: readonly Packet[], kind: Packet['kind'], now: number): Packet[] {
  const pending = packets.filter(p => p.since + PACKET_MS > now)
  const last = pending[pending.length - 1]
  const since = last ? Math.max(now, last.since + PACKET_MS) : now
  return [...pending, { kind, since }].slice(-4)
}

/** El paquete que está en el cable ahora y por dónde va (0 a 1). */
export function activePacket(packets: readonly Packet[] | undefined, now: number) {
  for (const p of packets ?? []) {
    if (now >= p.since && now < p.since + PACKET_MS) return { packet: p, progress: (now - p.since) / PACKET_MS }
  }
  return undefined
}

/** Si quedan paquetes por salir o en camino. */
export function isBusy(packets: readonly Packet[] | undefined, now: number): boolean {
  return (packets ?? []).some(p => p.since + PACKET_MS > now)
}

/** Si un paquete de ese tipo acaba de llegar a su destino. */
export function justArrived(packets: readonly Packet[] | undefined, kind: Packet['kind'], now: number): boolean {
  return (packets ?? []).some(p => p.kind === kind && now >= p.since + PACKET_MS && now < p.since + PACKET_MS + CATCH_MS)
}

/** Los subagentes que se enseñan: trabajando, con paquetes en camino o recién terminados. */
export function visibleWorkers(workers: readonly Worker[], now: number): Worker[] {
  return workers.filter(w => {
    if (w.status === 'running' || isBusy(w.packets, now)) return true
    const lastArrival = Math.max(w.finishedAt ?? now, ...(w.packets ?? []).map(p => p.since + PACKET_MS))
    return now - lastArrival < LINGER_MS
  })
}

/** Un trozo del cable y cómo pintarlo. */
export type Segment = { text: string; style: 'line' | 'trail' | 'glyph' | 'flow' | 'end' }

/** El cable entero, para medirlo o leerlo en los tests. */
export const wireText = (segments: readonly Segment[]): string => segments.map(s => s.text).join('')

const GLYPHS: Record<Packet['kind'], string> = { task: '●', progress: '◆', result: '■' }
const TRAIL = 2

/**
 * El cable de `width` columnas entre el orquestador (izquierda) y un subagente
 * (derecha). La tarea viaja hacia el subagente con su estela detrás; el
 * progreso y el resultado vuelven. Mientras trabaja sin paquetes, un flujo de
 * puntos cambia de sentido cada pocos segundos: se están pasando información.
 */
export function wire(
  w: Pick<Worker, 'status' | 'packets'>,
  now: number,
  frame: number,
  width: number,
): { segments: Segment[]; kind: Packet['kind'] | 'flow' | 'none' } {
  const n = Math.max(4, width)
  const body = n - 1
  const active = activePacket(w.packets, now)
  if (active) {
    const { packet, progress } = active
    const toWorker = packet.kind === 'task'
    const travel = Math.min(body - 1, Math.floor(progress * body))
    const pos = toWorker ? travel : body - 1 - travel
    const trailStart = toWorker ? Math.max(0, pos - TRAIL) : pos + 1
    const trailEnd = toWorker ? pos : Math.min(body, pos + 1 + TRAIL)
    const glyphFirst = !toWorker
    const pre = '─'.repeat(glyphFirst ? pos : trailStart)
    const trail = '━'.repeat(trailEnd - trailStart)
    const post = '─'.repeat(body - (glyphFirst ? trailEnd : pos + 1))
    const segments: Segment[] = toWorker
      ? [
          { text: pre, style: 'line' },
          { text: trail, style: 'trail' },
          { text: GLYPHS[packet.kind], style: 'glyph' },
          { text: post, style: 'line' },
          { text: '▶', style: 'end' },
        ]
      : [
          { text: '◀', style: 'end' },
          { text: pre, style: 'line' },
          { text: GLYPHS[packet.kind], style: 'glyph' },
          { text: trail, style: 'trail' },
          { text: post, style: 'line' },
        ]
    // El cable siempre mide lo mismo: el extremo sin flecha se rellena.
    const text = wireText(segments)
    if (text.length < n) segments.push({ text: '─'.repeat(n - text.length), style: 'line' })
    return { segments, kind: packet.kind }
  }
  if (w.status === 'running') {
    // Cada ~2,4 s cambia el sentido: pregunta y respuesta.
    const isDown = Math.floor(frame / 16) % 2 === 0
    const shift = Math.floor(frame / 2)
    let text = ''
    for (let i = 0; i < body; i++) {
      const phase = isDown ? i - shift : i + shift
      text += ((phase % 4) + 4) % 4 === 0 ? '·' : '─'
    }
    return {
      segments: isDown
        ? [
            { text, style: 'flow' },
            { text: '▶', style: 'end' },
          ]
        : [
            { text: '◀', style: 'end' },
            { text, style: 'flow' },
          ],
      kind: 'flow',
    }
  }
  return {
    segments: [
      { text: '─'.repeat(body), style: 'line' },
      { text: w.status === 'failed' ? '✗' : '✓', style: 'end' },
    ],
    kind: 'none',
  }
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/** Un indicador que gira mientras el subagente trabaja. */
export function spinner(frame: number): string {
  return SPINNER[frame % SPINNER.length]!
}

/** Cuánto lleva trabajando, corto: 12s, 3m, 1h05m. */
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

/** Lo que dice el orquestador mientras coordina. */
export function orchestratorSaying(running: number): string | undefined {
  if (running === 0) return undefined
  return running === 1 ? 'Coordinando a 1 subagente' : `Coordinando a ${running} subagentes`
}

/** Columnas fijas de una fila: conector (3), espacio, cara (5), espacio, spinner, espacio, insignia, espacio. */
const ROW_FIXED = 3 + 1 + 5 + 1 + 1 + 1 + 1 + 1
/** Columnas de las cifras: " 12k · 1m05s". */
export const STATS_WIDTH = 14

export type RowLayout = {
  /** Largo del cable. */
  wireWidth: number
  /** Si caben los tokens y el tiempo. */
  showStats: boolean
  /** Si cabe la descripción de la tarea. */
  showDescription: boolean
  /** Columnas para el nombre y la frase. */
  textWidth: number
}

/** Cómo repartir una fila de `width` columnas: nada salta de línea. */
export function rowLayout(width: number, depth: number): RowLayout {
  const wireWidth = width >= 90 ? 12 : width >= 64 ? 9 : width >= 46 ? 6 : 4
  const showStats = width >= 74
  const indent = Math.min(depth, 4) * 2
  const textWidth = Math.max(0, width - indent - ROW_FIXED - wireWidth - (showStats ? STATS_WIDTH : 0))
  return { wireWidth, showStats, showDescription: textWidth >= 40, textWidth }
}

/** Recorta a `n` columnas con "…". */
export function fit(text: string, n: number): string {
  const one = text.replace(/\s+/g, ' ').trim()
  if (n <= 0) return ''
  return one.length > n ? `${one.slice(0, Math.max(0, n - 1))}…` : one
}
