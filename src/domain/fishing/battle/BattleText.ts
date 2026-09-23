import type { BattleBehaviour } from './BattleBehaviour'

/**
 * Text Fishing Battle の文章（Phase 10）。
 *
 * LLM は使わない。決定的なテンプレートから選ぶ（同じ入力なら同じ文章）。
 * 予兆（hint）だけは Knowledge で精度が変わる（低いと曖昧、高いと具体的）。
 */

export type BattleTextKey =
  | 'behaviour_start'
  | 'normal_hold'
  | 'reel_effective'
  | 'reel_heavy'
  | 'power_reel_danger'
  | 'give_relief'
  | 'give_slack_risk'
  | 'drag_loosened'
  | 'drag_tightened'
  | 'tension_high'
  | 'hook_hold_low'
  | 'slack_warning'
  | 'landing_ready'
  | 'landing_success'
  | 'landing_failed'
  | 'line_break'
  | 'hook_escape'
  // Phase 18B
  | 'pump_effective'
  | 'pump_danger'
  | 'spool_warning'
  | 'spooled'
  | 'leader_abrasion'

const TEMPLATES: Readonly<Record<BattleTextKey, readonly string[]>> = {
  behaviour_start: ['魚が体勢を変えた。', '魚の動きが変わった。'],
  normal_hold: ['魚は一定の抵抗を続けている。', '手応えは変わらない。'],
  reel_effective: ['巻き取れて、魚が近づいた。', 'ラインが素直に入っていく。'],
  reel_heavy: ['巻いたが、重くてあまり寄らない。', 'ロッドが深く曲がり、距離が詰まらない。'],
  power_reel_danger: [
    '強く巻いた。ラインが鋭く張り詰める。',
    '強引に寄せた。テンションが跳ね上がった。',
  ],
  give_relief: ['ラインを送ると、負荷が抜けた。', '糸を送って、テンションが落ち着いた。'],
  give_slack_risk: ['送りすぎた。ラインが緩む。', '糸がたるみ、手応えが薄くなった。'],
  drag_loosened: ['ドラグを緩めた。', 'ドラグを少し戻した。'],
  drag_tightened: ['ドラグを締めた。', 'ドラグを強くした。'],
  tension_high: ['テンションが危険域に近づいている。', 'これ以上は糸が持たない。'],
  hook_hold_low: ['フックの保持が怪しくなってきた。', '針が外れかけている。'],
  slack_warning: ['ラインが緩んだままだ。', '糸のたるみが続いている。'],
  landing_ready: ['魚が近くまで寄った。取り込みの体勢に入れる。', 'ランディングの距離に入った。'],
  landing_success: ['ランディングに成功した。', 'ネットに収まった。'],
  landing_failed: ['取り込みに失敗した。魚がまた走り出す。', 'まだ暴れている。無理に掴めない。'],
  line_break: ['ラインが鋭く張り詰めた。', '糸が限界を越えた。'],
  hook_escape: ['フックが外れた。', '針が外れて、魚の重みが消えた。'],
  pump_effective: ['ロッドで魚を持ち上げた。', '竿の胴で魚を浮かせた。'],
  pump_danger: [
    '走る魚に竿を立てた。危ない負荷。',
    '突進に合わせて竿を絞った。ラインが悲鳴を上げる。',
  ],
  spool_warning: ['残りラインが少ない。', 'スプールのラインが見えてきた。'],
  spooled: ['ラインが出尽くした。', 'スプールが空になった。'],
  leader_abrasion: ['リーダーが擦れている。', 'ラインが根に触れている。'],
}

/** 同じ event に variation を持たせる（variant は Engine が seed から決める）。 */
export const battleText = (key: BattleTextKey, variant: number): string => {
  const templates = TEMPLATES[key]
  const index = Math.abs(Math.trunc(variant)) % templates.length

  return templates[index] ?? key
}

/**
 * 行動の予兆。Knowledge が高いほど具体的になる。
 * Knowledge が低くてもゲームは成立する（行動そのものは変わらない）。
 */
export const behaviourHint = (
  behaviour: BattleBehaviour,
  knowledgeScore: number,
  variant: number,
): string => {
  const tier = knowledgeScore >= 60 ? 'high' : knowledgeScore >= 25 ? 'mid' : 'low'
  const tables: Readonly<
    Record<BattleBehaviour, Readonly<Record<'low' | 'mid' | 'high', string>>>
  > = {
    run: {
      low: '魚が向きを変えた。',
      mid: '魚が沖へ向きを変えた。走り出しそうだ。',
      high: '魚が沖へ向いた。次は強い走りになる。',
    },
    surge: {
      low: '魚が力を込めた。',
      mid: '魚が体を固めた。突進の予兆がある。',
      high: '次の瞬間に強い突進が来る。',
    },
    head_shake: {
      low: '魚が体勢を変えた。',
      mid: '魚が首を振る兆候がある。',
      high: '次の瞬間に強く首を振りそうだ。',
    },
    dive: {
      low: '魚の角度が変わった。',
      mid: '魚が下へ向き始めた。',
      high: '深く潜る。ロッドを下げて受けよう。',
    },
    come_toward: {
      low: 'ラインの角度が変わった。',
      mid: '魚がこちらへ向かっている。',
      high: '魚が急接近する。糸が緩みやすい。',
    },
    second_run: {
      low: '魚が息を吹き返した。',
      mid: '魚が再加速しそうだ。',
      high: '疲れたと思ったが、もう一度走る。',
    },
    rest: {
      low: '抵抗が弱まった。',
      mid: '抵抗が弱まり、ラインの動きが落ち着いた。',
      high: '魚が休んでいる。ここが寄せる好機だ。',
    },
    normal: {
      low: '魚は動き続けている。',
      mid: '魚は一定のペースで抵抗している。',
      high: '魚はまだ余力を残して抵抗している。',
    },
  }
  void variant

  return tables[behaviour][tier]
}
