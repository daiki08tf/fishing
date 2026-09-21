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
  lengthModel: {
    kind: 'normal',
    meanCm: 25,
    standardDeviationCm: 3,
    minCm: 12,
    maxCm: 40,
  },
  weightModel: { lengthWeightA: 0.01, lengthWeightB: 3 },
  conditionModel: { variability: 0.5 },
  fightProfile: { strength: 0.5, stamina: 0.5, speed: 0.5 },
  rarity: 1,
  ...overrides,
})

/**
 * 大型魚のテスト用魚種（現実の魚ではない）。
 *
 * Phase 10 の Text Fishing Battle では、小型魚のファイトは 1〜3 コマンドで終わる。
 * 「テンション / フック保持 / 距離」の駆け引きを検証するには、
 * ある程度の大きさ（初期距離・引きの強さ）を持つ魚が必要になる。
 */
export const createBigTestSpecies = (overrides: Partial<FishSpecies> = {}): FishSpecies =>
  createTestSpecies({
    id: asFishSpeciesId('test-big-species'),
    japaneseName: 'テスト大型魚',
    lengthModel: {
      kind: 'normal',
      meanCm: 95,
      standardDeviationCm: 6,
      minCm: 80,
      maxCm: 120,
    },
    conditionModel: { variability: 0.3 },
    fightProfile: { strength: 0.8, stamina: 0.8, speed: 0.7 },
    ...overrides,
  })
