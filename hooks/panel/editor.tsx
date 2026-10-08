import { CARDS, DEFAULT_LAYOUT, cardInfo, move, toggle } from '../cards'
import type { PaneData } from './kit'

/** El editor de tarjetas: cada una con sus botones para moverla y ocultarla. */
export function editorCard(d: PaneData) {
  const { ui: { Box, Text, Button }, L, bodyWidth, editing, layoutCards } = d
  // El editor: cada tarjeta con sus botones para moverla y ocultarla.
  const editorWidth = Math.min(bodyWidth, Math.max(L.cardWidth, 56))
  const rowNameWidth = Math.max(...CARDS.map(c => c.name.length)) + 1
  return editing && (
    <Box key="editor" flexDirection="column" borderStyle="round" borderColor="suggestion" paddingX={1} width={editorWidth}>
      <Text bold color="suggestion">
        ⚙  Personalizar tarjetas
      </Text>
      <Text dimColor wrap="truncate">
        Se colocan de izquierda a derecha y de arriba abajo.
      </Text>
      {layoutCards.order.map((id, i) => {
        const info = cardInfo(id)
        const isHidden = layoutCards.hidden.includes(id)
        return (
          <Box key={`fila-${id}`} flexDirection="row" gap={1}>
            <Text dimColor>{String(i + 1).padStart(2)}</Text>
            {/* Columnas de ancho fijo: los emojis no miden lo mismo y los botones quedarían torcidos. */}
            <Box width={3}>
              <Text dimColor={isHidden}>{info.emoji}</Text>
            </Box>
            <Box width={rowNameWidth}>
              <Text bold={!isHidden} dimColor={isHidden} wrap="truncate">
                {info.name}
              </Text>
            </Box>
            {i > 0 ? (
              <Button key={`subir-${id}`} label="↑" onPress={() => d.setCards(c => move(c, id, -1))} />
            ) : (
              <Text>{'     '}</Text>
            )}
            {i < layoutCards.order.length - 1 ? (
              <Button key={`bajar-${id}`} label="↓" onPress={() => d.setCards(c => move(c, id, 1))} />
            ) : (
              <Text>{'     '}</Text>
            )}
            <Button
              key={`ver-${id}`}
              label={isHidden ? 'Mostrar' : 'Ocultar'}
              variant={isHidden ? 'primary' : undefined}
              onPress={() => d.setCards(c => toggle(c, id))}
            />
          </Box>
        )
      })}
      <Box flexDirection="row" gap={1} marginTop={1}>
        <Button key="tarjetas-listo" hotkey="l" label="Listo" variant="primary" onPress={() => d.setEditing(false)} />
        <Button key="tarjetas-restablecer" hotkey="r" label="Restablecer" onPress={() => d.setCards(() => DEFAULT_LAYOUT)} />
      </Box>
    </Box>
  )
}
