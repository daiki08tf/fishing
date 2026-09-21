import {
  ADDITIVE_MODIFIER_KEYS,
  FISHING_MODIFIER_KEYS,
  NEUTRAL_FISHING_MODIFIERS,
  type FishingModifierKey,
  type PlayerFishingModifiers,
} from '../fishing/PlayerFishingModifiers'
import type { PerkId } from './perks'
import type { AnglerSkill, AnglerSkills } from './PlayerProgression'

/**
 * Skill / Perk を Fishing Engine が使う倍率へ解決する。
 *
 *   Skill → Resolver → PlayerFishingModifiers → FishingEngine
 *
 * FishingEngine は Skill 名も Perk 名も知らない。
 * ここに表を足せば、Engine を変えずに効果を増やせる。
 *
 * 数値はすべて PROVISIONAL。DECISIONS.md §3 の範囲
 * （操作の成功を置き換えず、操作しやすさだけを動かす）に収めている。
 */

/** 倍率への寄与（0〜100 の Skill 値を 0〜1 に正規化して掛ける）。 */
export type ModifierDeltas = Partial<Record<FishingModifierKey, number>>

export const SKILL_MODIFIERS: Readonly<Record<AnglerSkill, ModifierDeltas>> = {
  // Casting: Phase 3 では将来用の interface。
  casting: { castingPrecisionMultiplier: 0.3 },
  // Line Control: テンションの上がり方を抑え、GIVE の効きを上げる。
  lineControl: { tensionGainMultiplier: -0.25, giveEfficiencyMultiplier: 0.25 },
  // Hooking: アワセの受付時間を広げる。
  hooking: { hookWindowMultiplier: 0.5, hookSuccessModifier: 0.1 },
  // Fighting: REEL の効率を上げる。
  fighting: { reelEfficiencyMultiplier: 0.3 },
  // Landing: Phase 3 では将来用の interface。
  landing: { landingStabilityMultiplier: 0.3 },
  // Detection: アタリの見え方（UI 補助）に効く。
  detection: { detectionClarityMultiplier: 0.4 },
  // Rigging: Phase 3 では将来用の interface。
  rigging: { riggingEfficiencyMultiplier: 0.35 },
}

export const PERK_MODIFIERS: Readonly<Record<PerkId, ModifierDeltas>> = {
  accurate_cast: { castingPrecisionMultiplier: 0.2 },
  line_sense: { detectionClarityMultiplier: 0.2 },
  drag_control: { tensionGainMultiplier: -0.05, giveEfficiencyMultiplier: 0.05 },
  efficient_rigging: { riggingEfficiencyMultiplier: 0.2 },
  big_fish_control: { reelEfficiencyMultiplier: 0.1 },
  quick_landing: { landingStabilityMultiplier: 0.15 },
}

const applyDeltas = (
  modifiers: PlayerFishingModifiers,
  deltas: ModifierDeltas,
  weight: number,
): PlayerFishingModifiers => {
  const next: Record<FishingModifierKey, number> = { ...modifiers }

  for (const key of Object.keys(deltas) as FishingModifierKey[]) {
    const delta = deltas[key]

    if (delta === undefined) {
      continue
    }

    if (ADDITIVE_MODIFIER_KEYS.includes(key)) {
      next[key] += delta * weight
      continue
    }

    next[key] *= 1 + delta * weight
  }

  return next
}

export const resolveFishingModifiers = (options: {
  readonly skills: AnglerSkills
  readonly perks: readonly PerkId[]
}): PlayerFishingModifiers => {
  let modifiers = NEUTRAL_FISHING_MODIFIERS

  for (const skill of Object.keys(options.skills) as AnglerSkill[]) {
    modifiers = applyDeltas(
      modifiers,
      SKILL_MODIFIERS[skill],
      Math.min(1, Math.max(0, options.skills[skill] / 100)),
    )
  }

  for (const perk of options.perks) {
    modifiers = applyDeltas(modifiers, PERK_MODIFIERS[perk], 1)
  }

  // 倍率が 0 以下にならないようにする（マイナス効果の積み重ね対策）。
  const clamped: Record<FishingModifierKey, number> = { ...modifiers }

  for (const key of FISHING_MODIFIER_KEYS) {
    if (!ADDITIVE_MODIFIER_KEYS.includes(key)) {
      clamped[key] = Math.max(0.1, clamped[key])
    }
  }

  return clamped
}

/** UI 表示用の要約。 */
export const describeFishingModifiers = (modifiers: PlayerFishingModifiers): readonly string[] => {
  const percent = (value: number): string => `${Math.round((value - 1) * 100)}%`
  const lines: string[] = []

  if (modifiers.reelEfficiencyMultiplier !== 1) {
    lines.push(`REEL 効率 ${percent(modifiers.reelEfficiencyMultiplier)}`)
  }
  if (modifiers.tensionGainMultiplier !== 1) {
    lines.push(`テンション上昇 ${percent(modifiers.tensionGainMultiplier)}`)
  }
  if (modifiers.giveEfficiencyMultiplier !== 1) {
    lines.push(`GIVE 効率 ${percent(modifiers.giveEfficiencyMultiplier)}`)
  }
  if (modifiers.hookWindowMultiplier !== 1) {
    lines.push(`アワセ猶予 ${percent(modifiers.hookWindowMultiplier)}`)
  }
  if (modifiers.detectionClarityMultiplier !== 1) {
    lines.push(`アタリの見え方 ${percent(modifiers.detectionClarityMultiplier)}`)
  }

  return lines
}
