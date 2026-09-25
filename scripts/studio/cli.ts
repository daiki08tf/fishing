import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { isContentKind, parseContentRecord, type ContentKind } from '../../src/content/schema'
import { formatDiff } from './diff'
import { buildFormSpec, skeletonFor } from './formSpec'
import { loadStudioStore } from './model'
import {
  referenceOptions,
  referencedBy,
  referencesOf,
  vocabularyValues,
  type VocabularyName,
} from './references'
import { startStudioServer } from './server'
import { writeRecord } from './write'

/**
 * Content Studio CLI — Web UI と同じ store/write を機械可読に触る入口。
 *
 *   tsx scripts/studio/cli.ts serve [--port 4310]
 *   tsx scripts/studio/cli.ts kinds [--json]
 *   tsx scripts/studio/cli.ts list <kind> [--q 文字列] [--json]
 *   tsx scripts/studio/cli.ts get <kind> <id> [--json]
 *   tsx scripts/studio/cli.ts schema <kind> [--json]
 *   tsx scripts/studio/cli.ts refs <kind> <id> [--json]
 *   tsx scripts/studio/cli.ts options --targets=a,b | --vocabulary=name [--json]
 *   tsx scripts/studio/cli.ts validate <kind> <file.json|->
 *   tsx scripts/studio/cli.ts diff <kind> <file.json|-> [--target <既存file>]
 *   tsx scripts/studio/cli.ts write <kind> <file.json|-> [--target <既存file>] [--dry-run]
 *
 * `./dev studio <args>` はこの CLI をそのまま呼ぶ。
 */

type CliResult = { readonly exitCode: number; readonly lines: readonly string[] }

const hasFlag = (argv: readonly string[], flag: string): boolean => argv.includes(flag)

