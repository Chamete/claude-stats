import type { SessionUsage } from 'claude-code'
import type { Sample, SaverMode, Tokens, Turn } from '../types'

const HOUR = 3_600_000
/** Duración de la ventana de 5 h. */
export const FIVE_HOURS = 5 * HOUR
/** Duración de la ventana semanal. */
export const WEEK = 7 * 24 * HOUR

/** Porcentaje de la ventana de 5 h en el que el modo auto empieza a ahorrar. */
export const SAVER_AT = 85
/** Modelo al que se baja en modo ahorro. */
export const SAVER_MODEL = 'claude-sonnet-5-5'

export function bar(pct: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export function duration(ms: number): string {
  if (ms <= 0) return 'ya'
  const mins = Math.ceil(ms / 60_000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}d${h}h`
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m`
}

export function untilReset(resetsAt: string | undefined, now: number): string | undefined {
  if (!resetsAt) return undefined
  const ms = Date.parse(resetsAt) - now
  return Number.isFinite(ms) ? duration(ms) : undefined
}

export function fiveHour(u: Pick<SessionUsage, 'rateLimits'>) {
  return u.rateLimits.find(r => r.kind === 'five_hour')
}

/** El umbral más alto (80, 90, 95) que cruzó la ventana de 5 h, o 0. */
export function threshold(u: Pick<SessionUsage, 'rateLimits'>): number {
  const five = fiveHour(u)
  if (!five) return 0
  return [95, 90, 80].find(t => five.percentUsed >= t) ?? 0
}

/** Añade una lectura; descarta las de hace más de 7 días y repetidas seguidas. */
export function addSample(list: Sample[], s: Sample): Sample[] {
  // Más de 7 días no sirve ni para la ventana semanal.
  const last = list[list.length - 1]
  const kept = list.filter(x => s.t - x.t < 7 * 24 * HOUR)
  if (last && last.pct === s.pct && last.resetsAt === s.resetsAt && s.t - last.t < 5 * 60_000) return kept
  return [...kept, s].slice(-2000)
}

/** Lecturas de la ventana actual (mismo reinicio). */
export function windowSamples(
  list: Sample[],
  resetsAt: string | undefined,
  now: number,
  span = FIVE_HOURS,
): Sample[] {
  const start = resetsAt ? Date.parse(resetsAt) - span : now - span
  return list.filter(s => s.t >= start && (resetsAt === undefined || s.resetsAt === resetsAt))
}

export type Forecast = {
  /** Puntos porcentuales por hora, con el ritmo del periodo reciente. */
  ratePerHour: number
  /** Tiempo hasta el 100 % a ese ritmo; ausente si no sube. */
  etaMs?: number
  /** Si llegaría al 100 % antes de que la ventana se reinicie. */
  hitsBeforeReset?: boolean
}

export function forecast(
  samples: Sample[],
  pct: number,
  resetsAt: string | undefined,
  now: number,
  span = FIVE_HOURS,
  lookback = HOUR,
): Forecast | undefined {
  const recent = windowSamples(samples, resetsAt, now, span).filter(s => now - s.t <= lookback)
  if (recent.length < 2) return undefined
  const first = recent[0]!
  const last = recent[recent.length - 1]!
  const elapsed = last.t - first.t
  if (elapsed < 5 * 60_000) return undefined
  const ratePerHour = Math.max(0, ((last.pct - first.pct) / elapsed) * HOUR)
  if (ratePerHour < 0.1) return { ratePerHour: 0 }
  const etaMs = ((100 - pct) / ratePerHour) * HOUR
  const reset = resetsAt ? Date.parse(resetsAt) : NaN
  return {
    ratePerHour: Math.round(ratePerHour * 10) / 10,
    etaMs,
    hitsBeforeReset: Number.isFinite(reset) ? now + etaMs < reset : undefined,
  }
}

/**
 * Ritmo de la ventana semanal: lo gastado desde que empezó la ventana (siete
 * días antes del reinicio), no las últimas horas, que exageran un día intenso.
 * Antes de un día de ventana aún no dice nada.
 */
export function weekForecast(pct: number, resetsAt: string | undefined, now: number): Forecast | undefined {
  const reset = resetsAt ? Date.parse(resetsAt) : NaN
  if (!Number.isFinite(reset)) return undefined
  const sinceStart = now - (reset - WEEK)
  if (sinceStart < 24 * HOUR) return undefined
  const ratePerHour = pct / (sinceStart / HOUR)
  if (ratePerHour < 0.01) return { ratePerHour: 0 }
  const etaMs = ((100 - pct) / ratePerHour) * HOUR
  return { ratePerHour, etaMs, hitsBeforeReset: now + etaMs < reset }
}

const BLOCKS = ' ▁▂▃▄▅▆▇█'

/** Gráfico de una línea del uso a lo largo de una ventana, hasta ahora. */
export function sparkline(
  samples: Sample[],
  resetsAt: string | undefined,
  now: number,
  width: number,
  span = FIVE_HOURS,
): string {
  const list = windowSamples(samples, resetsAt, now, span)
  const start = resetsAt ? Date.parse(resetsAt) - span : now - span
  const end = resetsAt ? Date.parse(resetsAt) : now
  const step = (end - start) / width
  let out = ''
  let i = 0
  let current: number | undefined
  for (let c = 0; c < width; c++) {
    const colEnd = start + step * (c + 1)
    const colStart = start + step * c
    if (colStart > now) {
      out += '·'
      continue
    }
    for (let s = list[i]; s && s.t <= colEnd; s = list[++i]) current = s.pct
    out += current === undefined ? ' ' : BLOCKS[Math.max(1, Math.min(8, Math.ceil((current / 100) * 8)))]
  }
  return out
}

export function saverActive(mode: SaverMode, pct: number | undefined): boolean {
  return mode === 'on' || (mode === 'auto' && pct !== undefined && pct >= SAVER_AT)
}

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | number

/** Lo que el modo ahorro cambia de una petición, o undefined si ya es ligera. */
export function downgrade(
  model: string,
  effort: Effort | undefined,
): { model: string; effort: Effort | undefined } | undefined {
  const isHeavy = /opus|fable/i.test(model)
  const isEffortHigh = typeof effort === 'number' || effort === 'high' || effort === 'xhigh' || effort === 'max'
  if (!isHeavy && !isEffortHigh) return undefined
  return {
    model: isHeavy ? SAVER_MODEL : model,
    effort: effort === undefined ? undefined : isEffortHigh ? 'medium' : effort,
  }
}

export const NO_TOKENS: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 }

type ApiUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export function addTokens(t: Tokens, u: ApiUsage): Tokens {
  return {
    input: t.input + u.input_tokens,
    output: t.output + u.output_tokens,
    cacheRead: t.cacheRead + u.cache_read_input_tokens,
    cacheWrite: t.cacheWrite + u.cache_creation_input_tokens,
    requests: t.requests + 1,
  }
}

/** Todos los tokens de una respuesta: entrada, caché y salida. */
export function totalTokens(u: ApiUsage): number {
  return u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
}

/** Qué parte de la entrada se sirvió desde la caché, de 0 a 100. */
export function cacheHit(t: Tokens): number {
  const read = t.input + t.cacheRead + t.cacheWrite
  return read === 0 ? 0 : Math.round((t.cacheRead / read) * 100)
}

export function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`
  return String(n)
}

/** Lo que gastó un turno de la ventana de 5 h, como texto ("+3.5%", "…", "?"). */
export function turnCost(t: Turn): string {
  if (!t.isDone) return '…'
  if (t.startPct === undefined || t.endPct === undefined) return '?'
  const d = Math.round((t.endPct - t.startPct) * 10) / 10
  // Si la ventana se reinició a mitad de turno, la resta no tiene sentido.
  return d < 0 ? '↻' : `+${d}%`
}

/** Columnas de una fila de prompt: % (6), precio (7) y tokens (5), cada uno con su espacio. */
export function promptRow(inner: number, isCompact: boolean) {
  // Cada columna solo si cabe dejando sitio al texto.
  const showPrice = !isCompact && inner >= 34
  const showTokens = !isCompact && inner >= 40
  const fixed = 6 + 1 + (showPrice ? 7 + 1 : 0) + (showTokens ? 5 + 1 : 0)
  return { showPrice, showTokens, textWidth: Math.max(4, inner - fixed) }
}

/** Una línea de prompt, sin saltos y cortada a `width` caracteres. */
export function promptLine(text: string, width: number): string {
  const one = text.replace(/\s+/g, ' ').trim() || '(sin texto)'
  return one.length > width ? `${one.slice(0, Math.max(1, width - 1))}…` : one
}

/** Dólares con la precisión que tenga sentido: $0.004, $0.42, $12.30. */
export function money(usd: number): string {
  if (usd === 0) return '$0'
  if (usd < 0.0001) return '<$0.0001'
  if (usd < 0.01) return `$${usd.toFixed(4).replace(/0+$/, '')}`
  return `$${usd.toFixed(2)}`
}

/** Lo que costó un turno, o undefined si aún no hay las dos lecturas. */
export function turnPrice(t: Turn): number | undefined {
  if (t.startCost === undefined || t.endCost === undefined) return undefined
  return Math.max(0, t.endCost - t.startCost)
}

export type PriceForecast = {
  /** Dólares por hora desde que empezó la sesión. */
  perHour?: number
  /** Media por prompt terminado de esta sesión. */
  perPrompt?: number
  /** Lo que costaría la sesión al reiniciarse la ventana de 5 h, a este ritmo. */
  atReset?: number
}

export function priceForecast(
  usd: number,
  startedAt: number,
  now: number,
  resetsAt: string | undefined,
  turns: Turn[],
): PriceForecast {
  const hours = (now - startedAt) / HOUR
  // Con menos de 5 minutos el ritmo por hora no dice nada.
  const perHour = hours >= 5 / 60 && usd > 0 ? usd / hours : undefined
  const prices = turns.map(turnPrice).filter((p): p is number => p !== undefined)
  const perPrompt = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : undefined
  const reset = resetsAt ? Date.parse(resetsAt) : NaN
  const atReset =
    perHour !== undefined && Number.isFinite(reset) && reset > now ? usd + perHour * ((reset - now) / HOUR) : undefined
  return { perHour, perPrompt, atReset }
}

export type Layout = {
  /** Cuántas columnas de tarjetas caben. */
  columns: 1 | 2 | 3
  /** Ancho de cada tarjeta, borde incluido. */
  cardWidth: number
  /** Ancho útil dentro de una tarjeta. */
  inner: number
  /** Pantalla estrecha: menos adornos y textos más cortos. */
  isCompact: boolean
  /** Poca altura: sin gráficos y con menos prompts. */
  isShort: boolean
  /** Cuántos prompts recientes enseñar. */
  promptRows: number
}

/** Cómo repartir el panel según el ancho y el alto disponibles. */
export function layout(width: number, height: number): Layout {
  const columns: Layout['columns'] = width >= 150 ? 3 : width >= 96 ? 2 : 1
  const gap = 1
  const cardWidth = Math.max(24, Math.floor((width - gap * (columns - 1)) / columns))
  const inner = Math.max(16, cardWidth - 4)
  const isCompact = cardWidth < 56
  const isShort = height < (columns === 1 ? 40 : 28)
  const promptRows = Math.max(3, Math.min(10, isShort ? 3 : Math.floor((height - (columns === 1 ? 40 : 20)) / 2) + 4))
  return { columns, cardWidth, inner, isCompact, isShort, promptRows }
}
