import { trustOf } from '../../domain/trade'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { useContentOrError } from '../world/useContentOrError'

const REWARD_KIND_LABELS: Readonly<Record<string, string>> = {
  intel: '噂',
  discover_spot: '釣り場の発見',
  introduce_contact: '紹介',
}

/**
 * CONTACTS（Phase 13）。
 *
 * Trust・既知の噂・解禁済みの報酬を見せる。売却そのものは TRADE 画面で行う。
 */
export const ContactsScreen = () => {
  const content = useContentOrError()
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)
  const trade = usePlayerStore((state) => state.trade)

  if (!content.ok) {
    return <ContentErrorPanel message={content.message} />
  }

  const { buyers, contactRewards } = content.value

  return (
    <div className="fishing">
      <header className="fishing__header">
        <button
          className="button button--ghost"
          type="button"
          onClick={() => {
            setActiveScreen('home')
          }}
        >
          ← 自宅
        </button>
      </header>

      <section className="panel">
        <p className="fishing__phase-code">CONTACTS</p>
        <h2 className="panel__heading">人脈</h2>
        <p className="panel__body">
          売却で Trust が上がると、噂や釣り場の情報を教えてもらえることがある。
        </p>
      </section>

      <section>
        <ul className="spots">
          {buyers.map((buyer) => {
            const trust = Math.round(trustOf(trade, buyer.id))
            const rewards = contactRewards.filter(
              (reward) => String(reward.contactId) === String(buyer.id),
            )
            const claimed = rewards.filter((reward) => trade.claimedRewardIds.includes(reward.id))
            const nextReward = rewards
              .filter((reward) => !trade.claimedRewardIds.includes(reward.id))
              .sort((left, right) => left.minTrust - right.minTrust)[0]

            return (
              <li className="spot-card" key={String(buyer.id)}>
                <div className="spot-card__head">
                  <h3 className="panel__subheading">{buyer.name}</h3>
                  <span className="badge">Trust {trust} / 100</span>
                </div>
                <p className="spot-card__meta">{buyer.description}</p>

                {claimed.length === 0 ? null : (
                  <ul className="log">
                    {claimed.map((reward) => (
                      <li key={String(reward.id)}>
                        [{REWARD_KIND_LABELS[reward.kind] ?? reward.kind}] {reward.message}
                      </li>
                    ))}
                  </ul>
                )}

                {nextReward === undefined ? null : (
                  <p className="spot-card__meta">次の情報: Trust {nextReward.minTrust} で解禁</p>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
