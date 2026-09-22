import { describe, expect, it } from 'vitest'
import { asContactId, asContactRewardId, asFishingSpotId, asRegionId } from '../ids'
import type { ContactReward } from './ContactReward'
import { isContactKnown, type ContactDefinition } from './Contact'

const captain: ContactDefinition = {
  id: asContactId('captain-taro'),
  regionId: asRegionId('tokyo-area'),
  name: 'Captain Taro',
  type: 'captain',
  role: 'チャーター船の船長',
  initiallyKnown: false,
  dataStatus: 'provisional',
}

const introduceReward: ContactReward = {
  id: asContactRewardId('buyer-introduces-captain'),
  contactId: asContactId('fish-wholesaler'),
  minTrust: 40,
  kind: 'introduce_contact',
  message: '知り合いの船長を紹介された',
  targetId: asContactId('captain-taro'),
}

const unrelatedReward: ContactReward = {
  id: asContactRewardId('unrelated-intel'),
  contactId: asContactId('fish-wholesaler'),
  minTrust: 10,
  kind: 'intel',
  message: 'この辺りは大型が出る',
}

describe('isContactKnown', () => {
  it('is always known when initiallyKnown is true, regardless of rewards', () => {
    const known: ContactDefinition = { ...captain, initiallyKnown: true }
    expect(isContactKnown(known, [], [])).toBe(true)
  })

  it('is unknown until the introduce_contact reward targeting it is claimed', () => {
    expect(isContactKnown(captain, [introduceReward, unrelatedReward], [])).toBe(false)
    expect(
      isContactKnown(
        captain,
        [introduceReward, unrelatedReward],
        [asContactRewardId('unrelated-intel')],
      ),
    ).toBe(false)
    expect(
      isContactKnown(
        captain,
        [introduceReward, unrelatedReward],
        [asContactRewardId('buyer-introduces-captain')],
      ),
    ).toBe(true)
  })

  it('ignores rewards that target a different contact', () => {
    const otherReward: ContactReward = {
      ...introduceReward,
      id: asContactRewardId('introduces-someone-else'),
      targetId: asContactId('some-other-guide'),
    }

    expect(isContactKnown(captain, [otherReward], [otherReward.id])).toBe(false)
  })
})

// discover_spot と混ざっても targetId の型比較が壊れないことの確認（Phase 17C）。
const discoverReward: ContactReward = {
  id: asContactRewardId('discover-hidden-spot'),
  contactId: asContactId('captain-taro'),
  minTrust: 20,
  kind: 'discover_spot',
  message: '穴場を教えてもらった',
  targetId: asFishingSpotId('hidden-offshore-bank'),
}

describe('isContactKnown with mixed reward kinds', () => {
  it('never treats a discover_spot reward as an introduction', () => {
    expect(isContactKnown(captain, [discoverReward], [discoverReward.id])).toBe(false)
  })
})
