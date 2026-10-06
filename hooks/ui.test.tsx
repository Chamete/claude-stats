import type { On } from 'claude-code'
import { test, expect } from 'claude-code/testing'

const USAGE = {
  startedAt: 0,
  context: { window: 200_000, tokens: 70_000, percent: 35 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 62, resetsAt: '2099-01-01T00:00:00Z' },
    { kind: 'seven_day', percentUsed: 31, resetsAt: '2099-01-03T00:00:00Z' },
  ],
  cost: { usd: 1.23 },
}

const NOW = Date.parse('2098-12-31T22:00:00Z')

/** Lo que el motor respondería: uso, reloj y almacén. */
function engine(on: On) {
  on('session.usage', () => ({ value: USAGE }))
  on('clock.now', () => ({ value: NOW }))
  on('store.set', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
}

const scroll = { offset: 0, height: 0, viewport: 0 } as never

for (const surface of ['terminal', 'desktop'] as const) {
  test(`el panel se dibuja en ${surface}`, async ($, on) => {
    engine(on)
    for (const columns of [36, 60, 120, 180]) {
      const pane = await $.ui.mount({
        plugin: 'consumo',
        surface,
        component: 'Pane',
        requestId: 'consumo',
        props: { title: 'Consumo', isFocused: true, bodyColumns: columns } as never,
        viewport: { columns, rows: columns < 50 ? 20 : 40 },
      })
      expect(await pane.find({ key: 'modo-auto' })).toBeDefined()
      expect(JSON.stringify(await pane.drawn())).toContain('Precio de la sesión')
      await pane.press({ key: 'modo-on' })
      expect(await pane.find({ key: 'modo-on' })).toBeDefined()
      await pane.unmount()
    }
  })

  test(`la mascota se dibuja en ${surface} y responde a la caricia`, async ($, on) => {
    engine(on)
    const band = await $.ui.mount({
      plugin: 'consumo',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll } as never,
    })
    expect(await band.find({ key: 'acariciar' })).toBeDefined()
    await band.press({ key: 'acariciar' })
    expect(JSON.stringify(await band.drawn())).toContain('Gracias')
  })
}

test('la mascota se llama NeuroSigma y tiene versión compacta', async ($, on) => {
  engine(on)
  for (const bodyColumns of [100, 40]) {
    const band = await $.ui.mount({
      plugin: 'consumo',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns, scroll } as never,
    })
    const text = JSON.stringify(await band.drawn())
    if (bodyColumns === 100) expect(text).toContain('NeuroSigma')
    expect(await band.find({ key: 'acariciar' })).toBeDefined()
    await band.unmount()
  }
})

test('un subagente aparece en el panel y en la banda, con su cable', async ($, on) => {
  engine(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'sub-1' }))
  await $.agent.spawn({ prompt: 'Busca useAuth', description: 'Buscar useAuth', subagentType: 'Explore' } as never)
  for (const columns of [30, 50, 80, 140]) {
    const pane = await $.ui.mount({
      plugin: 'consumo',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'consumo',
      props: { title: 'Consumo', isFocused: true, bodyColumns: columns } as never,
      viewport: { columns, rows: 50 },
    })
    const drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('Equipo')
    // En estrecho el nombre se recorta con "…" en vez de saltar de línea.
    expect(drawn).toContain(columns >= 50 ? 'Explorador' : 'Explora…')
    expect(drawn).toContain('Coordinando a 1 subagente')
    await pane.unmount()
  }
  const band = await $.ui.mount({
    plugin: 'consumo',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100, scroll } as never,
  })
  const text = JSON.stringify(await band.drawn())
  expect(text).toContain('equipo')
  expect(text).toContain('Coordinando')
})
