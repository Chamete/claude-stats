import type { ToolStat } from '../types'

/** Nombre con el que se agrupa una herramienta: las MCP, por servidor. */
export function toolGroup(tool: string): string {
  if (tool === 'Task') return 'Agent'
  const mcp = /^mcp__(.+?)__/.exec(tool)
  if (mcp) return `mcp·${mcp[1]!.replace(/^claude_ai_/, '')}`
  return tool
}

/** Tokens aproximados de un resultado: unos 4 caracteres por token. */
export function resultTokens(result: unknown): number {
  if (result === undefined || result === null) return 0
  try {
    const text = typeof result === 'string' ? result : JSON.stringify(result)
    return Math.ceil((text?.length ?? 0) / 4)
  } catch {
    return 0
  }
}

function patch(list: ToolStat[], name: string, change: (s: ToolStat) => ToolStat): ToolStat[] {
  const found = list.find(s => s.name === name)
  const base: ToolStat = found ?? { name, calls: 0, errors: 0, outTokens: 0, resultTokens: 0, ms: 0 }
  const next = change(base)
  return found ? list.map(s => (s === found ? next : s)) : [...list, next]
}

/** Una llamada terminada: cuánto tardó y cuánto devolvió. */
export function addCall(list: ToolStat[], tool: string, ms: number, tokens: number, isError: boolean): ToolStat[] {
  return patch(list, toolGroup(tool), s => ({
    ...s,
    calls: s.calls + 1,
    errors: s.errors + (isError ? 1 : 0),
    ms: s.ms + Math.max(0, ms),
    resultTokens: s.resultTokens + tokens,
  }))
}

/** La salida de un paso que pidió herramientas se reparte entre ellas. */
export function addStepOutput(list: ToolStat[], tools: readonly string[], outputTokens: number): ToolStat[] {
  if (tools.length === 0 || outputTokens <= 0) return list
  const share = outputTokens / tools.length
  return tools.reduce((acc, t) => patch(acc, toolGroup(t), s => ({ ...s, outTokens: s.outTokens + share })), list)
}

/** Todo lo de un subagente cuenta para Agent: lo que él gastó es el precio de delegar. */
export function addAgentTokens(list: ToolStat[], tokens: number): ToolStat[] {
  if (tokens <= 0) return list
  return patch(list, 'Agent', s => ({ ...s, outTokens: s.outTokens + tokens }))
}

export function statTokens(s: ToolStat): number {
  return Math.round(s.outTokens + s.resultTokens)
}

/** De más a menos tokens, con el % de cada una sobre el total. */
export function ranking(list: ToolStat[]): { stat: ToolStat; tokens: number; share: number }[] {
  const total = list.reduce((n, s) => n + statTokens(s), 0)
  return list
    .map(stat => ({ stat, tokens: statTokens(stat), share: total === 0 ? 0 : Math.round((statTokens(stat) / total) * 100) }))
    .sort((a, b) => b.tokens - a.tokens || b.stat.calls - a.stat.calls)
}
