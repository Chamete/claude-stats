import type { Worker } from '../../types'
import { compact } from '../format'
import { face, look, moodColor, saying } from '../pet'
import { STATS_WIDTH, elapsed, fit, isBusy, justArrived, orchestratorSaying, rowLayout, species, spinner, visibleWorkers, wire } from '../team'
import type { PaneData } from './kit'

/** El equipo de subagentes: el orquestador arriba y un cable animado hasta cada uno. */
export function teamCard(d: PaneData) {
  const { ui: { Box, Text }, L, now, bodyWidth, ws, tf, p, pc0, lastPct } = d
  // El equipo: el orquestador arriba y un cable animado hasta cada subagente.
  const team = visibleWorkers(ws, now)
  const running = team.filter(w => w.status === 'running').length
  const depth = (w: Worker): number => {
    let d = 0
    for (let parent = w.parentId; parent && d < 4; parent = team.find(x => x.id === parent)?.parentId) d++
    return d
  }
  const teamWidth = Math.min(bodyWidth, Math.max(L.cardWidth, 100))
  // Ancho útil de una fila: la tarjeta menos borde y margen.
  const rowWidth = Math.max(20, teamWidth - 4)
  const pc = pc0
  const caught = team.find(w => justArrived(w.packets, 'result', now))
  const reported = team.find(w => justArrived(w.packets, 'progress', now))
  const boss = caught ? 'happy' : running > 0 ? 'agent' : look(p, now, lastPct)
  const slow = Math.floor(tf / 5)
  const bossSays = caught
    ? `¡Resultado recibido de ${species(caught.type).label}!`
    : reported
      ? `${species(reported.type).label} informa…`
      : (orchestratorSaying(running) ?? 'Recibiendo resultados')
  return team.length > 0 && (
    <Box key="team" flexDirection="column" borderStyle="round" borderColor="remember" paddingX={1} width={teamWidth}>
      <Text bold color="remember" wrap="truncate">
        🤖  Equipo · {running} trabajando{team.length > running ? ` · ${team.length - running} terminado${team.length - running > 1 ? 's' : ''}` : ''}
      </Text>
      <Box flexDirection="row" alignItems="center">
        <Box borderStyle="round" borderColor={moodColor(boss)} paddingX={1}>
          <Text bold color={moodColor(boss)}>
            {face(boss, slow)}
          </Text>
        </Box>
        <Box flexDirection="column" marginLeft={1}>
          <Text bold>{pc.name}</Text>
          <Text color={moodColor(boss)} wrap="truncate">
            {bossSays}
          </Text>
        </Box>
      </Box>
      {team.map((w, i) => {
        const sp = species(w.type)
        const d = depth(w)
        const rl = rowLayout(rowWidth, d)
        const gotTask = w.status === 'running' && justArrived(w.packets, 'task', now)
        const wl = gotTask ? 'happy' : look({ mood: w.mood, since: w.finishedAt ?? w.startedAt }, now, undefined)
        const wr = wire(w, now, tf + i * 5, rl.wireWidth)
        const isLast = i === team.length - 1
        const isFaded = w.status !== 'running' && !isBusy(w.packets, now) && now - (w.finishedAt ?? now) > 10_000
        const packetColor = wr.kind === 'task' ? 'suggestion' : wr.kind === 'result' ? 'success' : sp.color
        const said = gotTask ? '¡Tarea recibida!' : saying(wl, w.detail, w.startedAt)
        // Todo medido: el nombre, y la descripción y la frase en lo que quede.
        const label = fit(sp.label, rl.textWidth)
        const rest = fit(`${rl.showDescription ? `${w.description} · ` : ''}${said}`, rl.textWidth - label.length - 1)
        const stats = ` ${compact(w.tokens)} · ${elapsed((w.finishedAt ?? now) - w.startedAt)}`.padStart(STATS_WIDTH)
        return (
          <Box key={`w-${w.id}`} flexDirection="row" width={rowWidth} overflow="hidden">
            <Text dimColor>
              {'  '.repeat(Math.min(d, 4))}
              {isLast ? '  └' : '  ├'}
            </Text>
            {wr.segments.map((seg, k) => (
              <Text
                key={`seg-${w.id}-${k}`}
                bold={seg.style === 'glyph'}
                dimColor={seg.style === 'line' || isFaded}
                color={
                  seg.style === 'glyph' || seg.style === 'trail'
                    ? packetColor
                    : seg.style === 'flow'
                      ? sp.color
                      : seg.style === 'end' && wr.kind === 'none'
                        ? w.status === 'failed'
                          ? 'error'
                          : 'success'
                        : undefined
                }
              >
                {seg.text}
              </Text>
            ))}
            <Text bold dimColor={isFaded} color={w.status === 'running' ? sp.color : moodColor(wl)}>
              {' '}({face(wl, Math.floor(tf / 5) + i)}){' '}
            </Text>
            <Text color={sp.color} dimColor={isFaded}>
              {w.status === 'running' ? spinner(tf + i * 3) : w.status === 'failed' ? '✗' : '✓'} {sp.badge}{' '}
            </Text>
            <Text bold color={sp.color} dimColor={isFaded}>
              {label}
            </Text>
            <Text dimColor={isFaded}>{rest ? ` ${rest}` : ''}</Text>
            <Box flexGrow={1} />
            {rl.showStats && <Text dimColor>{stats}</Text>}
          </Box>
        )
      })}
    </Box>
  )
}
