import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Alerts, CardId, CardLayout, Counter, ModelInfo, Mood, Pet, PetConfig, Progress, Sample, SaverMode, Tokens, ToolStat, Turn, Worker } from '../types'
import { addSample, addTokens, downgrade, fiveHour, layout, modeText, NO_TOKENS, parseSaverAt, SAVER_AT, saverActive, threshold, totalTokens } from './format'
import { moodForTool } from './pet'
import { ACHIEVEMENTS, bashKind, gain, levelOf, NO_PROGRESS, title } from './progress'
import { CARDS, DEFAULT_LAYOUT, cardId, cardInfo, normalize, reorder } from './cards'
import { addAgentTokens, addCall, addStepOutput, resultTokens } from './tools'
import { enqueue, isBusy, visibleWorkers } from './team'
import { drawBand } from './band'
import { drawPane, makeKit } from './panel'

const PANE = 'consumo'
const PET_NAME = 'NeuroSigma'
const samples = atom({ plugin: 'consumo', key: 'samples' } as const, [] as Sample[])
const weekSamples = atom({ plugin: 'consumo', key: 'weekSamples' } as const, [] as Sample[])
const mode = atom({ plugin: 'consumo', key: 'mode' } as const, 'auto' as SaverMode)
const saverAt = atom({ plugin: 'consumo', key: 'saverAt' } as const, SAVER_AT)
const tokens = atom({ plugin: 'consumo', key: 'tokens' } as const, NO_TOKENS as Tokens)
const turns = atom({ plugin: 'consumo', key: 'turns' } as const, [] as Turn[])
const pet = atom({ plugin: 'consumo', key: 'pet' } as const, { mood: 'idle', since: 0 } as Pet)
const petConfig = atom({ plugin: 'consumo', key: 'petConfig' } as const, { isEnabled: true, name: PET_NAME } as PetConfig)
const frame = atom({ plugin: 'consumo', key: 'frame' } as const, 0)
const workers = atom({ plugin: 'consumo', key: 'workers' } as const, [] as Worker[])
const teamFrame = atom({ plugin: 'consumo', key: 'teamFrame' } as const, 0)
const toolStats = atom({ plugin: 'consumo', key: 'toolStats' } as const, [] as ToolStat[])
const progress = atom({ plugin: 'consumo', key: 'progress' } as const, NO_PROGRESS as Progress)
const model = atom({ plugin: 'consumo', key: 'model' } as const, {} as ModelInfo)
const cards = atom({ plugin: 'consumo', key: 'cards' } as const, DEFAULT_LAYOUT as CardLayout)
const isEditing = atom({ plugin: 'consumo', key: 'isEditing' } as const, false)
const alerts = atom({ plugin: 'consumo', key: 'alerts' } as const, { warned: 0, wasSaving: false } as Alerts)

// El progreso de la mascota se guarda al momento si hay logro o nivel y, si no, en lotes.
let isProgressDirty = false

async function flushProgress($: EngineInterface) {
  if (!isProgressDirty) return
  isProgressDirty = false
  await $.store.set('progress', await read($, progress))
}

// Último % de la ventana de 5 h leído: lo usan el modo ahorro y la mascota.
let lastPct: number | undefined

/** Vuelve a leer el modelo de la sesión: cambia con /model, los botones del panel o un fallback. */
async function syncModel($: EngineInterface) {
  const id = await $.session.model()
  await update($, model, mi => (mi.session === id ? mi : { ...mi, session: id }))
}

