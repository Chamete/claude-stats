import { SAVER_MODEL, downgrade, modeText, modelFamily, modelName } from '../format'
import type { PaneData } from './kit'

/** Modelo y ahorro: el modelo que responde ahora y los botones del modo ahorro. */
export function saverCard(d: PaneData) {
  const { ui: { Box, Text, Button }, kit: { card }, L, m, sAt, saving, mi } = d
  const { inner } = L
  // El modelo: el de la sesión y, si el ahorro lo cambia, el que responde de verdad.
  const sessionModel = mi.session
  const effective = saving ? (downgrade(sessionModel ?? '', undefined)?.model ?? sessionModel) : sessionModel
  const isRedirected = modelFamily(effective) !== modelFamily(sessionModel)
  return card(
    'saver',
    '🧠  Modelo y ahorro',
    saving ? 'success' : 'subtle',
    <Box flexDirection="row" gap={1} width={inner} overflow="hidden">
      <Text dimColor>Modelo</Text>
      <Text bold color={isRedirected ? 'success' : 'claude'} wrap="truncate">
        {modelName(effective)}
      </Text>
      {isRedirected && <Text color="success">🌱</Text>}
    </Box>,
    <Text color={saving ? 'success' : undefined} dimColor={!saving}>
      {saving ? `Activo: Opus → ${SAVER_MODEL}${L.isCompact ? '' : ', esfuerzo medio'}` : `Inactivo (${modeText(m, sAt)})`}
    </Text>,
    <Box flexDirection="row" flexWrap="wrap" gap={1}>
      <Button key="modo-auto" hotkey="a" label="Auto" variant={m === 'auto' ? 'primary' : undefined} onPress={() => d.setMode('auto')} />
      <Button key="modo-on" hotkey="e" label="Encendido" variant={m === 'on' ? 'primary' : undefined} onPress={() => d.setMode('on')} />
      <Button key="modo-off" hotkey="o" label="Apagado" variant={m === 'off' ? 'primary' : undefined} onPress={() => d.setMode('off')} />
    </Box>,
  )
}
