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
  | 'git'
  | 'testing'
  | 'proud'

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

/** Lo que gasta una herramienta en la sesión. */
export type ToolStat = {
  name: string
  calls: number
  errors: number
  /** Tokens que el modelo escribió para pedirla (la salida del paso, repartida). */
  outTokens: number
  /** Tokens aproximados que su resultado añadió al contexto. */
  resultTokens: number
  /** Tiempo total ejecutándose. */
  ms: number
}

/** Contadores de la mascota: experiencia y logros, guardados entre sesiones. */
export type Counter = 'turns' | 'tools' | 'agents' | 'commits' | 'tests' | 'pets' | 'saver' | 'errors' | 'web'

export type Progress = { xp: number; counters: Partial<Record<Counter, number>>; unlocked: string[] }

/** El modelo de la sesión, como lo muestra /model. */
export type ModelInfo = { session?: string }

/** Las tarjetas del panel. */
export type CardId = 'five' | 'price' | 'week' | 'tokens' | 'tools' | 'turns' | 'saver' | 'pet'

/** Cómo quiere cada persona su panel: el orden de las tarjetas y las que oculta. */
export type CardLayout = { order: CardId[]; hidden: CardId[] }

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
      toolStats: ToolStat[]
      progress: Progress
      model: ModelInfo
      cards: CardLayout
      isEditing: boolean
    }
  }
}
