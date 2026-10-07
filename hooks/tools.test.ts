import { test, expect } from 'claude-code/testing'
import { addAgentTokens, addCall, addStepOutput, ranking, resultTokens, toolGroup } from './tools'

test('agrupa MCP por servidor y Task con Agent', () => {
  expect(toolGroup('mcp__claude_ai_Notion__notion-search')).toBe('mcp·Notion')
  expect(toolGroup('Task')).toBe('Agent')
  expect(toolGroup('Bash')).toBe('Bash')
})

test('suma llamadas, salida repartida y subagentes', () => {
  let list = addCall([], 'Read', 120, resultTokens('x'.repeat(4000)), false)
  list = addCall(list, 'Bash', 50, 10, true)
  list = addStepOutput(list, ['Read', 'Bash'], 200)
  list = addAgentTokens(list, 5000)
  const r = ranking(list)
  expect(r.map(x => x.stat.name)).toEqual(['Agent', 'Read', 'Bash'])
  expect(r[1]!.tokens).toBe(1100)
  expect(r[2]!.stat.errors).toBe(1)
  expect(r.reduce((n, x) => n + x.share, 0)).toBeGreaterThanOrEqual(99)
})
