export type ContentErrorPanelProps = {
  readonly message: string
}

/** コンテンツ検証に失敗したときの最小表示。 */
export const ContentErrorPanel = ({ message }: ContentErrorPanelProps) => (
  <section className="panel">
    <h2 className="panel__heading">コンテンツの検証に失敗した</h2>
    <p className="panel__body">{message}</p>
  </section>
)
