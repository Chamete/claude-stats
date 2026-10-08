import type { CardId } from '../../types'
import { arrange } from '../cards'
import type { PaneData } from './kit'
import { editorCard } from './editor'
import { fiveCard } from './five'
import { petCard } from './pet'
import { priceCard } from './price'
import { saverCard } from './saver'
import { teamCard } from './team'
import { tokenCard } from './tokens'
import { toolsCard } from './tools'
import { turnsCard } from './turns'
import { weekCard } from './week'

export { makeKit } from './kit'
export type { PaneData } from './kit'

/** El panel /consumo: el equipo, el editor y las tarjetas en columnas, en el orden de cada persona. */
export function drawPane(d: PaneData) {
  const { ui: { Box, Text, Button }, L, layoutCards, editing } = d
  const team = teamCard(d)
  const editor = editorCard(d)
  // Columnas según el ancho y el orden que haya elegido cada persona.
  const byId: Record<CardId, JSX.Element> = {
    five: fiveCard(d),
    price: priceCard(d),
    week: weekCard(d),
    tokens: tokenCard(d),
    tools: toolsCard(d),
    turns: turnsCard(d),
    saver: saverCard(d),
    pet: petCard(d),
  }
  const columns = arrange(layoutCards, L.columns).map(ids => ids.map(id => byId[id]))
  const isEmpty = columns.every(c => c.length === 0)

  return (
    <Box flexDirection="column">
      {team}
      {editor}
      {isEmpty && <Text dimColor>Todas las tarjetas están ocultas: pulsa «⚙ Personalizar» o usa /tarjetas mostrar.</Text>}
      <Box flexDirection="row" gap={1}>
        {columns.map((cs, i) => (
          <Box key={`col-${i}`} flexDirection="column">
            {cs}
          </Box>
        ))}
      </Box>
      {!editing && (
        <Box flexDirection="row">
          <Button key="personalizar" label="⚙ Personalizar" plain dimColor onPress={() => d.setEditing(true)} />
        </Box>
      )}
    </Box>
  )
}
