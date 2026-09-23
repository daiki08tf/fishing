/**
 * Phase 18B: 根ズレ（ライン/リーダーの摩耗）リスク。
 *
 * Zone の habitatTags から「ラインが擦れそうな環境か」を 0..1 で返す。
 * Region ID や Spot ID には一切依存しない — 生息環境のタグだけを見る。
 *
 * これは永続される耐久値ではなく、ファイト中だけの integrity 減少率。
 */

/** 根ズレの強さ。複数タグは加算される（岩礁 + ストラクチャーは特に危険）。 */
const ABRASION_TAG_WEIGHTS: Readonly<Record<string, number>> = {
  rock: 0.5,
  rocks: 0.5,
  reef: 0.5,
  structure: 0.4,
  bottom: 0.25,
  gravel: 0.2,
  boulder: 0.45,
  wreck: 0.45,
  ledge: 0.35,
  kelp: 0.15,
}

export const MAX_ABRASION_RISK = 1

/**
 * habitatTags から abrasion risk (0..1) を返す。
 * タグが無い / すべて砂泥底なら 0（根ズレなし）。
 */
export function resolveAbrasionRisk(habitatTags: readonly string[]): number {
  let risk = 0
  for (const tag of habitatTags) {
    const weight = ABRASION_TAG_WEIGHTS[tag.toLowerCase()]
    if (weight !== undefined) {
      risk += weight
    }
  }
  return Math.min(MAX_ABRASION_RISK, risk)
}
