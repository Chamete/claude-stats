import type { Pet, PetConfig, Progress, SaverMode, Worker } from '../types'
import { level, saverActive } from './format'
import { face, look, moodColor, prop, saying } from './pet'
import { levelOf } from './progress'
import { orchestratorSaying, species, visibleWorkers } from './team'
import type { Ui } from './panel/kit'

/** Lo que la banda de la mascota necesita para dibujarse. */
export type BandData = {
  c: PetConfig
  p: Pet
  f: number
  now: number
  m: SaverMode
  ws: Worker[]
  pr: Progress
  sa: number
  lastPct: number | undefined
  /** Poco sitio: una sola línea. */
  isCompact: boolean
  caress: () => void
}

/** La mascota encima del prompt: cara, frase, energía y el equipo en miniatura. */
export function drawBand(ui: Ui, d: BandData) {
  const { Box, Text, Button } = ui
  const { c, p, f, now, m, ws, pr, sa, lastPct, isCompact, caress } = d
  const lv = levelOf(pr.xp)
  const team = visibleWorkers(ws, now)
  const running = team.filter(w => w.status === 'running').length
  const coordinating = running > 0 && (p.mood === 'thinking' || p.mood === 'agent' || p.mood === 'idle')
  const l = coordinating ? 'agent' : look(p, now, lastPct)
  const said = (coordinating && orchestratorSaying(running)) || saying(l, p.detail, p.since)
  const color = moodColor(l)
  const energy = lastPct === undefined ? undefined : Math.max(0, Math.round(100 - lastPct))
  const filled = energy === undefined ? 0 : Math.round(energy / 10)

  if (isCompact) {
    return (
      <Box flexDirection="row" gap={1}>
        <Text bold color={color}>
          ({face(l, f)})
        </Text>
        <Text color={color} wrap="truncate">
          {said}
        </Text>
        {energy !== undefined && <Text color={level(100 - energy)}>{energy}%</Text>}
        <Button key="acariciar" label="♥" plain dimColor onPress={caress} />
      </Box>
    )
  }

  return (
    <Box flexDirection="row" alignItems="center">
      <Box borderStyle="round" borderColor={color} paddingX={1}>
        <Text bold color={color}>
          {face(l, f)}
        </Text>
      </Box>
      <Box flexDirection="column" marginLeft={1}>
        <Box flexDirection="row" gap={1}>
          <Text color={color}>{prop(l, f).padEnd(3)}</Text>
          <Text bold>{c.name}</Text>
          <Text color="warning">{`Nv ${lv}`}</Text>
          <Text color={color}>{said}</Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text dimColor>energía</Text>
          {energy === undefined ? (
            <Text dimColor>—</Text>
          ) : (
            <Box flexDirection="row">
              <Text color={level(100 - energy)}>{'■'.repeat(filled)}</Text>
              <Text dimColor>{'□'.repeat(10 - filled)}</Text>
            </Box>
          )}
          {energy !== undefined && <Text dimColor>{energy}%</Text>}
          {saverActive(m, lastPct, sa) && <Text color="success">🌱</Text>}
          <Button key="acariciar" label="♥" plain dimColor onPress={caress} />
        </Box>
        {team.length > 0 && (
          <Box flexDirection="row" gap={1}>
            <Text dimColor>equipo ⇄</Text>
            {team.slice(0, 8).map(w => {
              const wl = look({ mood: w.mood, since: w.finishedAt ?? w.startedAt }, now, undefined)
              return (
                <Text key={`mini-${w.id}`} color={w.status === 'running' ? species(w.type).color : moodColor(wl)}>
                  ({face(wl, f)})
                </Text>
              )
            })}
            {team.length > 8 && <Text dimColor>+{team.length - 8}</Text>}
          </Box>
        )}
      </Box>
    </Box>
  )
}
