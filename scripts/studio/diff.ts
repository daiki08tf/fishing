/**
 * JSON 値のフィールド単位 diff。
 * 書き込み前プレビュー用に「どのパスがどう変わるか」を返す。
 */

export type DiffEntry = {
  readonly path: string
  readonly type: 'added' | 'removed' | 'changed'
  readonly before?: unknown
  readonly after?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const serializeRecord = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

export const jsonDiff = (before: unknown, after: unknown, base = ''): readonly DiffEntry[] => {
  if (before === after) {
    return []
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const entries: DiffEntry[] = []
    const shared = Math.min(before.length, after.length)
    for (let index = 0; index < shared; index += 1) {
      entries.push(...jsonDiff(before[index], after[index], `${base}.${index}`))
    }
    for (let index = shared; index < after.length; index += 1) {
      entries.push({ path: `${base}.${index}`, type: 'added', after: after[index] })
    }
    for (let index = shared; index < before.length; index += 1) {
      entries.push({ path: `${base}.${index}`, type: 'removed', before: before[index] })
    }
    return entries
  }

  if (isRecord(before) && isRecord(after)) {
    const entries: DiffEntry[] = []
    for (const key of Object.keys(before)) {
      if (!(key in after)) {
        entries.push({ path: `${base}${key}`, type: 'removed', before: before[key] })
      }
    }
    for (const key of Object.keys(after)) {
      if (!(key in before)) {
        entries.push({ path: `${base}${key}`, type: 'added', after: after[key] })
      } else {
        entries.push(...jsonDiff(before[key], after[key], `${base}${key}`))
      }
    }
    return entries
  }

  return [{ path: base.replace(/\.$/, '') || '(root)', type: 'changed', before, after }]
}

const short = (value: unknown): string => {
  const text = JSON.stringify(value)
  return text.length > 80 ? `${text.slice(0, 77)}…` : text
}

export const formatDiff = (entries: readonly DiffEntry[]): readonly string[] =>
  entries.map((entry) => {
    switch (entry.type) {
      case 'added':
        return `+ ${entry.path} = ${short(entry.after)}`
      case 'removed':
        return `- ${entry.path} = ${short(entry.before)}`
      case 'changed':
        return `~ ${entry.path}: ${short(entry.before)} → ${short(entry.after)}`
    }
  })
