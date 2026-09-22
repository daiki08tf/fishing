import { isContactKnown, trustOf, type ContactType } from '../../domain/trade'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { PixelIcon } from '../components/PixelIcon'
import { StatMeter } from '../components/StatMeter'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { ContentLoadingPanel } from '../content/ContentLoadingPanel'
import { useRegionPack } from '../content/contentRuntimeHooks'
import { useContentOrError } from '../world/useContentOrError'
import { buyerPreferenceChips, buyerRoleLabel, describeBuyerRole } from '../trade/buyerPresentation'
import './contacts.css'

const REWARD_KIND_LABELS: Readonly<Record<string, string>> = {
  intel: '噂',
  discover_spot: '釣り場の発見',
  introduce_contact: '紹介',
}

/** Phase 17C: 買取をしない汎用 Contact（船長・ガイドなど）の role 表示。 */
const CONTACT_TYPE_LABELS: Readonly<Record<ContactType, string>> = {
  captain: '船長',
  guide: 'ガイド',
  local_fisher: '地元の釣り人',
  rental_staff: 'レンタル店スタッフ',
}

/**
 * CONTACTS（Phase 13 / Phase 14 で RPG 風の人脈カードに再構成）。
 *
 * Trust・既知の噂・解禁済みの報酬を見せる。売却そのものは TRADE 画面で行う。
 * まだ解禁していない報酬は内容を明かさず「？？？」に留める。
 *
 * Phase 14.1: プレイヤー向けの画面なので、Content の長文 description
 * （PROVISIONAL の注記を含む）は出さない。役割と好みのタグだけを見せる。
 */
export const ContactsScreen = () => {
  const content = useContentOrError()
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)
  const trade = usePlayerStore((state) => state.trade)
  const world = usePlayerStore((state) => state.world)
  const regionPack = useRegionPack(String(world.currentRegionId))

  if (regionPack.status !== 'ready') {
    return (
      <ContentLoadingPanel
        message="地域情報を読み込み中…"
        error={regionPack.error}
        onRetry={regionPack.retry}
      />
    )
  }

  if (!content.ok) {
    return <ContentErrorPanel message={content.message} />
  }

  const { buyers, contacts, contactRewards } = content.value
  const knownContacts = contacts.filter((contact) =>
    isContactKnown(contact, contactRewards, trade.claimedRewardIds),
  )

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

      <ul className="contact-card-list">
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
            <li className="contact-card" key={String(buyer.id)}>
              <div className="contact-card__head">
                <PixelIcon name="person" size={28} className="contact-card__portrait" />
                <div className="contact-card__title">
                  <h3 className="panel__subheading">{buyer.name}</h3>
                  <p className="contact-card__role">{buyerRoleLabel(buyer)}</p>
                </div>
              </div>

              <StatMeter
                label="Trust"
                value={trust}
                max={100}
                tone="trust"
                valueText={`${String(trust)} / 100`}
              />

              <p className="contact-card__desc">{describeBuyerRole(buyer)}</p>
              <ul className="buyer-card__tags">
                {buyerPreferenceChips(buyer).map((chip) => (
                  <li className="buyer-chip" key={chip}>
                    {chip}
                  </li>
                ))}
              </ul>

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
                <p className="contact-card__locked">
                  次の情報: ？？？（Trust {nextReward.minTrust} で解禁）
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {knownContacts.length === 0 ? null : (
        <ul className="contact-card-list">
          {knownContacts.map((contact) => {
            const trust = Math.round(trustOf(trade, contact.id))
            const rewards = contactRewards.filter(
              (reward) => String(reward.contactId) === String(contact.id),
            )
            const claimed = rewards.filter((reward) => trade.claimedRewardIds.includes(reward.id))
            const nextReward = rewards
              .filter((reward) => !trade.claimedRewardIds.includes(reward.id))
              .sort((left, right) => left.minTrust - right.minTrust)[0]

            return (
              <li className="contact-card" key={String(contact.id)}>
                <div className="contact-card__head">
                  <PixelIcon name="person" size={28} className="contact-card__portrait" />
                  <div className="contact-card__title">
                    <h3 className="panel__subheading">{contact.name}</h3>
                    <p className="contact-card__role">{CONTACT_TYPE_LABELS[contact.type]}</p>
                  </div>
                </div>

                <StatMeter
                  label="Trust"
                  value={trust}
                  max={100}
                  tone="trust"
                  valueText={`${String(trust)} / 100`}
                />

                <p className="contact-card__desc">{contact.role}</p>

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
                  <p className="contact-card__locked">
                    次の情報: ？？？（Trust {nextReward.minTrust} で解禁）
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
