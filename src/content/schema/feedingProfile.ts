import { z } from 'zod'

/**
 * 魚種の捕食プロファイル（Phase 9.1）。
 *
 * ルアーサイズの物理適合（大きすぎる＝食わない / 小さすぎる＝可能）に使う。
 * PROVISIONAL（生物学的な事実ではなくゲームとしての傾向）。
 */
export const feedingProfileSchema = z
  .strictObject({
    /** 最も食いつきが良い offering 長 / 魚体長 の比。 */
    preferredOfferingRatio: z.number().positive(),
    /** これを超えると penalty が始まる比。 */
    largeOfferingPenaltyStart: z.number().positive(),
    /** これを超えると物理的に食わない（Bite = 0）比。 */
    maxOfferingRatio: z.number().positive(),
    /** 口の大きさの補正（1 が標準）。 */
    mouthSizeFactor: z.number().positive(),
  })
  .refine(
    (profile) =>
      profile.preferredOfferingRatio <= profile.largeOfferingPenaltyStart &&
      profile.largeOfferingPenaltyStart <= profile.maxOfferingRatio,
    {
      message: 'preferredOfferingRatio <= largeOfferingPenaltyStart <= maxOfferingRatio',
      path: ['largeOfferingPenaltyStart'],
    },
  )
