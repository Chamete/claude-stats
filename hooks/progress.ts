import type { Counter, Progress } from '../types'

export const NO_PROGRESS: Progress = { xp: 0, counters: {}, unlocked: [] }

/** Experiencia que da cada cosa que pasa. */
const XP: Record<Counter, number> = {
  turns: 5,
  tools: 1,
  agents: 3,
  commits: 10,
  tests: 2,
  pets: 2,
  saver: 5,
  errors: 0,
  web: 1,
}

/** Experiencia total para llegar al nivel n: 0, 50, 150, 300, 500… */
export function xpForLevel(n: number): number {
  return 25 * n * (n - 1)
}

export function levelOf(xp: number): number {
  return Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * Math.max(0, xp)) / 25)) / 2))
}

const TITLES = ['Bebé', 'Aprendiz', 'Ayudante', 'Artesano', 'Experto', 'Maestro', 'Sabio', 'Leyenda']

export function title(level: number): string {
  return TITLES[Math.min(level, TITLES.length) - 1]!
}

/** Cuánto lleva del nivel actual al siguiente, de 0 a 100. */
export function levelProgress(xp: number): number {
  const l = levelOf(xp)
  const from = xpForLevel(l)
  return Math.floor(((xp - from) / (xpForLevel(l + 1) - from)) * 100)
}

export type Achievement = { id: string; emoji: string; name: string; hint: string; counter: Counter; goal: number }

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'primer-prompt', emoji: '👋', name: 'Hola', hint: 'Tu primer prompt', counter: 'turns', goal: 1 },
  { id: 'charlatan', emoji: '💬', name: 'Charlatán', hint: '100 prompts', counter: 'turns', goal: 100 },
  { id: 'manitas', emoji: '🔧', name: 'Manitas', hint: '100 herramientas', counter: 'tools', goal: 100 },
  { id: 'incansable', emoji: '⚡', name: 'Incansable', hint: '1000 herramientas', counter: 'tools', goal: 1000 },
  { id: 'refuerzos', emoji: '👥', name: 'Refuerzos', hint: 'Tu primer subagente', counter: 'agents', goal: 1 },
  { id: 'director', emoji: '🎼', name: 'Director', hint: '25 subagentes', counter: 'agents', goal: 25 },
  { id: 'primer-commit', emoji: '📦', name: 'Primer commit', hint: 'Un git commit', counter: 'commits', goal: 1 },
  { id: 'historiador', emoji: '📜', name: 'Historiador', hint: '25 commits', counter: 'commits', goal: 25 },
  { id: 'probador', emoji: '🧪', name: 'Probador', hint: '10 tandas de tests', counter: 'tests', goal: 10 },
  { id: 'explorador', emoji: '🌐', name: 'Explorador', hint: '25 búsquedas web', counter: 'web', goal: 25 },
  { id: 'mimado', emoji: '♥', name: 'Mimado', hint: '20 caricias', counter: 'pets', goal: 20 },
  { id: 'ahorrador', emoji: '🌱', name: 'Ahorrador', hint: 'Activar el modo ahorro', counter: 'saver', goal: 1 },
  { id: 'resiliente', emoji: '🩹', name: 'Resiliente', hint: 'Superar 25 errores', counter: 'errors', goal: 25 },
]

export type Gain = { progress: Progress; levelUp?: number; unlocked: Achievement[] }

/** Suma una vez el contador y su experiencia, y dice si subió de nivel o desbloqueó algo. */
export function gain(p: Progress, counter: Counter): Gain {
  const count = (p.counters[counter] ?? 0) + 1
  const xp = p.xp + XP[counter]
  const unlocked = ACHIEVEMENTS.filter(a => a.counter === counter && count >= a.goal && !p.unlocked.includes(a.id))
  const before = levelOf(p.xp)
  const after = levelOf(xp)
  return {
    progress: { xp, counters: { ...p.counters, [counter]: count }, unlocked: [...p.unlocked, ...unlocked.map(a => a.id)] },
    levelUp: after > before ? after : undefined,
    unlocked,
  }
}

/** El siguiente logro por conseguir: el más cercano en proporción. */
export function nextAchievement(p: Progress): { a: Achievement; count: number } | undefined {
  return ACHIEVEMENTS.filter(a => !p.unlocked.includes(a.id))
    .map(a => ({ a, count: p.counters[a.counter] ?? 0 }))
    .sort((x, y) => y.count / y.a.goal - x.count / x.a.goal)[0]
}

/** Qué cuenta un comando de Bash: commits y tests. */
export function bashKind(command: string): 'commits' | 'tests' | undefined {
  // Un commit de prueba (--dry-run) no deja nada en el historial: no cuenta.
  if (/\bgit\s+(?:-c\s+\S+\s+|-\S+\s+)*commit\b/.test(command) && !/--dry-run\b/.test(command)) return 'commits'
  if (/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|\b(?:jest|vitest|pytest|mocha)\b|\b(?:go|cargo|deno|claude\s+plugin)\s+test\b/.test(command))
    return 'tests'
  return undefined
}
