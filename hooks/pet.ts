import type { Mood, Pet } from '../types'
import { bashKind } from './progress'

/** Lo que la mascota muestra: el estado guardado más el tiempo y la ventana. */
export type Look = Mood | 'sleeping' | 'tired'

const TRANSIENT: readonly Mood[] = ['error', 'happy', 'surprised', 'love', 'proud']
const TRANSIENT_MS = 8_000
const SLEEP_MS = 5 * 60_000

export function look(pet: Pet, now: number, pct: number | undefined): Look {
  const isExpired = TRANSIENT.includes(pet.mood) && now - pet.since > TRANSIENT_MS
  const mood = isExpired ? 'idle' : pet.mood
  if (mood !== 'idle') return mood
  const idleSince = isExpired ? pet.since + TRANSIENT_MS : pet.since
  if (now - idleSince > SLEEP_MS) return 'sleeping'
  if (pct !== undefined && pct >= 80) return 'tired'
  return 'idle'
}

/** Caras de tres columnas, una por fotograma. */
const FACES: Record<Look, readonly string[]> = {
  idle: ['•ᴗ•', '•ᴗ•', '•ᴗ•', '•ᴗ•', '-ᴗ-'],
  thinking: ['o.o', 'o.O', 'O.o', 'o.o'],
  reading: ['◔_◔', '◕_◕'],
  writing: ['¬ᴗ¬', '¬‿¬'],
  running: ['ò_ó', '>_<'],
  web: ['⊙_⊙', '⊙.⊙'],
  agent: ['^o^', '^O^'],
  error: ['T_T', 'T.T'],
  happy: ['^ᴗ^', '^▽^'],
  surprised: ['O_O', 'o_O'],
  love: ['♥ᴗ♥', '♡ᴗ♡'],
  git: ['ᵔᴗᵔ', '•ᴗ•'],
  testing: ['°_°', '°.°'],
  proud: ['*ᴗ*', 'ˆᴗˆ'],
  sleeping: ['-_-', '-_-'],
  tired: ['=_=', '=.='],
}

export function face(l: Look, frame: number): string {
  const list = FACES[l]
  return list[frame % list.length]!
}

/** Lo que lleva al lado: una pista visual de la actividad. */
const PROPS: Record<Look, readonly string[]> = {
  idle: [' ', ' '],
  thinking: ['?', ' ', '?', '!'],
  reading: ['📖', '📖'],
  writing: ['✎', '✐'],
  running: ['⚙', '⚙'],
  web: ['🌐', '🌐'],
  agent: ['👥', '👥'],
  error: ['💧', ' '],
  happy: ['✨', '⭐'],
  surprised: ['!', '!!'],
  love: ['♥', '♡'],
  git: ['📦', '🌿'],
  testing: ['🧪', '⚗'],
  proud: ['🏆', '🎉'],
  sleeping: ['z', 'zZ', 'zZz'],
  tired: ['💦', ' '],
}

export function prop(l: Look, frame: number): string {
  const list = PROPS[l]
  return list[frame % list.length]!
}

export function isAnimated(l: Look): boolean {
  return l !== 'idle' && l !== 'tired'
}

/** Color del tema para cada estado. */
export function moodColor(l: Look): 'claude' | 'suggestion' | 'success' | 'error' | 'warning' | 'subtle' | 'remember' {
  switch (l) {
    case 'error':
      return 'error'
    case 'happy':
    case 'love':
    case 'proud':
      return 'success'
    case 'tired':
    case 'surprised':
      return 'warning'
    case 'sleeping':
      return 'subtle'
    case 'reading':
    case 'web':
      return 'suggestion'
    case 'agent':
    case 'git':
      return 'remember'
    case 'testing':
      return 'suggestion'
    default:
      return 'claude'
  }
}

const SAYINGS: Record<Look, readonly string[]> = {
  idle: ['¡Aquí estoy!', '¿Qué hacemos?', 'Listo cuando quieras'],
  thinking: ['Pensando…', 'Dándole vueltas…', 'Hmm…'],
  reading: ['Leyendo'],
  writing: ['Escribiendo'],
  running: ['Ejecutando'],
  web: ['Buscando en la web…'],
  agent: ['Llamando a refuerzos…'],
  error: ['¡Ay! Algo falló', 'Uy… eso no salió'],
  happy: ['¡Listo!', '¡Hecho!', '¡Terminado!'],
  surprised: ['¿Me has parado?', '¡Ups, interrumpido!'],
  love: ['¡Gracias! ♥', '¡Qué gusto!'],
  git: ['Guardando en git:'],
  testing: ['Pasando tests:'],
  proud: ['¡Subí de nivel!'],
  sleeping: ['Zzz…'],
  tired: ['Estoy cansado… queda poca ventana'],
}

/** La frase de la mascota; `seed` la mantiene fija mientras dura el estado. */
export function saying(l: Look, detail: string | undefined, seed: number): string {
  const list = SAYINGS[l]
  const base = list[Math.abs(Math.floor(seed / 1000)) % list.length]!
  if (l === 'proud' && detail) return detail
  return detail && (l === 'reading' || l === 'writing' || l === 'running' || l === 'git' || l === 'testing') ? `${base} ${detail}` : base
}

/** Qué hace la mascota con cada herramienta, y el detalle que enseña. */
export function moodForTool(tool: string, input: Record<string, unknown>): { mood: Mood; detail?: string } {
  const file = typeof input.file_path === 'string' ? input.file_path.split('/').pop() : undefined
  const pattern = typeof input.pattern === 'string' ? input.pattern : undefined
  switch (tool) {
    case 'Read':
      return { mood: 'reading', detail: file }
    case 'Grep':
    case 'Glob':
      return { mood: 'reading', detail: pattern ? `«${short(pattern, 24)}»` : undefined }
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return { mood: 'writing', detail: file }
    case 'Bash': {
      const command = typeof input.command === 'string' ? input.command : ''
      const kind = bashKind(command)
      return {
        mood: kind === 'commits' ? 'git' : kind === 'tests' ? 'testing' : 'running',
        detail: command ? short(command, 32) : undefined,
      }
    }
    case 'WebFetch':
    case 'WebSearch':
      return { mood: 'web' }
    case 'Agent':
    case 'Task':
      return { mood: 'agent' }
    default:
      return { mood: 'thinking' }
  }
}

function short(s: string, n: number): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? `${one.slice(0, n - 1)}…` : one
}
