import './contentLoading.css'

/**
 * Content Pack の読み込み中 / 失敗の表示（Phase 15）。
 *
 * 開発者向けの情報（chunk 名・pack 名・path）は出さない。
 * 失敗してもアプリを落とさず、その場で retry できる。
 */
export type ContentLoadingPanelProps = {
  readonly message: string
  readonly error?: string | null
  readonly onRetry?: (() => void) | undefined
}

export const ContentLoadingPanel = ({ message, error, onRetry }: ContentLoadingPanelProps) => (
  <section className="panel content-loading" role="status" aria-live="polite">
    <p className="content-loading__spinner" aria-hidden="true">
      ·<span>·</span>
      <span>·</span>
    </p>
    {error === undefined || error === null ? (
      <h2 className="panel__heading">{message}</h2>
    ) : (
      <>
        <h2 className="panel__heading">地域情報を読み込めませんでした</h2>
        <p className="panel__body">通信状態を確認して、もう一度試してください。</p>
        {onRetry === undefined ? null : (
          <button className="button button--primary" type="button" onClick={onRetry}>
            もう一度読み込む
          </button>
        )}
      </>
    )}
  </section>
)
