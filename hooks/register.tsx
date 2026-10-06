import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Alerts, Mood, Pet, PetConfig, Sample, SaverMode, Tokens, Turn, Worker } from '../types'
import {
  FIVE_HOURS,
  NO_TOKENS,
  SAVER_AT,
  SAVER_MODEL,
  WEEK,
  addSample,
  addTokens,
  cacheHit,
  compact,
  downgrade,
  duration,
  fiveHour,
  forecast,
  layout,
  money,
  priceForecast,
  promptLine,
  promptRow,
  saverActive,
  sparkline,
  threshold,
  totalTokens,
  turnCost,
  turnPrice,
  untilReset,
  weekForecast,
} from './format'
import { face, look, moodColor, moodForTool, prop, saying } from './pet'
import { STATS_WIDTH, elapsed, enqueue, fit, isBusy, justArrived, orchestratorSaying, rowLayout, species, spinner, visibleWorkers, wire } from './team'

const PANE = 'consumo'
const PET_NAME = 'NeuroSigma'
const samples = atom({ plugin: 'consumo', key: 'samples' } as const, [] as Sample[])
const weekSamples = atom({ plugin: 'consumo', key: 'weekSamples' } as const, [] as Sample[])
const mode = atom({ plugin: 'consumo', key: 'mode' } as const, 'auto' as SaverMode)
const tokens = atom({ plugin: 'consumo', key: 'tokens' } as const, NO_TOKENS as Tokens)
const turns = atom({ plugin: 'consumo', key: 'turns' } as const, [] as Turn[])
const pet = atom({ plugin: 'consumo', key: 'pet' } as const, { mood: 'idle', since: 0 } as Pet)
const petConfig = atom({ plugin: 'consumo', key: 'petConfig' } as const, { isEnabled: true, name: PET_NAME } as PetConfig)
const frame = atom({ plugin: 'consumo', key: 'frame' } as const, 0)
const workers = atom({ plugin: 'consumo', key: 'workers' } as const, [] as Worker[])
const teamFrame = atom({ plugin: 'consumo', key: 'teamFrame' } as const, 0)
const alerts = atom({ plugin: 'consumo', key: 'alerts' } as const, { warned: 0, wasSaving: false } as Alerts)

const MODES: Record<SaverMode, string> = {
  auto: `auto · se activa al ${SAVER_AT}%`,
  on: 'siempre activo',
  off: 'apagado',
}

// Último % de la ventana de 5 h leído: lo usan el modo ahorro y la mascota.
let lastPct: number | undefined

/** Verde, amarillo o rojo según lo gastado. */
function level(pct: number): 'success' | 'warning' | 'error' {
  return pct >= 80 ? 'error' : pct >= 50 ? 'warning' : 'success'
}

async function refresh($: EngineInterface) {
  const [u, now, m, a] = await Promise.all([$.session.usage(), $.clock.now(), read($, mode), read($, alerts)])
  const five = fiveHour(u)
  const week = u.rateLimits.find(r => r.kind === 'seven_day')
  lastPct = five?.percentUsed
  const saving = saverActive(m, lastPct)

  const t = threshold(u)
  if (t > a.warned) $.ui.toast(`⚠️ Llevas ${t}% de tu ventana de 5 h`)
  if (saving && !a.wasSaving) $.ui.toast(`🌱 Modo ahorro activo: Opus → Sonnet 5.5 y esfuerzo medio`)
  if (!saving && a.wasSaving) $.ui.toast('Modo ahorro desactivado')
  const isReset = a.resetsAt !== undefined && five?.resetsAt !== undefined && five.resetsAt !== a.resetsAt
  if (isReset && a.warned > 0) $.ui.toast('🔄 Tu ventana de 5 h se ha reiniciado: vuelves a tener el 100%')
  await update($, alerts, () => ({ warned: t, wasSaving: saving, resetsAt: five?.resetsAt ?? a.resetsAt }))

  if (five) {
    const before = await read($, samples)
    const list = addSample(before, { t: now, pct: five.percentUsed, resetsAt: five.resetsAt })
    if (hasChanged(before, list)) {
      await update($, samples, () => list)
      await $.store.set('samples', list)
    }
  }
  if (week) {
    const before = await read($, weekSamples)
    const list = addSample(before, { t: now, pct: week.percentUsed, resetsAt: week.resetsAt })
    if (hasChanged(before, list)) {
      await update($, weekSamples, () => list)
      await $.store.set('weekSamples', list)
    }
  }
}

