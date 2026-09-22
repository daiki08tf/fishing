import { PixelIcon, type PixelIconName } from './PixelIcon'

/** 行き止まりに見せない、自然な空状態表示（Phase 14）。 */
export type EmptyStateProps = {
  readonly icon: PixelIconName
  readonly title: string
  readonly body?: string
}

export const EmptyState = ({ icon, title, body }: EmptyStateProps) => (
  <div className="empty-state">
    <PixelIcon name={icon} size={32} className="empty-state__icon" />
    <p className="empty-state__title">{title}</p>
    {body === undefined ? null : <p className="empty-state__body">{body}</p>}
  </div>
)
