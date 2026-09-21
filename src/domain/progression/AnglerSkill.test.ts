import { describe, expect, it } from 'vitest'
import {
  allocateSkillPoints,
  ANGLER_SKILL_MAX,
  emptyAnglerSkills,
  resetSkillAllocation,
  totalAllocatedSkillPoints,
} from './AnglerSkill'
import { ANGLER_SKILLS } from './PlayerProgression'

describe('angler skills', () => {
  it('starts every skill at zero', () => {
    const skills = emptyAnglerSkills()

    for (const skill of ANGLER_SKILLS) {
      expect(skills[skill]).toBe(0)
    }
    expect(totalAllocatedSkillPoints(skills)).toBe(0)
  })

  it('allocates a point and spends it', () => {
    const outcome = allocateSkillPoints({
      skills: emptyAnglerSkills(),
      skillPoints: 3,
      skill: 'fighting',
      amount: 2,
    })

    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.skills.fighting).toBe(2)
      expect(outcome.skillPoints).toBe(1)
    }
  })

  it('refuses to spend more points than are available', () => {
    const skills = emptyAnglerSkills()
    const outcome = allocateSkillPoints({ skills, skillPoints: 1, skill: 'casting', amount: 2 })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.reason).toBe('insufficient_skill_points')
      expect(outcome.skills).toBe(skills)
      expect(outcome.skillPoints).toBe(1)
    }
  })

  it('refuses to exceed the skill maximum', () => {
    const skills = { ...emptyAnglerSkills(), landing: ANGLER_SKILL_MAX }
    const outcome = allocateSkillPoints({
      skills,
      skillPoints: 5,
      skill: 'landing',
      amount: 1,
    })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.reason).toBe('skill_max_reached')
      expect(outcome.skills.landing).toBe(ANGLER_SKILL_MAX)
      expect(outcome.skillPoints).toBe(5)
    }
  })

  it('refuses invalid amounts', () => {
    for (const amount of [0, -1, 1.5, Number.NaN]) {
      const outcome = allocateSkillPoints({
        skills: emptyAnglerSkills(),
        skillPoints: 10,
        skill: 'hooking',
        amount,
      })

      expect(outcome.ok, `amount ${String(amount)} must be rejected`).toBe(false)
      if (!outcome.ok) {
        expect(outcome.reason).toBe('invalid_amount')
      }
    }
  })

  it('allows filling a skill exactly to the maximum', () => {
    const outcome = allocateSkillPoints({
      skills: { ...emptyAnglerSkills(), detection: ANGLER_SKILL_MAX - 3 },
      skillPoints: 10,
      skill: 'detection',
      amount: 3,
    })

    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.skills.detection).toBe(ANGLER_SKILL_MAX)
      expect(outcome.skillPoints).toBe(7)
    }
  })

  it('gives every allocated point back on reset', () => {
    const skills = { ...emptyAnglerSkills(), casting: 12, fighting: 8 }
    const reset = resetSkillAllocation({ skills, skillPoints: 3 })

    expect(reset.skillPoints).toBe(23)
    expect(totalAllocatedSkillPoints(reset.skills)).toBe(0)
  })
})
