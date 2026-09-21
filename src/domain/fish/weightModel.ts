/**
 * 体長と体重の関係。DATA_MODEL.md §2 の WeightModel。
 *
 * 現実の釣りでは W = a * L^b（length-weight relationship）が広く使われる。
 * 体重を体長と独立した乱数で決めない、というのが Phase 2 の要件である。
 *
 * 単位の約束:
 * - lengthWeightA は **g/cm^b**。文献に載っている係数をそのまま貼れる単位である
 *   （例: 0.0095 g/cm^3）。
 * - lengthWeightB は無次元。
 * - 戻り値は **kg**。
 *
 * この約束を間違えると桁が 1000 倍ずれるため、
 * 統計テスト側で「体重 / 体長^3」が現実的な範囲に収まることも検査している。
 */

export type WeightModel = {
  readonly lengthWeightA: number
  readonly lengthWeightB: number
}

/**
 * 体長から標準的な体重（kg）を求める。
 * conditionFactor は同じ体長でも体格差（痩せ・良好）を反映する係数で、
 * 1.0 が標準。
 */
export const estimateStandardWeightKg = (
  model: WeightModel,
  lengthCm: number,
  conditionFactor = 1,
): number => (model.lengthWeightA * lengthCm ** model.lengthWeightB * conditionFactor) / 1000

/** 標準体重に対する比。Heavy 判定などに使う。 */
export const weightRatio = (model: WeightModel, lengthCm: number, weightKg: number): number => {
  const standard = estimateStandardWeightKg(model, lengthCm)

  if (standard <= 0) {
    return 1
  }

  return weightKg / standard
}