/** Si añadir la lectura cambió el historial (si no, no hace falta guardarlo). */
function hasChanged(before: Sample[], after: Sample[]): boolean {
  return after.length !== before.length || after[after.length - 1] !== before[before.length - 1]
}

async function setMode($: EngineInterface, m: SaverMode) {
  await update($, mode, () => m)
  await $.store.set('mode', m)
  await refresh($)
}

async function setPet($: EngineInterface, mood: Mood, detail?: string) {
  const now = await $.clock.now()
  await update($, pet, () => ({ mood, detail, since: now }))
}

async function patchWorker($: EngineInterface, id: string, change: (w: Worker, now: number) => Worker) {
  const now = await $.clock.now()
  await update($, workers, ws => ws.map(w => (w.id === id ? change(w, now) : w)))
}

/** Un subagente termina: su resultado viaja de vuelta al orquestador. */
function finish(w: Worker, now: number, hasFailed: boolean): Worker {
  if (w.status !== 'running') return w
  return {
    ...w,
    status: hasFailed ? 'failed' : 'done',
    mood: hasFailed ? 'error' : 'happy',
    detail: undefined,
    finishedAt: now,
    packets: enqueue(w.packets ?? [], 'result', now),
  }
}

/** Contrasta con la lista del motor: recoge los que nos perdimos y cierra los que acabaron. */
async function syncAgents($: EngineInterface) {
  const [list, now, before] = await Promise.all([$.agent.list(), $.clock.now(), read($, workers)])
  const byId = new Map(list.map(a => [a.id, a]))
  const ended = new Set(['completed', 'failed', 'killed'])
  let next = before.map(w => {
    const a = byId.get(w.id)
    return a && ended.has(a.status) ? finish(w, now, a.status !== 'completed') : w
  })
  for (const a of list) {
    if ((a.status === 'running' || a.status === 'pending') && !next.some(w => w.id === a.id)) {
      next.push({
        id: a.id,
        type: a.teammateId ? 'teammate' : a.type,
        description: a.name ?? a.description,
        mood: 'thinking',
        startedAt: now,
        status: 'running',
        tokens: 0,
        packets: [],
        parentId: a.parentId,
      })
    }
  }
  next = next.slice(-20)
  if (JSON.stringify(next) !== JSON.stringify(before)) await update($, workers, () => next)
}

async function tickTeam($: EngineInterface) {
  const [ws, now] = await Promise.all([read($, workers), $.clock.now()])
  if (visibleWorkers(ws, now).length > 0 || ws.some(w => isBusy(w.packets, now))) {
    await update($, teamFrame, f => f + 1)
  }
}

