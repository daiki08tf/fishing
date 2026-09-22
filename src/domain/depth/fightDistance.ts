/**
 * 水深をゲーム上のファイト距離（Casting Domain の castDistanceM と同じ単位）へ
 * 圧縮する（Phase 17A）。
 *
 * 100m の水深がそのまま 100 step ぶんの REEL にはならない。深いほど長引くが、
 * 線形（1m = 1 gameplay distance）にはしない（sublinear）。
 * 係数・カーブの形は PROVISIONAL gameplay tuning。
 */
const DEPTH_TO_FIGHT_DISTANCE_COEFFICIENT = 4.6

export const depthToFightDistanceM = (depthM: number): number => {
  if (depthM <= 0) {
    return 0
  }

  return Math.round(DEPTH_TO_FIGHT_DISTANCE_COEFFICIENT * Math.sqrt(depthM) * 10) / 10
}
