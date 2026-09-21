import {
  ANGLER_SKILLS,
  ANGLER_SKILL_MAX,
  describeFishingModifiers,
  isPerkUnlockable,
  lockedPerks,
  PERK_DEFINITIONS,
  resolveFishingModifiers,
  totalXpForLevel,
  xpProgress,
  xpToNext,
  type AnglerSkill,
} from '../../domain/progression'
import { usePlayerStore } from '../../state/playerStore'
import '../styles/fishing.css'

/**
 * 成長画面（Phase 3）。
 *
 * Angler Lv / XP / Skill Point / 7 Skill / Perk を確認し、
 * Skill Point を割り振れる。
 * 計算はすべて Domain 側で、ここは表示と入力だけである。
 */

const SKILL_LABELS: Readonly<Record<AnglerSkill, string>> = {
  casting: 'Casting',
  lineControl: 'Line Control',
  hooking: 'Hooking',
  fighting: 'Fighting',
  landing: 'Landing',
  detection: 'Detection',
  rigging: 'Rigging',
}

const SKILL_SUMMARIES: Readonly<Record<AnglerSkill, string>> = {
  casting: 'キャストの精度',
  lineControl: 'テンション管理と GIVE の効き',
  hooking: 'アワセの受付時間',
  fighting: 'REEL の効率',
  landing: '取り込みの安定（将来用）',
  detection: 'アタリの見え方',
  rigging: '仕掛けの扱い（将来用）',
}

const ALLOCATION_ERROR_LABELS: Readonly<Record<string, string>> = {
  invalid_amount: '割り振る量が不正です',
  insufficient_skill_points: 'Skill Point が足りません',
  skill_max_reached: 'これ以上上げられません',
}

export type ProgressionScreenProps = {
  readonly onExit: () => void
  readonly onStartFishing: () => void
}

export const ProgressionScreen = ({ onExit, onStartFishing }: ProgressionScreenProps) => {
  const progression = usePlayerStore((state) => state.progression)
  const skillAllocationError = usePlayerStore((state) => state.skillAllocationError)
  const spendSkillPoint = usePlayerStore((state) => state.spendSkillPoint)
  const resetSkills = usePlayerStore((state) => state.resetSkills)

  const required = xpToNext(progression)
  const progress = xpProgress(progression)
  const modifiers = resolveFishingModifiers({
    skills: progression.skills,
    perks: progression.unlockedPerks,
  })
  const modifierLines = describeFishingModifiers(modifiers)
  const atMaxLevel = required === 0

  return (
    <div className="fishing">
      <header className="fishing__header">
        <button className="button button--ghost" type="button" onClick={onExit}>
          ← 戻る
        </button>
        <button className="button button--ghost" type="button" onClick={onStartFishing}>
          釣りに行く
        </button>
      </header>

      <section className="panel">
        <p className="fishing__phase-code">ANGLER</p>
        <h2 className="panel__heading">Lv {progression.anglerLevel}</h2>
        <p className="panel__body">
          {atMaxLevel
            ? '最大レベル'
            : `次のレベルまで ${String(Math.max(0, required - progression.anglerXp))} XP`}
        </p>
        <div className="meter meter--stamina">
          <div className="meter__head">
            <span className="meter__label">XP</span>
            <span className="meter__value">
              {progression.anglerXp} / {atMaxLevel ? '—' : required}
            </span>
          </div>
          <div className="meter__track">
            <span className="meter__fill" style={{ width: `${String(progress * 100)}%` }} />
          </div>
        </div>
        <dl className="record">
          <div>
            <dt>Total XP</dt>
            <dd>{progression.totalXp}</dd>
          </div>
          <div>
            <dt>累計必要XP(Lv到達)</dt>
            <dd>{totalXpForLevel(progression.anglerLevel)}</dd>
          </div>
          <div>
            <dt>Skill Points</dt>
            <dd>{progression.skillPoints}</dd>
          </div>
          <div>
            <dt>Perks</dt>
            <dd>{progression.unlockedPerks.length}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <h3 className="panel__subheading">Skills</h3>
        <p className="panel__body">
          未使用 Point: {progression.skillPoints}（最大 {ANGLER_SKILL_MAX}）
        </p>

        {skillAllocationError === null ? null : (
          <p className="notice notice--warn">
            {ALLOCATION_ERROR_LABELS[skillAllocationError] ?? '割り振れませんでした'}
          </p>
        )}

        <ul className="skills">
          {ANGLER_SKILLS.map((skill) => {
            const value = progression.skills[skill]
            const canRaise = progression.skillPoints > 0 && value < ANGLER_SKILL_MAX

            return (
              <li className="skill" key={skill}>
                <div className="skill__head">
                  <span className="skill__name">{SKILL_LABELS[skill]}</span>
                  <span className="skill__value">{value}</span>
                </div>
                <p className="skill__summary">{SKILL_SUMMARIES[skill]}</p>
                <div className="skill__bar">
                  <span
                    className="skill__fill"
                    style={{ width: `${String((value / ANGLER_SKILL_MAX) * 100)}%` }}
                  />
                </div>
                <button
                  className="control control--small"
                  type="button"
                  disabled={!canRaise}
                  onClick={() => {
                    spendSkillPoint(skill)
                  }}
                >
                  +1
                </button>
              </li>
            )
          })}
        </ul>

        <div className="controls controls--result">
          <button
            className="control"
            type="button"
            disabled={
              progression.skillPoints === 0 && Object.keys(progression.unlockedPerks).length === 0
            }
            onClick={resetSkills}
          >
            割り振りをやり直す
          </button>
        </div>
      </section>

      <section className="panel">
        <h3 className="panel__subheading">現在の釣りへの効果</h3>
        {modifierLines.length === 0 ? (
          <p className="panel__body">まだ効果はない（Skill Point を割り振る）</p>
        ) : (
          <ul className="log">
            {modifierLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h3 className="panel__subheading">Perks</h3>
        <ul className="perks">
          {Object.values(PERK_DEFINITIONS).map((definition) => {
            const unlocked = progression.unlockedPerks.includes(definition.id)
            const canUnlock = isPerkUnlockable(definition, progression)
            const requirement = definition.requiredSkill

            return (
              <li
                className={`perk${unlocked ? ' perk--unlocked' : ''}${canUnlock ? ' perk--ready' : ''}`}
                key={definition.id}
              >
                <div className="perk__head">
                  <span>{definition.name}</span>
                  <span className="badge">
                    {unlocked
                      ? '取得済み'
                      : canUnlock
                        ? '取得可能'
                        : `Lv${definition.requiredLevel}`}
                  </span>
                </div>
                <p className="perk__summary">{definition.summary}</p>
                <p className="perk__requirement">
                  条件: Lv{definition.requiredLevel}
                  {requirement === undefined
                    ? ''
                    : ` / ${SKILL_LABELS[requirement.skill]} ${requirement.value}`}
                </p>
              </li>
            )
          })}
        </ul>
        <p className="fishing__legend">
          条件を満たすと自動で取得する（Skill を割り振った時点で判定）。未取得は{' '}
          {lockedPerks(progression).length} 件。
        </p>
      </section>
    </div>
  )
}
