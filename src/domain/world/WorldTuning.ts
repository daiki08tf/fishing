import type { WorldTime } from './WorldTime'

/**
 * PROVISIONAL — World（時間・釣行）の調整値。
 *
 * 現実の所要時間ではなく「ゲームとしての手応え」で決めた値。
 * 将来は釣法・Spot・Skill などで変化させられるようにする。
 */

export type WorldTuning = {
  /** ゲーム開始時の日時（自宅にいる）。 */
  readonly startTime: WorldTime
  readonly homeLocationId: string
  readonly homeLocationName: string

  /** 1 回の釣り（キャスト〜結果）で消費するゲーム内時間。 */
  readonly fishingAttemptMinutes: number

  /** Spot Knowledge の増え方。 */
  readonly firstVisitKnowledge: number
  readonly firstVisitRegionKnowledge: number
  readonly fishingAttemptKnowledge: number
  readonly fishingAttemptRegionKnowledge: number
  readonly catchKnowledge: number
  readonly knowledgeMax: number
}

export const DEFAULT_WORLD_TUNING: WorldTuning = {
  // 2026-05-02 は土曜日。休日の朝から始める。
  startTime: { year: 2026, month: 5, day: 2, hour: 6, minute: 0 },
  homeLocationId: 'tokyo-area-home',
  homeLocationName: 'Tokyo Area Home',

  fishingAttemptMinutes: 20,

  firstVisitKnowledge: 15,
  firstVisitRegionKnowledge: 5,
  fishingAttemptKnowledge: 3,
  fishingAttemptRegionKnowledge: 1,
  catchKnowledge: 5,
  knowledgeMax: 100,
}