async function setPetConfig($: EngineInterface, change: Partial<PetConfig>) {
  const next = { ...(await read($, petConfig)), ...change }
  await update($, petConfig, () => next)
  await $.store.set('petConfig', next)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    // Quita la línea de estado que dejaban las versiones anteriores.
    $.ui.status(undefined)
    // El historial, el modo y la mascota sobreviven entre sesiones.
    const [stored, storedWeek, storedMode, storedPet, now] = await Promise.all([
      $.store.get('samples'),
      $.store.get('weekSamples'),
      $.store.get('mode'),
      $.store.get('petConfig'),
      $.clock.now(),
    ])
    if (Array.isArray(stored)) await update($, samples, list => (list.length ? list : (stored as Sample[])))
    if (Array.isArray(storedWeek)) await update($, weekSamples, list => (list.length ? list : (storedWeek as Sample[])))
    if (storedMode === 'auto' || storedMode === 'on' || storedMode === 'off') await update($, mode, () => storedMode)
    if (storedPet && typeof storedPet === 'object') await update($, petConfig, c => ({ ...c, ...(storedPet as PetConfig) }))
    // La mascota se llamaba Clau antes de la 0.5.0.
    if ((await read($, petConfig)).name === 'Clau') await setPetConfig($, { name: PET_NAME })
    await update($, pet, p => (p.since === 0 ? { mood: 'idle' as const, since: now } : p))

    await $.command.register({ name: 'consumo', description: 'Abre el panel de consumo con historial y predicción' })
    await $.command.register({
      name: 'ahorro',
      description: 'Modo ahorro: auto, on u off (sin argumento muestra el estado)',
      argumentHint: '[auto|on|off]',
    })
    await $.command.register({
      name: 'mascota',
      description: 'Mascota: on, off o nombre <nuevo nombre>',
      argumentHint: '[on|off|nombre <nombre>]',
    })
    await refresh($)
    $.clock.every(60_000, () => void refresh($).catch(() => {}))
    // Fotogramas de la mascota.
    $.clock.every(800, () => void update($, frame, f => f + 1).catch(() => {}))
    // Equipo de subagentes: animación más fluida y repaso con la lista del motor.
    $.clock.every(150, () => void tickTeam($).catch(() => {}))
    $.clock.every(2_000, () => void syncAgents($).catch(() => {}))
    return r
  })

  on('session.measure', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  on('command.run', { command: 'consumo' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Consumo' })
    return { text: 'Panel de consumo abierto.' }
  })

  on('command.run', { command: 'ahorro' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'auto' || arg === 'on' || arg === 'off') {
      await setMode($, arg)
      return { text: `Modo ahorro: ${MODES[arg]}.` }
    }
    const m = await read($, mode)
    const state = saverActive(m, lastPct) ? 'activo ahora' : 'inactivo ahora'
    return { text: `Modo ahorro: ${MODES[m]} — ${state}. Usa /ahorro auto|on|off.` }
  })

  on('command.run', { command: 'mascota' }, async ($, e) => {
    const [cmd, ...rest] = e.args.trim().split(/\s+/)
    const name = rest.join(' ').trim().slice(0, 20)
    if (cmd === 'on' || cmd === 'off') {
      await setPetConfig($, { isEnabled: cmd === 'on' })
      return { text: cmd === 'on' ? 'Mascota visible.' : 'Mascota oculta.' }
    }
    if (cmd === 'nombre' && name) {
      await setPetConfig($, { name })
      await setPet($, 'love')
      return { text: `Tu mascota ahora se llama ${name}.` }
    }
    const c = await read($, petConfig)
    return { text: `${c.name} está ${c.isEnabled ? 'visible' : 'oculta'}. Usa /mascota on|off|nombre <nombre>.` }
  })

  // Cada prompt tuyo: lo que marcaba la ventana al empezar.
  on('turn.start', async ($, e, next) => {
    const [now, u] = await Promise.all([$.clock.now(), $.session.usage()])
    const turn: Turn = {
      turnId: e.turnId,
      text: e.text,
      startedAt: now,
      startPct: lastPct,
      startCost: u.cost?.usd,
      tokens: 0,
      isDone: false,
    }
    await update($, turns, list => [...list, turn].slice(-30))
    await setPet($, 'thinking')
    return next(e)
  })

  // Nace un subagente: el orquestador le manda su tarea.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.agentId) {
      const now = await $.clock.now()
      const w: Worker = {
        id: r.agentId,
        type: e.isTeammate ? 'teammate' : e.subagentType,
        description: e.description,
        mood: 'thinking',
        startedAt: now,
        status: 'running',
        tokens: 0,
        packets: [{ kind: 'task', since: now }],
        parentId: e.parentAgentId,
      }
      await update($, workers, ws => [...ws.filter(x => x.id !== w.id), w].slice(-20))
    }
    return r
  }).catch(($, e, next) => next(e)) // observar nunca impide que arranque

  on('tool.call', async ($, e, next) => {
    const { mood, detail } = moodForTool(e.tool, e as Record<string, unknown>)
    const agentId = e.agentId
    if (agentId) await patchWorker($, agentId, w => (w.status === 'running' ? { ...w, mood, detail } : w))
    else await setPet($, mood, detail)
    const r = await next(e)
    const after: Mood = r.isError ? 'error' : 'thinking'
    // El subagente informa al orquestador de cada paso, si el cable está libre.
    if (agentId) {
      await patchWorker($, agentId, (w, now) =>
        w.status !== 'running'
          ? w
          : {
              ...w,
              mood: after,
              detail: undefined,
              packets: isBusy(w.packets, now) ? w.packets : enqueue(w.packets ?? [], 'progress', now),
            },
      )
    }
    else await setPet($, after)
    return r
  }).catch(($, e, next) => next(e)) // la mascota nunca bloquea una herramienta

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    const agentId = e.agentId
    if (agentId) {
      await patchWorker($, agentId, (w, now) => finish(w, now, e.reason !== 'answer'))
      return r
    }
    const list = await read($, turns)
    if (list.some(t => t.turnId === e.turnId)) {
      const u = await $.session.usage()
      const endPct = fiveHour(u)?.percentUsed
      const endCost = u.cost?.usd
      await update($, turns, all =>
        all.map(t => (t.turnId === e.turnId ? { ...t, endPct, endCost, isDone: true } : t)),
      )
      await setPet($, e.reason === 'answer' ? 'happy' : e.reason === 'aborted' ? 'surprised' : 'error')
    }
    return r
  })

  // Cada petición al modelo: modo ahorro a la ida, tokens a la vuelta.
  on('turn.step', async function* ($, e, next) {
    const m = await read($, mode)
    const change = saverActive(m, lastPct) ? downgrade(e.model, e.effort) : undefined
    const r = yield* next(change ? { ...e, ...change } : e)
    const usage = r.usage
    if (usage) {
      await update($, tokens, t => addTokens(t, usage))
      const agentId = e.agentId
      if (agentId) await patchWorker($, agentId, w => ({ ...w, tokens: w.tokens + totalTokens(usage) }))
      await update($, turns, all =>
        all.map(t => (t.turnId === e.turnId ? { ...t, tokens: t.tokens + totalTokens(usage) } : t)),
      )
    }
    return r
  })

  // La mascota, encima del prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const c = await read($, petConfig)
    if (e.props.hasSurvey || !c.isEnabled) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const [p, f, now, m, ws] = await Promise.all([
      read($, pet),
      read($, frame),
      $.clock.now(),
      read($, mode),
      read($, workers),
    ])
    const team = visibleWorkers(ws, now)
    const running = team.filter(w => w.status === 'running').length
    const coordinating = running > 0 && (p.mood === 'thinking' || p.mood === 'agent' || p.mood === 'idle')
    const l = coordinating ? 'agent' : look(p, now, lastPct)
    const said = (coordinating && orchestratorSaying(running)) || saying(l, p.detail, p.since)
    const color = moodColor(l)
    const energy = lastPct === undefined ? undefined : Math.max(0, Math.round(100 - lastPct))
    const filled = energy === undefined ? 0 : Math.round(energy / 10)

    if (e.props.bodyColumns < 60 || e.props.maxRows < 4) {
      return (
        <Box flexDirection="row" gap={1}>
          <Text bold color={color}>
            ({face(l, f)})
          </Text>
          <Text color={color} wrap="truncate">
            {said}
          </Text>
          {energy !== undefined && <Text color={level(100 - energy)}>{energy}%</Text>}
          <Button key="acariciar" label="♥" plain dimColor onPress={() => setPet($, 'love')} />
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
            {saverActive(m, lastPct) && <Text color="success">🌱</Text>}
            <Button key="acariciar" label="♥" plain dimColor onPress={() => setPet($, 'love')} />
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
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const [u, now, list, weekList, m, tok, turnList, ws, tf, p] = await Promise.all([
      $.session.usage(),
      $.clock.now(),
      read($, samples),
      read($, weekSamples),
      read($, mode),
      read($, tokens),
      read($, turns),
      read($, workers),
      read($, teamFrame),
      read($, pet),
    ])
    const bodyWidth = e.props.bodyColumns || e.viewport?.columns || 60
    const L = layout(e.props.bodyColumns || e.viewport?.columns || 60, e.viewport?.rows ?? 40)
    const { inner } = L
    const five = fiveHour(u)
    const week = u.rateLimits.find(r => r.kind === 'seven_day')
    const saving = saverActive(m, five?.percentUsed)
    const fc = five && forecast(list, five.percentUsed, five.resetsAt, now)
    const weekFc = week && weekForecast(week.percentUsed, week.resetsAt, now)
    const recent = turnList.slice(-L.promptRows).reverse()
    const usd = u.cost?.usd
    const price = usd === undefined ? undefined : priceForecast(usd, u.startedAt, now, five?.resetsAt, turnList)
    const lastPrice = [...turnList].reverse().map(turnPrice).find(p => p !== undefined)

    const card = (key: string, title: string, accent: string, ...body: (JSX.Element | false | undefined)[]) => (
      <Box key={key} flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1} width={L.cardWidth}>
        <Text bold color={accent} wrap="truncate">
          {title}
        </Text>
        {body}
      </Box>
    )
    const meter = (pct: number, width: number) => {
      const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
      return (
        <Box flexDirection="row">
          <Text color={level(pct)}>{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(width - filled)}</Text>
        </Box>
      )
    }
    // Las cifras se reparten en filas según el ancho que haya.
    const stats = (items: [string, string][]) => {
      const perRow = Math.max(1, Math.min(items.length, Math.floor(inner / 14)))
      const width = Math.floor(inner / perRow)
      return (
        <Box flexDirection="row" flexWrap="wrap" width={inner}>
          {items.map(([label, value]) => (
            <Box key={label} flexDirection="column" width={width}>
              <Text dimColor wrap="truncate">
                {label}
              </Text>
              <Text bold wrap="truncate">
                {value}
              </Text>
            </Box>
          ))}
        </Box>
      )
    }
    const pace = (f: ReturnType<typeof forecast>, unit: (r: number) => string, quiet: string, waiting = 'Ritmo: reuniendo datos…') =>
      !f ? (
        <Text dimColor>{waiting}</Text>
      ) : f.etaMs === undefined ? (
        <Text color="success">✓ {quiet}</Text>
      ) : (
        <Text color={f.hitsBeforeReset ? 'error' : 'success'}>
          {f.hitsBeforeReset ? '⚠ ' : '✓ '}
          {unit(f.ratePerHour)} → 100% en {duration(f.etaMs)}
          {L.isCompact
            ? ''
            : f.hitsBeforeReset === true
              ? ', antes del reinicio'
              : f.hitsBeforeReset === false
                ? ', después del reinicio'
                : ''}
        </Text>
      )
    const head = (pct: number, resetsAt: string | undefined) => (
      <Box flexDirection="row" justifyContent="space-between" width={inner}>
        <Text bold color={level(pct)}>
          {pct}% usado
        </Text>
        <Text dimColor>↻ {untilReset(resetsAt, now) ?? '?'}</Text>
      </Box>
    )

    const fiveCard = card(
      'five',
      '⏱  Ventana de 5 h',
      five ? level(five.percentUsed) : 'subtle',
      five ? (
        <Box flexDirection="column">
          {head(five.percentUsed, five.resetsAt)}
          {meter(five.percentUsed, inner)}
          {!L.isShort && <Text color="claude">{sparkline(list, five.resetsAt, now, inner, FIVE_HOURS)}</Text>}
          {!L.isShort && !L.isCompact && (
            <Box flexDirection="row" justifyContent="space-between" width={inner}>
              <Text dimColor>inicio</Text>
              <Text dimColor>ahora ··· reinicio</Text>
            </Box>
          )}
          {pace(fc, r => `${r}%/h`, 'Estable en la última hora')}
        </Box>
      ) : (
        <Text dimColor>Sin lectura todavía: aparece tras la primera respuesta.</Text>
      ),
    )

    const weekCard = card(
      'week',
      '📅  Semana',
      week ? level(week.percentUsed) : 'subtle',
      week ? (
        <Box flexDirection="column">
          {head(week.percentUsed, week.resetsAt)}
          {meter(week.percentUsed, inner)}
          {!L.isShort && <Text color="suggestion">{sparkline(weekList, week.resetsAt, now, inner, WEEK)}</Text>}
          {pace(weekFc, r => `${Math.round(r * 24 * 10) / 10}%/día`, 'Sin consumo esta semana', 'Ritmo: se calcula tras el primer día de la ventana')}
        </Box>
      ) : (
        <Text dimColor>Sin lectura semanal todavía.</Text>
      ),
    )

    const priceCard = card(
      'price',
      '💲  Precio de la sesión',
      'warning',
      usd === undefined ? (
        <Text dimColor>Este entorno no lleva la cuenta del coste.</Text>
      ) : (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between" width={inner}>
            <Text bold color="warning">
              {money(usd)}
            </Text>
            <Text dimColor>en {duration(now - u.startedAt)}</Text>
          </Box>
          {stats([
            ['Por hora', price?.perHour === undefined ? '—' : money(price.perHour)],
            ['Por prompt', price?.perPrompt === undefined ? '—' : money(price.perPrompt)],
            ['Último', lastPrice === undefined ? '—' : money(lastPrice)],
          ])}
          {price?.atReset !== undefined && (
            <Text color="warning">
              ≈ {money(price.atReset)} al reiniciarse la ventana{L.isCompact ? '' : ', a este ritmo'}
            </Text>
          )}
          <Text dimColor>
            {L.isCompact ? 'Equivalente a precios de API' : 'Equivalente a precios de API: con tu suscripción no lo pagas aparte.'}
          </Text>
        </Box>
      ),
    )

    const tokenCard = card(
      'tokens',
      '🔢  Tokens',
      'suggestion',
      stats([
        ['Entrada', compact(tok.input)],
        ['Salida', compact(tok.output)],
        ['Caché leída', compact(tok.cacheRead)],
        ['Caché escrita', compact(tok.cacheWrite)],
      ]),
      <Box flexDirection="row" gap={1}>
        <Text dimColor>Caché</Text>
        {meter(cacheHit(tok), Math.max(6, Math.min(20, inner - 12)))}
        <Text color={cacheHit(tok) >= 70 ? 'success' : 'warning'}>{cacheHit(tok)}%</Text>
      </Box>,
      <Text dimColor wrap="truncate">
        {tok.requests} peticiones{u.context.percent !== undefined ? ` · contexto ${u.context.percent}%` : ''}
      </Text>,
    )

    const pr = promptRow(inner, L.isCompact)
    const turnsCard = card(
      'turns',
      '💬  Últimos prompts',
      'claude',
      recent.length === 0 && <Text dimColor>Aún no hay prompts en esta sesión.</Text>,
      ...recent.map(t => {
        const delta = (t.endPct ?? 0) - (t.startPct ?? 0)
        const p = turnPrice(t)
        return (
          // Cada columna con su ancho fijo y el texto recortado a lo que queda: nunca salta de línea.
          <Box key={t.turnId} flexDirection="row" width={inner} overflow="hidden">
            <Text bold color={!t.isDone ? 'claude' : delta >= 5 ? 'error' : delta >= 2 ? 'warning' : 'success'}>
              {turnCost(t).padStart(6)}{' '}
            </Text>
            {pr.showPrice && <Text color="warning">{(p === undefined ? '' : money(p)).padStart(7)} </Text>}
            {pr.showTokens && <Text dimColor>{compact(t.tokens).padStart(5)} </Text>}
            <Text wrap="truncate">{promptLine(t.text, pr.textWidth)}</Text>
          </Box>
        )
      }),
    )

    const saverCard = card(
      'saver',
      '🌱  Modo ahorro',
      saving ? 'success' : 'subtle',
      <Text color={saving ? 'success' : undefined} dimColor={!saving}>
        {saving ? `Activo: Opus → ${SAVER_MODEL}${L.isCompact ? '' : ', esfuerzo medio'}` : `Inactivo (${MODES[m]})`}
      </Text>,
      <Box flexDirection="row" flexWrap="wrap" gap={1} marginTop={1}>
        <Button key="modo-auto" hotkey="a" label="Auto" variant={m === 'auto' ? 'primary' : undefined} onPress={() => setMode($, 'auto')} />
        <Button key="modo-on" hotkey="s" label="Siempre" variant={m === 'on' ? 'primary' : undefined} onPress={() => setMode($, 'on')} />
        <Button key="modo-off" hotkey="o" label="Apagado" variant={m === 'off' ? 'primary' : undefined} onPress={() => setMode($, 'off')} />
      </Box>,
    )

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
    const pc = await read($, petConfig)
    const caught = team.find(w => justArrived(w.packets, 'result', now))
    const reported = team.find(w => justArrived(w.packets, 'progress', now))
    const boss = caught ? 'happy' : running > 0 ? 'agent' : look(p, now, lastPct)
    const slow = Math.floor(tf / 5)
    const bossSays = caught
      ? `¡Resultado recibido de ${species(caught.type).label}!`
      : reported
        ? `${species(reported.type).label} informa…`
        : (orchestratorSaying(running) ?? 'Recibiendo resultados')
    const teamCard = team.length > 0 && (
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

    // Columnas según el ancho: lo más urgente siempre arriba a la izquierda.
    const columns =
      L.columns === 3
        ? [
            [fiveCard, weekCard],
            [priceCard, tokenCard],
            [turnsCard, saverCard],
          ]
        : L.columns === 2
          ? [
              [fiveCard, weekCard, saverCard],
              [priceCard, tokenCard, turnsCard],
            ]
          : [[fiveCard, priceCard, weekCard, tokenCard, turnsCard, saverCard]]

    return (
      <Box flexDirection="column">
        {teamCard}
        <Box flexDirection="row" gap={1}>
          {columns.map((cards, i) => (
            <Box key={`col-${i}`} flexDirection="column">
              {cards}
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
