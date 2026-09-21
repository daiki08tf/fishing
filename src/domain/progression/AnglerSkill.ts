import { ANGLER_SKILLS, type AnglerSkill, type AnglerSkills } from './PlayerProgression'

/**
 * 7 つの Skill。PROGRESSION.md §3 / §4 に対応する。
 *
 * Level とは別軸。Skill Point を割り振って伸ばす。
 * MVP では振り直し可能（DECISIONS.md §2）。
 */

export const ANGLER_SKILL_MIN = 0
export const ANGLER_SKILL_MAX = 100

export const emptyAnglerSkills = (): AnglerSkills => {
  const skills = {} as Record<AnglerSkill, number>

  for (const skill of ANGLER_SKILLS) {
    skills[skill] = ANGLER_SKILL_MIN
  }

  return skills
}

export const totalAllocatedSkillPoints = (skills: AnglerSkills): number => {
  let total = 0

  for (const skill of ANGLER_SKILLS) {
    total += skills[skill]
  }

  return total
}

export const clampSkillValue = (value: number): number =>
  Math.min(ANGLER_SKILL_MAX, Math.max(ANGLER_SKILL_MIN, Math.trunc(value)))

export type SkillAllocationFailure =
  'invalid_amount' | 'insufficient_skill_points' | 'skill_max_reached'

export type SkillAllocationOutcome =
  | {
      readonly ok: true
      readonly skills: AnglerSkills
      readonly skillPoints: number
    }
  | {
      readonly ok: false
      readonly reason: SkillAllocationFailure
      readonly skills: AnglerSkills
      readonly skillPoints: number
    }

/**
 * Skill Point を割り振る。
 *
 * 不正な割り振りは状態を変えずに拒否する:
 * - 0 以下・整数でない量
 * - 保有 Point を超える
 * - 最大値を超える
 */
export const allocateSkillPoints = (options: {
  readonly skills: AnglerSkills
  readonly skillPoints: number
  readonly skill: AnglerSkill
  readonly amount: number
}): SkillAllocationOutcome => {
  const { skills, skillPoints, skill } = options
  const amount = options.amount
  const current = skills[skill]

  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, reason: 'invalid_amount', skills, skillPoints }
  }

  if (amount > skillPoints) {
    return { ok: false, reason: 'insufficient_skill_points', skills, skillPoints }
  }

  if (current + amount > ANGLER_SKILL_MAX) {
    return { ok: false, reason: 'skill_max_reached', skills, skillPoints }
  }

  return {
    ok: true,
    skills: { ...skills, [skill]: clampSkillValue(current + amount) },
    skillPoints: skillPoints - amount,
  }
}

/**
 * 割り振りをやり直す（MVP の仕様。DECISIONS.md §2）。
 * 使った Point をすべて戻す。
 */
export const resetSkillAllocation = (options: {
  readonly skills: AnglerSkills
  readonly skillPoints: number
}): { readonly skills: AnglerSkills; readonly skillPoints: number } => ({
  skills: emptyAnglerSkills(),
  skillPoints: options.skillPoints + totalAllocatedSkillPoints(options.skills),
})
