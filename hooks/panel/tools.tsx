import { compact } from '../format'
import { ranking } from '../tools'
import type { PaneData } from './kit'

/** Un nombre recortado a `width` caracteres, con «…» si no cabe. */
function fitName(name: string, width: number): string {
  return name.length > width ? `${name.slice(0, width - 1)}…` : name
}

/** Tokens por herramienta: qué herramientas se llevan los tokens de la sesión. */
export function toolsCard(d: PaneData) {
  const { ui: { Box, Text }, kit: { card }, L, ts } = d
  const { inner } = L
  // Qué herramientas se llevan los tokens: la salida que las pidió más lo que devolvieron.
  const ranked = ranking(ts).slice(0, L.promptRows)
  const nameWidth = Math.min(14, Math.max(6, ...ranked.map(x => x.stat.name.length)))
  const toolBar = Math.max(4, Math.min(16, inner - nameWidth - (L.isCompact ? 12 : 26)))
  return card(
    'tools',
    '🧰  Tokens por herramienta',
    'remember',
    ranked.length === 0 && <Text dimColor>Aún no se ha usado ninguna herramienta.</Text>,
    ...ranked.map(({ stat, tokens: n, share }) => {
      const filled = Math.round((share / 100) * toolBar)
      return (
        <Box key={`tool-${stat.name}`} flexDirection="row" width={inner} overflow="hidden">
          <Text bold wrap="truncate">
            {fitName(stat.name, nameWidth).padEnd(nameWidth)}{' '}
          </Text>
          <Text color="remember">{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(toolBar - filled)}</Text>
          <Text>{`${share}%`.padStart(5)}</Text>
          <Text dimColor>{compact(n).padStart(6)}</Text>
          {!L.isCompact && <Text dimColor>{` ×${stat.calls}`.padEnd(6)}</Text>}
          {!L.isCompact && stat.errors > 0 && <Text color="error">{` ✗${stat.errors}`}</Text>}
        </Box>
      )
    }),
    ranked.length > 0 && !L.isCompact && <Text dimColor>Tokens = salida que las pidió + lo que devolvieron (≈).</Text>,
  )
}
