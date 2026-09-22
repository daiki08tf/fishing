import type { BuyerDefinition } from '../../domain/trade/Buyer'
import type { TradeTag } from '../../domain/trade/TradeTag'

/**
 * 買取先の「短い紹介文」（Phase 14.1）。
 *
 * UI のために Content を書き換えず、**BuyerDefinition の数値と好み（preferences）から
 * 決定的に短文を組み立てる**。魚種 ID や Buyer ID では分岐しない
 * （「maaji なら居酒屋」のような表を作らない、という Phase 13 の方針を UI でも守る）。
 *
 * Content の `description` は世界観込みの長文（PROVISIONAL の注記を含む）なので
 * 画面にはそのまま出さない。プレイヤーに見せるのは 1〜2 行の役割文とタグだけにする。
 */

const ROLE_LABELS: Readonly<Record<string, string>> = {
  izakaya: '居酒屋',
  wholesaler: '卸',
  market: '市場',
}

export const buyerRoleLabel = (buyer: BuyerDefinition): string =>
  ROLE_LABELS[buyer.buyerType] ?? '買取先'

/** 好みのタグを短いチップ文言にする（Content の語彙 → 表示語）。 */
const TAG_LABELS: Readonly<Record<TradeTag, string>> = {
  everyday: '日常魚',
  premium: '上物',
  small_table_fish: '小物',
  large_fish: '大型',
  bulk: 'まとめ',
  local_favorite: '地元',
  game_fish: '釣り物',
  delicate: '繊細',
  oily: '青魚',
  white_fish: '白身',
}

export const buyerPreferenceChips = (buyer: BuyerDefinition, limit = 3): readonly string[] =>
  buyer.preferences.preferredTags.slice(0, limit).map((tag) => TAG_LABELS[tag])

/** 状態（鮮度・品質）への姿勢を 1 行で。 */
const stateClause = (buyer: BuyerDefinition): string => {
  const pricing = buyer.pricingProfile

  if (pricing.freshnessSensitivity >= 0.5 && pricing.qualitySensitivity >= 1.2) {
    return '鮮度と状態を重視'
  }

  if (pricing.freshnessSensitivity >= 0.5) {
    return '鮮度を重視'
  }

  if (pricing.qualitySensitivity >= 1.2) {
    return '状態の良い魚を好む'
  }

  return '多魚種を広く扱う'
}

/** 量・サイズ・好みのタグから 2 つ目の 1 行を選ぶ。 */
const dealClause = (buyer: BuyerDefinition): string | null => {
  const pricing = buyer.pricingProfile

  if (pricing.volumeBonusPerExtraCatch > 0) {
    return 'まとめ売りに強い'
  }

  if (pricing.sizeSensitivity >= 1.2) {
    return '大型を高く評価'
  }

  if (buyer.preferences.preferredTags.includes('premium')) {
    return '上物ねらい'
  }

  if (
    buyer.preferences.preferredTags.includes('small_table_fish') ||
    buyer.preferences.preferredTags.includes('white_fish')
  ) {
    return '白身の食卓魚が得意'
  }

  if (buyer.preferences.preferredTags.includes('local_favorite')) {
    return '地元の魚に強い'
  }

  return null
}

/** 買取先カードに出す 1〜2 行の役割文（例: 「鮮度と状態を重視・白身の食卓魚が得意」）。 */
export const describeBuyerRole = (buyer: BuyerDefinition): string => {
  const clauses = [stateClause(buyer), dealClause(buyer)]

  return clauses.filter((clause): clause is string => clause !== null).join('・')
}