const optionValue = (argv: readonly string[], name: string): string | undefined => {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

const emit = (argv: readonly string[], value: unknown, lines: readonly string[]): CliResult => {
  if (hasFlag(argv, '--json')) {
    return { exitCode: 0, lines: [JSON.stringify(value, null, 2)] }
  }
  return { exitCode: 0, lines }
}

const readJsonInput = (source: string): Record<string, unknown> => {
  const text = source === '-' ? readFileSync(0, 'utf8') : readFileSync(source, 'utf8')
  return JSON.parse(text) as Record<string, unknown>
}

const usage = `content studio

  serve [--port N]           Web UI を起動（http://127.0.0.1:N）
  kinds                      content kind 一覧
  list <kind> [--q 文字列]    レコード一覧
  get <kind> <id>            1 件（参照つき）
  schema <kind>              フォーム仕様（JSON Schema + x-ref）
  refs <kind> <id>           参照 / 被参照
  options --targets=a,b      参照選択肢 / --vocabulary=name で語彙
  validate <kind> <file|->   schema 検証のみ
  diff <kind> <file|-> [--target f]  差分プレビュー（書かない）
  write <kind> <file|-> [--target f] [--dry-run]

すべて --json で機械可読出力。`

export const runStudioCli = async (
  argv: readonly string[],
  cwd = process.cwd(),
): Promise<CliResult> => {
  const [command, ...rest] = argv

  if (command === 'serve' || command === undefined) {
    const port = Number(optionValue(rest, '--port') ?? '4310')
    const { port: bound } = await startStudioServer({ port, cwd })
    process.stdout.write(`content studio → http://127.0.0.1:${String(bound)}\n`)
    process.stdout.write('Ctrl-C で停止。API は /api/*、同じ操作はこの CLI からも可能。\n')
    return { exitCode: 0, lines: [] }
  }

  const store = loadStudioStore(cwd)

  switch (command) {
    case 'kinds':
      return emit(rest, { kinds: store.kinds, diagnostics: store.diagnostics }, [
        ...store.kinds.map((entry) => `${entry.kind.padEnd(24)} ${String(entry.count)}`),
        ...(store.diagnostics.length > 0
          ? ['', `WARN: ${String(store.diagnostics.length)} invalid file(s) on disk`]
          : []),
      ])

    case 'list': {
      const kind = rest[0] ?? ''
      if (!isContentKind(kind)) {
        return { exitCode: 1, lines: [`unknown kind ${kind}`, usage] }
      }
      const query = (optionValue(rest, '--q') ?? '').toLowerCase()
      const records = store.records
        .filter((record) => record.kind === kind)
        .filter(
          (record) =>
            query.length === 0 ||
            record.id.toLowerCase().includes(query) ||
            record.label.toLowerCase().includes(query),
        )
      return emit(
        rest,
        records.map((record) => ({ id: record.id, label: record.label, file: record.file })),
        records.map((record) => `${record.id.padEnd(40)} ${record.label}`),
      )
    }

    case 'get': {
      const [kind, id] = rest
      if (kind === undefined || id === undefined || !isContentKind(kind)) {
        return { exitCode: 1, lines: ['usage: get <kind> <id>'] }
      }
      const record = store.records.find((entry) => entry.kind === kind && entry.id === id)
      if (record === undefined) {
        return { exitCode: 1, lines: [`${kind}/${id} not found`] }
      }
      return emit(
        rest,
        {
          record: { kind: record.kind, id: record.id, file: record.file, raw: record.raw },
          references: referencesOf(record.kind, record.raw),
          referencedBy: referencedBy(store, record.kind, record.id),
        },
        [`${record.kind}/${record.id}  (${record.file})`, '', JSON.stringify(record.raw, null, 2)],
      )
    }

    case 'schema': {
      const kind = rest[0] ?? ''
      if (!isContentKind(kind)) {
        return { exitCode: 1, lines: [`unknown kind ${kind}`] }
      }
      const spec = buildFormSpec(kind)
      return emit(rest, { ...spec, skeleton: skeletonFor(spec.schema) }, [
        JSON.stringify({ ...spec, skeleton: skeletonFor(spec.schema) }, null, 2),
      ])
    }

    case 'refs': {
      const [kind, id] = rest
      if (kind === undefined || id === undefined || !isContentKind(kind)) {
        return { exitCode: 1, lines: ['usage: refs <kind> <id>'] }
      }
      const record = store.records.find((entry) => entry.kind === kind && entry.id === id)
      if (record === undefined) {
        return { exitCode: 1, lines: [`${kind}/${id} not found`] }
      }
      const refs = referencesOf(record.kind, record.raw)
      const inbound = referencedBy(store, record.kind, record.id)
      return emit(rest, { references: refs, referencedBy: inbound }, [
        `${record.kind}/${record.id}`,
        '',
        'references:',
        ...refs.map(
          (ref) =>
            `  ${ref.path} → ${ref.targets?.join('|') ?? ref.vocabulary ?? ''} = ${ref.value}`,
        ),
        '',
        'referenced by:',
        ...inbound.map((entry) => `  ${entry.kind}/${entry.id} via ${entry.path}`),
      ])
    }

    case 'options': {
      const targets = (optionValue(rest, '--targets') ?? '')
        .split(',')
        .filter((entry): entry is ContentKind => isContentKind(entry))
      const vocabulary = optionValue(rest, '--vocabulary')
      return emit(
        rest,
        {
          options: referenceOptions(store, targets),
          ...(vocabulary !== undefined
            ? { vocabulary: vocabularyValues(store, vocabulary as VocabularyName) }
            : {}),
        },
        targets.length > 0
          ? referenceOptions(store, targets).map(
              (option) => `${option.id.padEnd(40)} ${option.label}`,
            )
          : vocabularyValues(store, vocabulary as VocabularyName).map((value) => `  ${value}`),
      )
    }

    case 'validate': {
      const [kind, source] = rest
      if (kind === undefined || source === undefined || !isContentKind(kind)) {
        return { exitCode: 1, lines: ['usage: validate <kind> <file.json|->'] }
      }
      const parsed = parseContentRecord(kind, readJsonInput(source))
      if (parsed.ok) {
        return emit(rest, { ok: true }, ['OK'])
      }
      return {
        exitCode: 1,
        lines: parsed.issues.map((issue) => `ERROR ${issue.path} — ${issue.message}`),
      }
    }

    case 'diff':
    case 'write': {
      const [kind, source] = rest
      if (kind === undefined || source === undefined || !isContentKind(kind)) {
        return { exitCode: 1, lines: [`usage: ${command} <kind> <file.json|-> [--target f]`] }
      }
      const target = optionValue(rest, '--target')
      const result = writeRecord(
        {
          kind,
          value: readJsonInput(source),
          dryRun: command === 'diff' || hasFlag(rest, '--dry-run'),
          ...(target !== undefined ? { file: target } : {}),
        },
        { cwd },
      )

      if (hasFlag(rest, '--json')) {
        return { exitCode: result.ok ? 0 : 1, lines: [JSON.stringify(result, null, 2)] }
      }

      const lines = [
        result.dryRun
          ? `DRY-RUN ${kind}/${result.id} → ${result.file}`
          : `WROTE ${kind}/${result.id} → ${result.file}`,
        ...(result.renamedFrom !== undefined ? [`renamed from ${result.renamedFrom}`] : []),
        '',
        ...formatDiff(result.diff),
      ]
      if (result.errors.length > 0) {
        lines.push('', 'errors:', ...result.errors.map((error) => `  ERROR ${error}`))
      }
      if (result.postCheck !== undefined) {
        lines.push('', `post-check: exit ${String(result.postCheck.exitCode)}`)
        for (const line of result.postCheck.lines.slice(-4)) {
          lines.push(`  ${line}`)
        }
      }
      return { exitCode: result.ok ? 0 : 1, lines }
    }

    default:
      return { exitCode: 1, lines: [`unknown command ${command ?? ''}`, '', usage] }
  }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  // head などで出力先が閉じてもクラッシュしないようにする。
  process.stdout.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') {
      process.exit(0)
    }
    throw error
  })

  runStudioCli(process.argv.slice(2))
    .then((result) => {
      for (const line of result.lines) {
        process.stdout.write(`${line}\n`)
      }
      if (result.exitCode !== 0) {
        process.exitCode = result.exitCode
      }
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
}
