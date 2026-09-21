import type { FishSpecies } from '../../src/domain/fish/FishSpecies'
import { asFishSpeciesId, asRegionId } from '../../src/domain/ids'

/**
 * テスト用の魚種。現実の魚ではない。
 * 釣りの状態機械とファイトの検証に必要な最小の形だけを持つ。
 */
export const createTestSpecies = (overrides: Partial<FishSpecies> = {}): FishSpecies => ({
  id: asFishSpeciesId('test-species'),
  japaneseName: 'テスト魚',
  waterTypes: ['salt'],
  distribution: [asRegionId('test-region')],
  habitats: ['test-habitat'],
  lengthModel: { meanCm: 25, standardDeviationCm: 3, minCm: 12, maxCm: 40 },
  weightModel: { lengthWeightA: 0.01, lengthWeightB: 3 },
  fightProfile: { strength: 0.5, stamina: 0.5, speed: 0.5 },
  rarity: 1,
  ...overrides,
})
