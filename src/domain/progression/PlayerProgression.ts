/**
 * Angler の成長状態。DATA_MODEL.md §11 に対応する。
 *
 * Skill は操作の成功そのものを置き換えない。
 * 改善してよい対象（casting accuracy / timing window / line・tension tolerance /
 * detection clarity / rigging efficiency）と禁止事項は DECISIONS.md §3 に従う。
 */
export const ANGLER_SKILLS = [
  'casting',
  'lineControl',
  'hooking',
  'fighting',
  'landing',
  'detection',
  'rigging',
] as const

export type AnglerSkill = (typeof ANGLER_SKILLS)[number]

export type AnglerSkills = {
  readonly [Skill in AnglerSkill]: number
}

export type PlayerProgression = {
  readonly anglerLevel: number
  readonly anglerXp: number
  readonly skillPoints: number
  readonly skills: AnglerSkills
  readonly reputation: number
  readonly methodProficiency: Readonly<Record<string, number>>
}
