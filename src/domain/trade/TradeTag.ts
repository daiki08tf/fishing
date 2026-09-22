/**
 * 魚種の「取引上の性格」タグ（Phase 13.1）。
 *
 * 生物データ（FishSpecies.rarity / habitats ...）と経済データを分離するため、
 * 買取先の好みは魚種 ID ではなく **この語彙** で表現する。
 * 「maaji なら居酒屋」のような speciesId 分岐は Domain / Content のどこにも置かない。
 *
 * すべて Phase 13 の gameplay PROVISIONAL。実在の市場評価・産地ブランドの
 * 主張ではない。
 */
export const TRADE_TAGS = [
  /** 日常的に食卓へ並ぶ、価格が落ち着いた定番。 */
  'everyday',
  /** 高値が付きやすい高級魚。 */
  'premium',
  /** 小ぶりで一尾単位の食卓向け。 */
  'small_table_fish',
  /** 大型で切り身・一尾売りに向く。 */
  'large_fish',
  /** まとまった量が水揚げされ、量で扱う。 */
  'bulk',
  /** 地域で親しまれ、地元の店が好んで扱う。 */
  'local_favorite',
  /** 食用評価とは別に、釣り物として人気がある。 */
  'game_fish',
  /** 傷みやすく、扱いの速さが要る。 */
  'delicate',
  /** 脂が強く、青魚系。 */
  'oily',
  /** 白身で癖がない。 */
  'white_fish',
] as const

export type TradeTag = (typeof TRADE_TAGS)[number]

const TRADE_TAG_SET: ReadonlySet<string> = new Set(TRADE_TAGS)

/** Content / Save から来た文字列が既知のタグかどうか。 */
export const isTradeTag = (value: string): value is TradeTag => TRADE_TAG_SET.has(value)