async function refresh($: EngineInterface) {
  await syncModel($).catch(() => {})
  const [u, now, m, a, at] = await Promise.all([$.session.usage(), $.clock.now(), read($, mode), read($, alerts), read($, saverAt)])
  const five = fiveHour(u)
  const week = u.rateLimits.find(r => r.kind === 'seven_day')
  lastPct = five?.percentUsed
  const saving = saverActive(m, lastPct, at)

  const t = threshold(u)
  if (t > a.warned) $.ui.toast(`⚠️ Llevas ${t}% de tu ventana de 5 h`)
  if (saving && !a.wasSaving) {
    $.ui.toast(`🌱 Modo ahorro activo: Opus → Sonnet 5.5 y esfuerzo medio`)
    await earn($, 'saver')
  }
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
  await flushProgress($)
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

/** Suma experiencia; al subir de nivel o desbloquear un logro, la mascota lo celebra. */
async function earn($: EngineInterface, counter: Counter) {
  let g: ReturnType<typeof gain> | undefined
  await update($, progress, p => {
    g = gain(p, counter)
    return g.progress
  })
  if (!g) return
  if (g.levelUp || g.unlocked.length) {
    await $.store.set('progress', g.progress)
    isProgressDirty = false
  } else isProgressDirty = true
  const name = (await read($, petConfig)).name
  for (const a of g.unlocked) $.ui.toast(`🏆 Logro: ${a.emoji} ${a.name} — ${a.hint}`)
  if (g.levelUp) $.ui.toast(`⭐ ${name} sube al nivel ${g.levelUp}: ${title(g.levelUp)}`)
  const last = g.unlocked[g.unlocked.length - 1]
  if (g.levelUp) await setPet($, 'proud', `¡Nivel ${g.levelUp}! Ya soy ${title(g.levelUp)}`)
  else if (last) await setPet($, 'proud', `¡Logro: ${last.emoji} ${last.name}!`)
}

async function setCards($: EngineInterface, change: (c: CardLayout) => CardLayout) {
  const next = change(await read($, cards))
  await update($, cards, () => next)
  await $.store.set('cards', next)
}

/** El orden actual, en una línea: «1 🏆 Progreso · 2 ⏱ Ventana de 5 h (oculta) …». */
function describeCards(c: CardLayout): string {
  return c.order
    .map((id, i) => `${i + 1} ${cardInfo(id).emoji} ${cardInfo(id).name}${c.hidden.includes(id) ? ' (oculta)' : ''}`)
    .join(' · ')
}

async function caress($: EngineInterface) {
  await setPet($, 'love')
  await earn($, 'pets')
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

async function tickPet($: EngineInterface) {
  if (!(await read($, petConfig)).isEnabled) return
  await update($, frame, f => f + 1)
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
    const [stored, storedWeek, storedMode, storedSaverAt, storedPet, storedProgress, storedCards, now] = await Promise.all([
      $.store.get('samples'),
      $.store.get('weekSamples'),
      $.store.get('mode'),
      $.store.get('saverAt'),
      $.store.get('petConfig'),
      $.store.get('progress'),
      $.store.get('cards'),
      $.clock.now(),
    ])
    if (Array.isArray(stored)) await update($, samples, list => (list.length ? list : (stored as Sample[])))
    if (Array.isArray(storedWeek)) await update($, weekSamples, list => (list.length ? list : (storedWeek as Sample[])))
    if (storedMode === 'auto' || storedMode === 'on' || storedMode === 'off') await update($, mode, () => storedMode)
    const validAt = typeof storedSaverAt === 'number' ? parseSaverAt(String(storedSaverAt)) : undefined
    if (validAt !== undefined) await update($, saverAt, () => validAt)
    if (storedPet && typeof storedPet === 'object') await update($, petConfig, c => ({ ...c, ...(storedPet as PetConfig) }))
    if (storedProgress && typeof storedProgress === 'object')
      await update($, progress, p => (p.xp > 0 ? p : { ...NO_PROGRESS, ...(storedProgress as Progress) }))
    if (storedCards && typeof storedCards === 'object') await update($, cards, () => normalize(storedCards as Partial<CardLayout>))
    // La mascota se llamaba Clau antes de la 0.5.0.
    if ((await read($, petConfig)).name === 'Clau') await setPetConfig($, { name: PET_NAME })
    await update($, pet, p => (p.since === 0 ? { mood: 'idle' as const, since: now } : p))

    await $.command.register({ name: 'consumo', description: 'Abre el panel de consumo con historial y predicción' })
    await $.command.register({
      name: 'ahorro',
      description: 'Modo ahorro: auto, on, off o umbral <50-99> (sin argumento muestra el estado)',
      argumentHint: '[auto|on|off|umbral <50-99>]',
    })
    await $.command.register({
      name: 'tarjetas',
      description: 'Ordena u oculta las tarjetas de /consumo: orden, ocultar, mostrar, restablecer',
      argumentHint: '[orden <tarjetas…>|ocultar <tarjeta>|mostrar <tarjeta>|restablecer]',
    })
    await $.command.register({
      name: 'mascota',
      description: 'Mascota: on, off, logros o nombre <nuevo nombre>',
      argumentHint: '[on|off|logros|nombre <nombre>]',
    })
    await refresh($)
    $.clock.every(60_000, () => void refresh($).catch(() => {}))
    // Fotogramas de la mascota.
    // Con la mascota oculta no hay nada que animar: no se redibuja.
    $.clock.every(800, () => void tickPet($).catch(() => {}))
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
    const [cmd = '', value = ''] = arg.split(/\s+/)
    if (cmd === 'umbral') {
      const at = parseSaverAt(value)
      if (at === undefined) return { text: 'Indica un porcentaje entre 50 y 99, por ejemplo: /ahorro umbral 90.' }
      await update($, saverAt, () => at)
      await $.store.set('saverAt', at)
      await refresh($)
      return { text: `Modo ahorro: el modo auto se activará al ${at}% de la ventana de 5 h.` }
    }
    const at = await read($, saverAt)
    if (arg === 'auto' || arg === 'on' || arg === 'off') {
      await setMode($, arg)
      return { text: `Modo ahorro: ${modeText(arg, at)}.` }
    }
    const m = await read($, mode)
    const state = saverActive(m, lastPct, at) ? 'activo ahora' : 'inactivo ahora'
    return { text: `Modo ahorro: ${modeText(m, at)} — ${state}. Usa /ahorro auto|on|off|umbral <50-99>.` }
  })

  on('command.run', { command: 'tarjetas' }, async ($, e) => {
    const [cmd = '', ...rest] = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const names = CARDS.map(c => c.aliases[0]).join(', ')
    const ids = rest.map(cardId)
    const unknown = rest.filter((_, i) => !ids[i])
    if (unknown.length) return { text: `No conozco: ${unknown.join(', ')}. Las tarjetas son: ${names}.` }
    const found = ids.filter((id): id is CardId => id !== undefined)
    if (cmd === 'restablecer') {
      await setCards($, () => DEFAULT_LAYOUT)
      return { text: `Tarjetas como venían: ${describeCards(DEFAULT_LAYOUT)}.` }
    }
    if (cmd === 'orden' && found.length) {
      await setCards($, c => reorder(c, found))
    } else if ((cmd === 'ocultar' || cmd === 'mostrar') && found.length) {
      await setCards($, c => ({
        ...c,
        hidden: cmd === 'ocultar' ? [...new Set([...c.hidden, ...found])] : c.hidden.filter(h => !found.includes(h)),
      }))
    } else if (cmd) {
      return {
        text: `Usa /tarjetas orden <tarjetas…>, ocultar <tarjeta>, mostrar <tarjeta> o restablecer. Las tarjetas son: ${names}. También puedes pulsar «⚙ Personalizar» en /consumo.`,
      }
    }
    return { text: `Tarjetas: ${describeCards(await read($, cards))}.` }
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
    const [c, pr] = await Promise.all([read($, petConfig), read($, progress)])
    const lv = levelOf(pr.xp)
    if (cmd === 'logros') {
      const lines = ACHIEVEMENTS.map(a => {
        const isDone = pr.unlocked.includes(a.id)
        const count = Math.min(a.goal, pr.counters[a.counter] ?? 0)
        return `${isDone ? a.emoji : '🔒'} ${a.name} — ${a.hint}${isDone ? '' : ` (${count}/${a.goal})`}`
      })
      return { text: [`${c.name} · nivel ${lv} ${title(lv)} · ${pr.xp} XP · ${pr.unlocked.length}/${ACHIEVEMENTS.length} logros`, ...lines].join('\n') }
    }
    return {
      text: `${c.name} (nivel ${lv}, ${title(lv)}) está ${c.isEnabled ? 'visible' : 'oculta'}. Usa /mascota on|off|logros|nombre <nombre>.`,
    }
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
    await earn($, 'turns')
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
      await earn($, 'agents')
    }
    return r
  }).catch(($, e, next) => next(e)) // observar nunca impide que arranque

  on('tool.call', async ($, e, next) => {
    const { mood, detail } = moodForTool(e.tool, e as Record<string, unknown>)
    const agentId = e.agentId
    if (agentId) await patchWorker($, agentId, w => (w.status === 'running' ? { ...w, mood, detail } : w))
    else await setPet($, mood, detail)
    const started = await $.clock.now()
    const r = await next(e)
    const after: Mood = r.isError ? 'error' : 'thinking'
    const ms = (await $.clock.now()) - started
    await update($, toolStats, list => addCall(list, e.tool, ms, resultTokens(r.result), r.isError === true || r.deny !== undefined))
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
    // La experiencia, después de la cara: si sube de nivel, se le ve orgullosa.
    if (r.deny === undefined) {
      await earn($, r.isError ? 'errors' : 'tools')
      if (!r.isError && (e.tool === 'WebSearch' || e.tool === 'WebFetch')) await earn($, 'web')
      const command = (e as { command?: unknown }).command
      const kind = !r.isError && e.tool === 'Bash' && typeof command === 'string' ? bashKind(command) : undefined
      if (kind) await earn($, kind)
    }
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
      await flushProgress($)
    }
    return r
  })

  // Cada petición al modelo: modo ahorro a la ida, tokens a la vuelta.
  on('turn.step', async function* ($, e, next) {
    const [m, at] = await Promise.all([read($, mode), read($, saverAt)])
    const change = saverActive(m, lastPct, at) ? downgrade(e.model, e.effort) : undefined
    const r = yield* next(change ? { ...e, ...change } : e)
    const usage = r.usage
    if (usage) {
      await update($, tokens, t => addTokens(t, usage))
      const agentId = e.agentId
      if (agentId) await patchWorker($, agentId, w => ({ ...w, tokens: w.tokens + totalTokens(usage) }))
      // Por herramienta: lo de un subagente va a Agent; la salida de un paso, a lo que pidió.
      await update($, toolStats, list =>
        agentId ? addAgentTokens(list, totalTokens(usage)) : addStepOutput(list, r.toolUses.map(t => t.name), usage.output_tokens),
      )
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
    const [p, f, now, m, ws, pr, sa] = await Promise.all([
      read($, pet),
      read($, frame),
      $.clock.now(),
      read($, mode),
      read($, workers),
      read($, progress),
      read($, saverAt),
    ])
    return drawBand($.ui.resolve(e), {
      c,
      p,
      f,
      now,
      m,
      ws,
      pr,
      sa,
      lastPct,
      isCompact: e.props.bodyColumns < 60 || e.props.maxRows < 4,
      caress: () => void caress($),
    })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const [u, now, list, weekList, m, tok, turnList, ws, tf, p, ts, pr, mi, layoutCards, editing, sAt] = await Promise.all([
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
      read($, toolStats),
      read($, progress),
      read($, model),
      read($, cards),
      read($, isEditing),
      read($, saverAt),
    ])
    const pc0 = await read($, petConfig)
    const bodyWidth = e.props.bodyColumns || e.viewport?.columns || 60
    const L = layout(e.props.bodyColumns || e.viewport?.columns || 60, e.viewport?.rows ?? 40)
    const five = fiveHour(u)
    const week = u.rateLimits.find(r => r.kind === 'seven_day')
    const saving = saverActive(m, five?.percentUsed, sAt)
    return drawPane({
      ui,
      kit: makeKit(ui, L, now),
      L,
      now,
      bodyWidth,
      u,
      five,
      week,
      list,
      weekList,
      m,
      sAt,
      saving,
      tok,
      turnList,
      ws,
      tf,
      p,
      ts,
      pr,
      mi,
      layoutCards,
      editing,
      pc0,
      lastPct,
      setMode: next => setMode($, next),
      setCards: change => setCards($, change),
      setEditing: value => update($, isEditing, () => value),
    })
  })
}
