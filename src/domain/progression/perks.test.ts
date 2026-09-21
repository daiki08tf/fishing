import { describe, expect, it } from 'vitest'
import { createInitialProgression } from './AnglerProgression'
import {
  isPerkUnlockable,
  lockedPerks,
  PERK_DEFINITIONS,
  PERK_IDS,
  unlockablePerks,
  unlockPerks,
} from './perks'

describe('perks', () => {
  it('unlocks nothing at the start', () => {
    expect(unlockablePerks(createInitialProgression())).toEqual([])
    expect(lockedPerks(createInitialProgression())).toHaveLength(PERK_IDS.length)
  })

  it('requires both the level and the skill', () => {
    const definition = PERK_DEFINITIONS.accurate_cast
    const base = createInitialProgression()

    expect(isPerkUnlockable(definition, { ...base, anglerLevel: 4 })).toBe(false)
    expect(
      isPerkUnlockable(definition, {
        ...base,
        anglerLevel: 5,
        skills: { ...base.skills, casting: 9 },
      }),
    ).toBe(false)
    expect(
      isPerkUnlockable(definition, {
        ...base,
        anglerLevel: 5,
        skills: { ...base.skills, casting: 10 },
      }),
    ).toBe(true)
  })

  it('unlocks perks whose conditions are met', () => {
    const base = createInitialProgression()
    const progression = {
      ...base,
      anglerLevel: 8,
      skills: { ...base.skills, casting: 10, detection: 15 },
    }

    expect([...unlockablePerks(progression)].sort()).toEqual(['accurate_cast', 'line_sense'])

    const result = unlockPerks(progression)
    expect([...result.unlocked].sort()).toEqual(['accurate_cast', 'line_sense'])
    expect(result.progression.unlockedPerks).toHaveLength(2)
  })

  it('does not unlock the same perk twice', () => {
    const base = createInitialProgression()
    const progression = {
      ...base,
      anglerLevel: 8,
      skills: { ...base.skills, casting: 10 },
    }
    const first = unlockPerks(progression)
    const second = unlockPerks(first.progression)

    expect(first.unlocked).toEqual(['accurate_cast'])
    expect(second.unlocked).toEqual([])
    expect(second.progression.unlockedPerks).toEqual(['accurate_cast'])
  })

  it('keeps later perks locked until the higher levels', () => {
    const base = createInitialProgression()
    const progression = {
      ...base,
      anglerLevel: 20,
      skills: { ...base.skills, fighting: 30 },
    }

    // レベル不足（25）なのでまだ解禁されない。
    expect(unlockablePerks(progression)).not.toContain('big_fish_control')
    expect(unlockablePerks({ ...progression, anglerLevel: 25 })).toContain('big_fish_control')
  })

  it('describes every perk in plain fishing terms', () => {
    for (const id of PERK_IDS) {
      const definition = PERK_DEFINITIONS[id]

      expect(definition.name.length).toBeGreaterThan(0)
      expect(definition.summary.length).toBeGreaterThan(0)
      expect(definition.requiredLevel).toBeGreaterThan(0)
    }
  })
})
