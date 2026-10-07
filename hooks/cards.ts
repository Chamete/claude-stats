import type { CardId, CardLayout } from '../types'

/** Las tarjetas del panel, con los nombres con que se pueden escribir en /tarjetas. */
export const CARDS: readonly { id: CardId; emoji: string; name: string; aliases: readonly string[] }[] = [
  { id: 'five', emoji: '⏱', name: 'Ventana de 5 h', aliases: ['5h', 'ventana', 'cinco'] },
  { id: 'price', emoji: '💲', name: 'Precio', aliases: ['precio', 'coste', 'sesion', 'sesión'] },
  { id: 'week', emoji: '📅', name: 'Semana', aliases: ['semana', 'semanal', '7d'] },
  { id: 'tokens', emoji: '🔢', name: 'Tokens', aliases: ['tokens'] },
  { id: 'tools', emoji: '🧰', name: 'Tokens por herramienta', aliases: ['herramientas', 'herramienta', 'tools'] },
  { id: 'turns', emoji: '💬', name: 'Últimos prompts', aliases: ['prompts', 'ultimos', 'últimos'] },
  { id: 'saver', emoji: '🧠', name: 'Modelo y ahorro', aliases: ['modelo', 'ahorro'] },
  { id: 'pet', emoji: '🏆', name: 'Progreso', aliases: ['progreso', 'mascota', 'nivel', 'logros'] },
]

export const DEFAULT_ORDER: readonly CardId[] = CARDS.map(c => c.id)
export const DEFAULT_LAYOUT: CardLayout = { order: [...DEFAULT_ORDER], hidden: [] }

export function cardInfo(id: CardId) {
  return CARDS.find(c => c.id === id)!
}

/** El id de una tarjeta a partir de lo que escribe la persona, o undefined. */
export function cardId(word: string): CardId | undefined {
  const w = word.trim().toLowerCase()
  return CARDS.find(c => c.id === w || c.aliases.includes(w))?.id
}

/** Deja el orden con todas las tarjetas una vez, aunque venga de una versión con otras. */
export function normalize(layout: Partial<CardLayout> | undefined): CardLayout {
  const known = new Set<string>(DEFAULT_ORDER)
  const order = (Array.isArray(layout?.order) ? layout.order : []).filter(
    (id, i, all): id is CardId => known.has(id) && all.indexOf(id) === i,
  )
  for (const id of DEFAULT_ORDER) if (!order.includes(id)) order.push(id)
  const hidden = (Array.isArray(layout?.hidden) ? layout.hidden : []).filter((id): id is CardId => known.has(id))
  return { order, hidden: [...new Set(hidden)] }
}

export function isDefaultOrder(layout: CardLayout): boolean {
  return layout.order.every((id, i) => id === DEFAULT_ORDER[i])
}

/** Sube (-1) o baja (+1) una tarjeta un puesto. */
export function move(layout: CardLayout, id: CardId, delta: -1 | 1): CardLayout {
  const order = [...layout.order]
  const i = order.indexOf(id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= order.length) return layout
  ;[order[i], order[j]] = [order[j]!, order[i]!]
  return { ...layout, order }
}

export function toggle(layout: CardLayout, id: CardId): CardLayout {
  const hidden = layout.hidden.includes(id) ? layout.hidden.filter(h => h !== id) : [...layout.hidden, id]
  return { ...layout, hidden }
}

/** Las tarjetas nombradas van primero, en ese orden; las demás siguen detrás como estaban. */
export function reorder(layout: CardLayout, first: readonly CardId[]): CardLayout {
  const unique = [...new Set(first)]
  return { ...layout, order: [...unique, ...layout.order.filter(id => !unique.includes(id))] }
}

/**
 * Reparte las tarjetas visibles en columnas. Con el orden de siempre se usa el
 * reparto pensado para cada ancho; con un orden propio se leen de izquierda a
 * derecha y de arriba abajo.
 */
export function arrange(layout: CardLayout, columns: 1 | 2 | 3): CardId[][] {
  const visible = (ids: readonly CardId[]) => ids.filter(id => !layout.hidden.includes(id))
  if (columns === 1) return [visible(layout.order)]
  if (isDefaultOrder(layout)) {
    const preset: CardId[][] =
      columns === 3
        ? [
            ['five', 'week', 'tools'],
            ['price', 'tokens', 'pet'],
            ['turns', 'saver'],
          ]
        : [
            ['five', 'week', 'saver', 'pet'],
            ['price', 'tokens', 'turns', 'tools'],
          ]
    return preset.map(visible)
  }
  const cols: CardId[][] = Array.from({ length: columns }, () => [])
  visible(layout.order).forEach((id, i) => cols[i % columns]!.push(id))
  return cols
}
