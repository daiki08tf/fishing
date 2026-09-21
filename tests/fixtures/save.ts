import { asJobId } from '../../src/domain/ids'
import type { SaveGameV1 } from '../../src/domain/save/SaveGame'

/**
 * 検証用の最小 Save（schema v1）。
 * ゲームプレイ上の初期値ではない。テストで使う構造のサンプルである。
 */
export const createValidSaveV1 = (): SaveGameV1 => ({
  schemaVersion: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  progression: {
    anglerLevel: 1,
    anglerXp: 0,
    skillPoints: 0,
    skills: {
      casting: 0,
      lineControl: 0,
      hooking: 0,
      fighting: 0,
      landing: 0,
      detection: 0,
      rigging: 0,
    },
    reputation: 0,
    methodProficiency: {},
  },
  knowledge: { fish: {}, spots: {}, regions: {}, methods: {} },
  career: {
    jobId: asJobId('fixture-job'),
    careerLevel: 1,
    salaryBand: 1,
    workStyle: {
      remoteDays: 0,
      flexTime: false,
      overtimeLoad: 0,
      commuteMinutes: 45,
    },
    paidLeave: 0,
    careerXp: 0,
  },
  finance: {
    cash: 0,
    salaryIncome: 0,
    simplifiedLivingCost: 0,
  },
})
