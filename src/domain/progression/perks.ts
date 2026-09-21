import type { AnglerProgression } from './AnglerProgression'
import type { AnglerSkill } from './PlayerProgression'

/**
 * Perk（PROGRESSION.md §5）。
 *
 * Perk は魔法ではない。経験・技術として説明できるものに限定する。
 * 解禁条件は「Level + Skill」の表で持ち、Perk を増やしても
 * FishingEngine は変わらない（効果は playerFishingModifiers 側の表で解決する）。
 */

export const PERK_IDS = [
  'accurate_cast',
  'line_sense',
  'drag_control',
  'efficient_rigging',
  'big_fish_control',
  'quick_landing',
] as const

export type PerkId = (typeof PERK_IDS)[number]

export type PerkDefinition = {
  readonly id: PerkId
  readonly name: string
  readonly summary: string
  readonly requiredLevel: number
  readonly requiredSkill?: {
    readonly skill: AnglerSkill
    readonly value: number
  }
}

export const PERK_DEFINITIONS: Readonly<Record<PerkId, PerkDefinition>> = {
  accurate_cast: {
    id: 'accurate_cast',
    name: 'Accurate Cast',
    summary: 'キャストの精度が上がる',
    requiredLevel: 5,
    requiredSkill: { skill: 'casting', value: 10 },
  },
  line_sense: {
    id: 'line_sense',
    name: 'Line Sense',
    summary: '小さなアタリに気づきやすくなる',
    requiredLevel: 8,
    requiredSkill: { skill: 'detection', value: 15 },
  },
  drag_control: {
    id: 'drag_control',
    name: 'Drag Control',
    summary: 'ドラグの許容範囲が広がる',
    requiredLevel: 12,
    requiredSkill: { skill: 'lineControl', value: 20 },
  },
  efficient_rigging: {
    id: 'efficient_rigging',
    name: 'Efficient Rigging',
    summary: '仕掛けの扱いが速く正確になる',
    requiredLevel: 15,
    requiredSkill: { skill: 'rigging', value: 15 },
  },
  big_fish_control: {
    id: 'big_fish_control',
    name: 'Big Fish Control',
    summary: '大型魚の急な走りに対応しやすくなる',
    requiredLevel: 25,
    requiredSkill: { skill: 'fighting', value: 30 },
  },
  quick_landing: {
    id: 'quick_landing',
    name: 'Quick Landing',
    summary: '取り込みが安定する',
    requiredLevel: 30,
    requiredSkill: { skill: 'landing', value: 25 },
  },
}

export const isPerkUnlockable = (
  definition: PerkDefinition,
  progression: AnglerProgression,
): boolean => {
  if (progression.unlockedPerks.includes(definition.id)) {
    return false
  }

  if (progression.anglerLevel < definition.requiredLevel) {
    return false
  }

  const requirement = definition.requiredSkill

  if (requirement !== undefined && progression.skills[requirement.skill] < requirement.value) {
    return false
  }

  return true
}

/** 条件を満たしているが、まだ解禁していない Perk。 */
export const unlockablePerks = (progression: AnglerProgression): readonly PerkId[] =>
  PERK_IDS.filter((id) => isPerkUnlockable(PERK_DEFINITIONS[id], progression))

export const lockedPerks = (progression: AnglerProgression): readonly PerkId[] =>
  PERK_IDS.filter((id) => !progression.unlockedPerks.includes(id))

/** 条件を満たした Perk を解禁する。解禁した一覧を返す。 */
export const unlockPerks = (
  progression: AnglerProgression,
): { readonly progression: AnglerProgression; readonly unlocked: readonly PerkId[] } => {
  const unlocked = unlockablePerks(progression)

  if (unlocked.length === 0) {
    return { progression, unlocked }
  }

  return {
    progression: { ...progression, unlockedPerks: [...progression.unlockedPerks, ...unlocked] },
    unlocked,
  }
}
