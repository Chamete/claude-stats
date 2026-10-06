/** Una lectura de una ventana de límite (5 h o 7 días). */
export type Sample = { t: number; pct: number; resetsAt?: string }

/** auto: se activa al pasar el umbral; on: siempre; off: nunca. */
export type SaverMode = 'auto' | 'on' | 'off'

/** Tokens sumados de las respuestas del modelo en la sesión. */
export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number; requests: number }

/** Un prompt tuyo y cuánto de la ventana de 5 h gastó. */
export type Turn = {
  turnId: string
  text: string
  startedAt: number
  startPct?: number
  endPct?: number
  /** Coste de la sesión en dólares al empezar y al acabar el turno. */
  startCost?: number
  endCost?: number
  tokens: number
  isDone: boolean
}

/** Lo que la mascota está haciendo, según el último evento. */
export type Mood =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'writing'
  | 'running'
  | 'web'
  | 'agent'
  | 'error'
  | 'happy'
  | 'surprised'
  | 'love'

export type Pet = { mood: Mood; detail?: string; since: number }

export type PetConfig = { isEnabled: boolean; name: string }

/**
 * Un paquete de información en camino: la tarea baja al subagente; el
 * progreso y el resultado suben al orquestador. `since` es cuándo sale: los
 * paquetes van en fila y uno puede estar esperando su turno.
 */
export type Packet = { kind: 'task' | 'progress' | 'result'; since: number }

/** Un subagente (o compañero de equipo) y lo que está haciendo. */
export type Worker = {
  id: string
  type: string
  description: string
  mood: Mood
  detail?: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'done' | 'failed'
  tokens: number
  packets: Packet[]
  /** El subagente que lo lanzó; ausente si fue el principal. */
  parentId?: string
}

/** Avisos ya dados, para no repetirlos tras una recarga. */
export type Alerts = { warned: number; wasSaving: boolean; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    consumo: {
      samples: Sample[]
      weekSamples: Sample[]
      mode: SaverMode
      tokens: Tokens
      turns: Turn[]
      pet: Pet
      petConfig: PetConfig
      frame: number
      alerts: Alerts
      workers: Worker[]
      teamFrame: number
    }
  }
}
