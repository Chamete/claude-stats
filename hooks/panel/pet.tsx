import { ACHIEVEMENTS, levelOf, levelProgress, nextAchievement, title } from '../progress'
import type { PaneData } from './kit'

/** La mascota: nivel, experiencia y logros. */
export function petCard(d: PaneData) {
  const { ui: { Text, Box }, kit: { card, meter }, L, pr, pc0 } = d
  const { inner } = L
  // La mascota: nivel, experiencia y logros.
  const lv = levelOf(pr.xp)
  const nextA = nextAchievement(pr)
  return card(
    'pet',
    `🏆  ${pc0.name}`,
    'warning',
    <Box flexDirection="row" justifyContent="space-between" width={inner}>
      <Text bold color="warning">
        {`Nivel ${lv} · ${title(lv)}`}
      </Text>
      <Text dimColor>{pr.xp} XP</Text>
    </Box>,
    <Box flexDirection="row" gap={1}>
      {meter(levelProgress(pr.xp), Math.max(6, inner - 6), 'warning')}
      <Text dimColor>{`${levelProgress(pr.xp)}%`.padStart(4)}</Text>
    </Box>,
    <Text wrap="truncate">
      {pr.unlocked.length}/{ACHIEVEMENTS.length} logros{' '}
      {ACHIEVEMENTS.filter(a => pr.unlocked.includes(a.id)).map(a => a.emoji).join(' ')}
    </Text>,
    nextA && (
      <Text dimColor wrap="truncate">
        Próximo: {nextA.a.name} — {nextA.a.hint} ({Math.min(nextA.count, nextA.a.goal)}/{nextA.a.goal})
      </Text>
    ),
  )
}
