import { test, expect } from 'claude-code/testing'
import { NO_PROGRESS, bashKind, gain, levelOf, levelProgress, nextAchievement, title, xpForLevel } from './progress'

test('niveles: 0, 50, 150, 300 XP', () => {
  expect(levelOf(0)).toBe(1)
  expect(levelOf(49)).toBe(1)
  expect(levelOf(50)).toBe(2)
  expect(levelOf(150)).toBe(3)
  expect(levelOf(299)).toBe(3)
  for (let n = 1; n < 12; n++) expect(levelOf(xpForLevel(n))).toBe(n)
  expect(levelProgress(100)).toBe(50)
  expect(title(1)).toBe('Bebé')
  expect(title(99)).toBe('Leyenda')
})

test('logros y subida de nivel', () => {
  const first = gain(NO_PROGRESS, 'turns')
  expect(first.unlocked.map(a => a.id)).toEqual(['primer-prompt'])
  expect(first.progress.xp).toBe(5)
  // Un logro solo se da una vez.
  expect(gain(first.progress, 'turns').unlocked).toEqual([])
  let p = first.progress
  let levelUp: number | undefined
  for (let i = 0; i < 45 && !levelUp; i++) ({ progress: p, levelUp } = gain(p, 'tools'))
  expect(levelUp).toBe(2)
  expect(p.xp).toBe(50)
})

test('el próximo logro es el más cercano', () => {
  const p = { xp: 0, counters: { tools: 90 }, unlocked: [] }
  expect(nextAchievement(p)?.a.id).toBe('manitas')
})

test('Bash: cuenta commits y tests, pero no un commit de prueba', () => {
  expect(bashKind('git commit -m "x"')).toBe('commits')
  expect(bashKind('git -c user.name=a commit -m "x"')).toBe('commits')
  expect(bashKind('git commit --dry-run')).toBeUndefined()
  expect(bashKind('git status')).toBeUndefined()
  expect(bashKind('npm test')).toBe('tests')
  expect(bashKind('claude plugin test ./')).toBe('tests')
})
