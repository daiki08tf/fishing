import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadContentDirectory } from '../../src/content/load/contentLoader'
import { CONTENT_KINDS, type ContentKind } from '../../src/content/schema'

/**
 * Content Studio のコンテントストア。
 *
 * `src/content/data` を `loadContentDirectory`（game と同じ authority）で読み、
 * レコード ↔ ファイルの対応と検索用の索引を提供する。
 * ここには新しい検証規則を置かない — 形は schema、参照は catalog/references が担当する。
 */

export const DEFAULT_CONTENT_DIR = 'src/content/data'

/**
 * レコードの同一性を決めるフィールド。
 * ほとんどの kind は `id`。SpeciesTradeProfile は「魚種ごとに 1 枚」なので
 * `speciesId` が同一性（ファイル名も speciesId に対応する）。
 */
export const identityFieldOf = (kind: ContentKind): string =>
  kind === 'species-trade-profiles' ? 'speciesId' : 'id'

export type StudioRecord = {
  readonly kind: ContentKind
  /** kind ディレクトリ内のファイル名（例: aigo.json）。フラットなので basename と同じ。 */
  readonly file: string
  readonly filePath: string
  /** identity フィールドの値。 */
  readonly id: string
  /** ファイルを JSON.parse しただけの生の値（書き戻しはこれをベースにする）。 */
  readonly raw: Record<string, unknown>
  /** スキーマを通った値（transform 済み）。 */
  readonly value: unknown
  /** 一覧表示用のラベル（name / japaneseName など。無ければ id）。 */
  readonly label: string
}

export type StudioStore = {
  readonly root: string
  readonly records: readonly StudioRecord[]
  readonly diagnostics: readonly {
    readonly filePath: string
    readonly messages: readonly string[]
  }[]
  readonly byId: ReadonlyMap<string, StudioRecord>
  readonly kinds: readonly { readonly kind: ContentKind; readonly count: number }[]
}

const LABEL_FIELDS = ['name', 'japaneseName', 'label', 'title'] as const

const labelOf = (raw: Record<string, unknown>, id: string): string => {
  for (const field of LABEL_FIELDS) {
    const value = raw[field]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }
  return id
}

/** kind/id の複合キー。Buyer と Contact は ID 空間を共有する（references.ts の規則）。 */
export const recordKey = (kind: ContentKind, id: string): string =>
  kind === 'buyers' || kind === 'contacts' ? `contacts:${id}` : `${kind}:${id}`

export const loadStudioStore = (cwd = process.cwd()): StudioStore => {
  const root = resolve(cwd, DEFAULT_CONTENT_DIR)
  const result = loadContentDirectory(root)

  const records: StudioRecord[] = []
  const diagnostics: { filePath: string; messages: readonly string[] }[] = []

  for (const diagnostic of result.diagnostics) {
    diagnostics.push({
      filePath: diagnostic.filePath,
      messages: diagnostic.issues.map(
        (issue) => `${issue.path.length > 0 ? `${issue.path}: ` : ''}${issue.message}`,
      ),
    })
  }

  for (const location of result.locations) {
    /*
     * raw はスキーマを通った後の値ではなく、ディスク上の JSON を使う。
     * （transform で付く brand は書き戻しに混入させない。）
     */
    const onDisk = JSON.parse(readFileSync(location.filePath, 'utf8')) as Record<string, unknown>
    const idValue = onDisk[identityFieldOf(location.kind)]
    const id = typeof idValue === 'string' ? idValue : location.filePath

    records.push({
      kind: location.kind,
      file: location.filePath.slice(join(root, location.kind).length + 1),
      filePath: location.filePath,
      id,
      raw: onDisk,
      value: location.value,
      label: labelOf(onDisk, id),
    })
  }

  const byId = new Map<string, StudioRecord>()
  for (const record of records) {
    byId.set(recordKey(record.kind, record.id), record)
  }

  const kinds = CONTENT_KINDS.map((kind) => ({
    kind,
    count: records.filter((record) => record.kind === kind).length,
  }))

  return { root, records, diagnostics, byId, kinds }
}

/** id の重複検査（Buyer/Contact の共有 ID 空間を含む）。書き込み前の関門。 */
export const duplicateIdIssues = (
  store: StudioStore,
  kind: ContentKind,
  id: string,
  excludeFile?: string,
): readonly string[] => {
  const issues: string[] = []
  for (const record of store.records) {
    if (record.id !== id) {
      continue
    }
    const sameSpace = recordKey(record.kind, record.id) === recordKey(kind, id)
    if (!sameSpace) {
      continue
    }
    if (excludeFile !== undefined && record.kind === kind && record.file === excludeFile) {
      continue
    }
    issues.push(`duplicate id ${id} already used by ${record.kind}/${record.file}`)
  }
  return issues
}
