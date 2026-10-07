import { test, expect } from 'claude-code/testing'
import { face, look, moodColor, moodForTool, prop, saying } from './pet'

const now = 1_000_000_000

test('estados que caducan, sueño y cansancio', () => {
  expect(look({ mood: 'happy', since: now - 2_000 }, now, 10)).toBe('happy')
  expect(look({ mood: 'happy', since: now - 9_000 }, now, 10)).toBe('idle')
  expect(look({ mood: 'idle', since: now - 6 * 60_000 }, now, 10)).toBe('sleeping')
  expect(look({ mood: 'idle', since: now }, now, 85)).toBe('tired')
  // Trabajando nunca se duerme ni se cansa.
  expect(look({ mood: 'running', since: now - 60 * 60_000 }, now, 95)).toBe('running')
})

test('reacciona a cada herramienta', () => {
  expect(moodForTool('Read', { file_path: '/a/b/format.ts' })).toEqual({ mood: 'reading', detail: 'format.ts' })
  expect(moodForTool('Edit', { file_path: '/x/register.tsx' })).toEqual({ mood: 'writing', detail: 'register.tsx' })
  expect(moodForTool('Bash', { command: 'npm   run build' })).toEqual({ mood: 'running', detail: 'npm run build' })
  expect(moodForTool('WebSearch', {}).mood).toBe('web')
  expect(moodForTool('Agent', {}).mood).toBe('agent')
  expect(moodForTool('mcp__x__y', {}).mood).toBe('thinking')
})

test('caras, accesorios, colores y frases', () => {
  expect(face('idle', 4)).toBe('-ᴗ-') // parpadeo
  expect(face('running', 1)).toBe('>_<')
  expect(prop('sleeping', 2)).toBe('zZz')
  expect(moodColor('error')).toBe('error')
  expect(saying('reading', 'format.ts', 0)).toBe('Leyendo format.ts')
  expect(saying('happy', undefined, 0)).toBe('¡Listo!')
  // Todas las caras ocupan tres columnas para que el marco no baile.
  for (const l of ['idle', 'thinking', 'reading', 'writing', 'running', 'web', 'agent', 'error', 'happy', 'surprised', 'love', 'git', 'testing', 'proud', 'sleeping', 'tired'] as const) {
    for (let f = 0; f < 6; f++) expect([...face(l, f)].length).toBe(3)
  }
})

test('reconoce commits y tests en Bash', () => {
  expect(moodForTool('Bash', { command: 'git commit -m "x"' }).mood).toBe('git')
  expect(moodForTool('Bash', { command: 'npm test' }).mood).toBe('testing')
  expect(moodForTool('Bash', { command: 'claude plugin test .' }).mood).toBe('testing')
  expect(moodForTool('Bash', { command: 'git status' }).mood).toBe('running')
  expect(saying('proud', '¡Nivel 2!', 0)).toBe('¡Nivel 2!')
})
