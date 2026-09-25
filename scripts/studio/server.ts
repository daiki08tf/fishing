import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isContentKind, parseContentRecord } from '../../src/content/schema'
import { buildFormSpec, skeletonFor } from './formSpec'
import { loadStudioStore, type StudioStore } from './model'
import {
  referenceOptions,
  referencedBy,
  referencesOf,
  vocabularyValues,
  type VocabularyName,
} from './references'
import { writeRecord, type WritePlan } from './write'

/**
 * Content Studio のローカルサーバ。
 *
 * node:http + 静的ファイルだけ（新しい依存は増やさない）。
 * 127.0.0.1 のみに bind する — 認証は持たないローカル専用ツール。
 *
 * API は scripts/studio/cli.ts と同じ store/write を共有する。
 */

const PUBLIC_DIR = fileURLToPath(new URL('./public', import.meta.url))
const DEFAULT_PORT = 4310
const MAX_BODY_BYTES = 4 * 1024 * 1024

let cachedStore: StudioStore | undefined

const getStore = (cwd: string): StudioStore => {
  cachedStore ??= loadStudioStore(cwd)
  return cachedStore
}

const invalidateStore = (): void => {
  cachedStore = undefined
}

const json = (response: ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(payload)
}

const readBody = (request: IncomingMessage): Promise<unknown> =>
  new Promise((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        rejectPromise(new Error('request body too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown)
      } catch {
        rejectPromise(new Error('invalid JSON body'))
      }
    })
    request.on('error', rejectPromise)
  })

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

const serveStatic = (response: ServerResponse, pathname: string): boolean => {
  const file = pathname === '/' ? 'index.html' : pathname.slice(1)
  const resolved = normalize(join(PUBLIC_DIR, file))
  if (!resolved.startsWith(PUBLIC_DIR)) {
    return false
  }
  try {
    const content = readFileSync(resolved)
    response.writeHead(200, {
      'content-type': MIME[extname(resolved)] ?? 'application/octet-stream',
    })
    response.end(content)
    return true
  } catch {
    return false
  }
}

const fail = (message: string): { readonly ok: false; readonly errors: readonly string[] } => ({
  ok: false,
  errors: [message],
})

const handleApi = async (
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  cwd: string,
): Promise<void> => {
  const store = getStore(cwd)
  const path = url.pathname

  if (request.method === 'GET' && path === '/api/kinds') {
    json(response, 200, {
      kinds: store.kinds,
      diagnostics: store.diagnostics,
      contentDir: store.root,
    })
    return
  }

  if (request.method === 'GET' && path === '/api/records') {
    const kind = url.searchParams.get('kind') ?? ''
    const query = (url.searchParams.get('q') ?? '').toLowerCase()
    if (!isContentKind(kind)) {
      json(response, 400, fail(`unknown kind ${kind}`))
      return
    }
    const records = store.records
      .filter((record) => record.kind === kind)
      .filter(
        (record) =>
          query.length === 0 ||
          record.id.toLowerCase().includes(query) ||
          record.label.toLowerCase().includes(query),
      )
      .map((record) => ({
        id: record.id,
        label: record.label,
        file: record.file,
        kind: record.kind,
      }))
    json(response, 200, { records })
    return
  }

  if (request.method === 'GET' && path === '/api/record') {
    const kind = url.searchParams.get('kind') ?? ''
    const id = url.searchParams.get('id') ?? ''
    if (!isContentKind(kind)) {
      json(response, 400, fail(`unknown kind ${kind}`))
      return
    }
    const record = store.records.find((entry) => entry.kind === kind && entry.id === id)
    if (record === undefined) {
      json(response, 404, fail(`${kind}/${id} not found`))
      return
    }
    json(response, 200, {
      record: {
        kind: record.kind,
        id: record.id,
        file: record.file,
        label: record.label,
        raw: record.raw,
      },
      references: referencesOf(record.kind, record.raw),
      referencedBy: referencedBy(store, record.kind, record.id),
    })
    return
  }

  if (request.method === 'GET' && path === '/api/schema') {
    const kind = url.searchParams.get('kind') ?? ''
    if (!isContentKind(kind)) {
      json(response, 400, fail(`unknown kind ${kind}`))
      return
    }
    const spec = buildFormSpec(kind)
    json(response, 200, { ...spec, skeleton: skeletonFor(spec.schema) })
    return
  }

  if (request.method === 'GET' && path === '/api/options') {
    const targets = (url.searchParams.get('targets') ?? '')
      .split(',')
      .filter((entry) => isContentKind(entry))
    const vocabulary = url.searchParams.get('vocabulary') ?? ''
    json(response, 200, {
      options: targets.length > 0 ? referenceOptions(store, targets) : [],
      vocabulary:
        vocabulary.length > 0 ? vocabularyValues(store, vocabulary as VocabularyName) : undefined,
    })
    return
  }

  if (request.method === 'POST' && path === '/api/reload') {
    invalidateStore()
    const fresh = getStore(cwd)
    json(response, 200, {
      ok: true,
      records: fresh.records.length,
      diagnostics: fresh.diagnostics.length,
    })
    return
  }

  if (request.method === 'POST' && (path === '/api/validate' || path === '/api/write')) {
    const body = (await readBody(request)) as Partial<WritePlan> & { readonly value?: unknown }
    const kind = typeof body.kind === 'string' && isContentKind(body.kind) ? body.kind : undefined
    if (kind === undefined || typeof body.value !== 'object' || body.value === null) {
      json(response, 400, fail('body must include {kind, value}'))
      return
    }

    if (path === '/api/validate') {
      const parsed = parseContentRecord(kind, body.value)
      json(response, 200, {
        ok: parsed.ok,
        issues: parsed.ok ? [] : parsed.issues,
      })
      return
    }

    const result = writeRecord(
      {
        kind,
        value: body.value as Record<string, unknown>,
        dryRun: body.dryRun === true,
        ...(typeof body.file === 'string' ? { file: body.file } : {}),
      },
      { cwd },
    )
    if (!result.dryRun) {
      invalidateStore()
    }
    json(response, result.ok ? 200 : 422, result)
    return
  }

  json(response, 404, fail(`unknown endpoint ${request.method ?? ''} ${path}`))
}

export const startStudioServer = (
  options: { readonly port?: number; readonly cwd?: string } = {},
): Promise<{ readonly port: number; readonly close: () => void }> => {
  const port = options.port ?? DEFAULT_PORT
  const cwd = options.cwd ?? process.cwd()

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

    if (url.pathname.startsWith('/api/')) {
      handleApi(request, response, url, cwd).catch((error: unknown) => {
        json(response, 500, fail(error instanceof Error ? error.message : String(error)))
      })
      return
    }

    if (!serveStatic(response, url.pathname)) {
      response.writeHead(404, { 'content-type': 'text/plain' })
      response.end('not found')
    }
  })

  return new Promise((resolvePromise) => {
    server.listen(port, '127.0.0.1', () => {
      resolvePromise({ port, close: () => server.close() })
    })
  })
}
