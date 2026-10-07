import { test, expect } from 'claude-code/testing'
import { DEFAULT_LAYOUT, arrange, cardId, move, normalize, reorder, toggle } from './cards'

test('nombres que se pueden escribir', () => {
  expect(cardId('Progreso')).toBe('pet')
  expect(cardId('5h')).toBe('five')
  expect(cardId('herramientas')).toBe('tools')
  expect(cardId('nada')).toBeUndefined()
})

test('ordenar, mover y ocultar', () => {
  const mine = reorder(DEFAULT_LAYOUT, ['pet', 'five', 'week', 'price', 'tokens', 'tools', 'turns', 'saver'])
  expect(mine.order).toEqual(['pet', 'five', 'week', 'price', 'tokens', 'tools', 'turns', 'saver'])
  // De izquierda a derecha y de arriba abajo.
  expect(arrange(mine, 2)).toEqual([
    ['pet', 'week', 'tokens', 'turns'],
    ['five', 'price', 'tools', 'saver'],
  ])
  expect(move(mine, 'five', -1).order.slice(0, 2)).toEqual(['five', 'pet'])
  expect(move(mine, 'pet', -1)).toBe(mine)
  const quiet = toggle(toggle(mine, 'tokens'), 'tools')
  expect(arrange(quiet, 1)[0]).toEqual(['pet', 'five', 'week', 'price', 'turns', 'saver'])
  expect(toggle(quiet, 'tokens').hidden).toEqual(['tools'])
  // Con el orden de siempre se mantiene el reparto pensado para cada ancho.
  expect(arrange(DEFAULT_LAYOUT, 3)[0]).toEqual(['five', 'week', 'tools'])
})

test('un orden guardado incompleto o con restos se arregla', () => {
  const n = normalize({ order: ['pet', 'pet', 'nada' as never], hidden: ['tokens', 'nada' as never] })
  expect(n.order[0]).toBe('pet')
  expect(n.order).toHaveLength(8)
  expect(n.hidden).toEqual(['tokens'])
  expect(normalize(undefined)).toEqual(DEFAULT_LAYOUT)
})
