/* Content Studio SPA — 依存ゼロの vanilla JS。
 * フォームは server が作る JSON Schema（+ x-ref / x-keyRef / x-discriminator）から生成する。
 */

const api = async (path, options) => {
  const response = await fetch(path, options)
  const body = await response.json()
  if (!response.ok && body.errors === undefined) {
    throw new Error(`${response.status} ${path}`)
  }
  return body
}

const post = (path, body) =>
  api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const state = {
  kinds: [],
  kind: undefined,
  records: [],
  query: '',
  record: undefined, // {kind,id,file,raw} — ディスク上の値
  detail: undefined, // /api/record の応答（references / referencedBy）
  spec: undefined, // form spec
  draft: undefined, // 編集中の値（undefined = 未選択）
  isNew: false,
  issues: [],
  lastResult: undefined,
  tab: 'form',
  optionsCache: new Map(),
}

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
    else if (key === 'value') node.value = value
    else if (key === 'checked') node.checked = value
    else if (key === 'disabled' && value) node.disabled = true
    else node.setAttribute(key, value)
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue
    node.append(child.nodeType ? child : String(child))
  }
  return node
}

const getPath = (object, path) => {
  let current = object
  for (const segment of path.split('.')) {
    if (current === undefined || current === null) return undefined
    current =
      current[
        Number.isInteger(Number(segment)) && Array.isArray(current) ? Number(segment) : segment
      ]
  }
  return current
}

const setPath = (object, path, value) => {
  const segments = path.split('.')
  let current = object
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]
    const next = segments[index + 1]
    const key = Array.isArray(current) ? Number(segment) : segment
    if (current[key] === undefined || current[key] === null) {
      current[key] = Number.isInteger(Number(next)) ? [] : {}
    }
    current = current[key]
  }
  const last = segments[segments.length - 1]
  current[Array.isArray(current) ? Number(last) : last] = value
}

const assignDraft = (path, value) => {
  if (path === '') {
    state.draft = value
  } else {
    setPath(state.draft, path, value)
  }
}

/* ---------- options (reference choices) ---------- */

const loadOptions = async (marker) => {
  const key = marker.targets ? `t:${marker.targets.join(',')}` : `v:${marker.vocabulary}`
  if (!state.optionsCache.has(key)) {
    const params = marker.targets
      ? `targets=${marker.targets.join(',')}`
      : `vocabulary=${marker.vocabulary}`
    const data = await api(`/api/options?${params}`)
    state.optionsCache.set(
      key,
      marker.targets ? data.options : (data.vocabulary ?? []).map((v) => ({ id: v, label: v })),
    )
  }
  return state.optionsCache.get(key)
}

const pickMarker = (markers, parentValue) => {
  if (!markers || markers.length === 0) return undefined
  const matching = markers.filter((m) => !m.when || parentValue?.[m.when.field] === m.when.is)
  return matching[0] ?? (markers.every((m) => m.when) ? undefined : markers[0])
}

/* ---------- form rendering ---------- */

const unionOf = (node) => node?.anyOf ?? node?.oneOf ?? []

const skeletonValue = (node) => {
  if (!node) return undefined
  if ('const' in node) return node.const
  if (node.enum?.length) return node.enum[0]
  if (unionOf(node).length) return skeletonValue(unionOf(node)[0])
  switch (node.type) {
    case 'string':
      return ''
    case 'number':
    case 'integer':
      return 0
    case 'boolean':
      return false
    case 'array':
      return []
    case 'object':
      return skeletonObject(node)
    default:
      return null
  }
}

const skeletonObject = (node) => {
  const target = unionOf(node).length ? unionOf(node)[0] : node
  const out = {}
  for (const name of target.required ?? []) {
    out[name] = skeletonValue(target.properties?.[name])
  }
  return out
}

const errorFor = (path) =>
  state.issues.filter((issue) => issue.path === path || issue.path === path.replace(/^\./, ''))

const fieldShell = (label, path, inner, note) => {
  const errors = errorFor(path)
  return el(
    'div',
    { class: 'field', 'data-path': path },
    el('label', {}, label),
    inner,
    note ? el('div', { class: 'error', style: 'color:var(--muted)' }, note) : null,
    errors.map((issue) => el('div', { class: 'error' }, issue.message)),
  )
}

const renderScalar = (node, value, path, marker) => {
  // 参照フィールド → 選択肢ドロップダウン（+ 手入力フォールバック）。
  if (marker) {
    const select = el('select', {
      onchange: (event) => {
        setPath(state.draft, path, event.target.value)
        rerenderDetail()
      },
    })
    select.append(el('option', { value: '' }, '(unset)'))
    loadOptions(marker).then((options) => {
      for (const option of options) {
        select.append(el('option', { value: option.id }, `${option.id} — ${option.label}`))
      }
      select.value = value ?? ''
      if (select.value !== (value ?? '')) {
        // 未登録の値は手入力扱いで末尾に出す。
        if (value) select.append(el('option', { value }, `${value} (unresolved)`))
        select.value = value ?? ''
      }
      if (errorFor(path).length) select.classList.add('invalid')
    })
    return fieldShell(path.split('.').pop(), path, select, marker.note)
  }

  if ('const' in node) {
    return fieldShell(
      path.split('.').pop(),
      path,
      el('code', {}, String(node.const)),
      node['x-note'],
    )
  }

  if (node.enum) {
    const select = el(
      'select',
      {
        onchange: (event) => {
          setPath(state.draft, path, event.target.value)
          rerenderDetail()
        },
      },
      node.enum.map((option) => el('option', { value: option }, String(option))),
    )
    queueMicrotask(() => {
      select.value = value ?? ''
      if (errorFor(path).length) select.classList.add('invalid')
    })
    return fieldShell(path.split('.').pop(), path, select)
  }

  switch (node.type) {
    case 'boolean':
      return fieldShell(
        path.split('.').pop(),
        path,
        el('input', {
          type: 'checkbox',
          checked: value === true,
          onchange: (event) => setPath(state.draft, path, event.target.checked),
        }),
      )
    case 'number':
    case 'integer':
      return fieldShell(
        path.split('.').pop(),
        path,
        el('input', {
          type: 'number',
          step: node.type === 'integer' ? '1' : 'any',
          value: value ?? '',
          class: errorFor(path).length ? 'invalid' : '',
          onchange: (event) =>
            setPath(state.draft, path, event.target.value === '' ? 0 : Number(event.target.value)),
        }),
      )
    default: {
      const name = path.split('.').pop()
      const long = ['description', 'message', 'notes', 'tagline'].includes(name)
      const input = long
        ? el('textarea', {
            value: value ?? '',
            class: errorFor(path).length ? 'invalid' : '',
            onchange: (event) => setPath(state.draft, path, event.target.value),
          })
        : el('input', {
            type: 'text',
            value: value ?? '',
            class: errorFor(path).length ? 'invalid' : '',
            onchange: (event) => setPath(state.draft, path, event.target.value),
          })
      return fieldShell(name, path, input, node['x-note'])
    }
  }
}

const renderRecordMap = (node, value, path) => {
  // type: object + additionalProperties → キー/値エディタ。x-keyRef でキーを選択肢化。
  const entries = Object.entries(value ?? {})
  const valueSchema = node.additionalProperties ?? {}
  const keyMarkers = node['x-keyRef']
  const container = el('div', {})

  const redraw = () => {
    container.replaceChildren(...buildRows())
  }

  const buildRows = () =>
    entries.map(([key, val], index) =>
      el(
        'div',
        { class: 'kv-row' },
        keyMarkers && pickMarker(keyMarkers, value)
          ? (() => {
              const select = el('select', {
                class: 'k',
                onchange: (event) => {
                  const record = getPath(state.draft, path) ?? {}
                  const nv = record[key]
                  delete record[key]
                  record[event.target.value] = nv
                  entries[index] = [event.target.value, nv]
                  redraw()
                },
              })
              loadOptions(pickMarker(keyMarkers, value)).then((options) => {
                select.append(el('option', { value: '' }, '(key)'))
                for (const option of options) {
                  select.append(el('option', { value: option.id }, option.id))
                }
                select.value = key
              })
              return select
            })()
          : el('input', {
              class: 'k',
              type: 'text',
              value: key,
              onchange: (event) => {
                const record = getPath(state.draft, path) ?? {}
                const nv = record[key]
                delete record[key]
                record[event.target.value] = nv
                entries[index] = [event.target.value, nv]
              },
            }),
        renderMapValue(valueSchema, val, `${path}.${key}`),
        el(
          'button',
          {
            onclick: () => {
              const record = getPath(state.draft, path) ?? {}
              delete record[key]
              entries.splice(index, 1)
              redraw()
            },
          },
          '×',
        ),
      ),
    )

  const addButton = el(
    'button',
    {
      onclick: async () => {
        const record = getPath(state.draft, path) ?? {}
        setPath(state.draft, path, record)
        let key = `key${entries.length}`
        if (keyMarkers) {
          const options = await loadOptions(pickMarker(keyMarkers, value))
          const unused = options.find((option) => !(option.id in record))
          key = unused ? unused.id : key
        }
        record[key] = skeletonValue(valueSchema)
        entries.push([key, record[key]])
        redraw()
      },
    },
    '+ add',
  )

  container.append(...buildRows(), addButton)
  return fieldShell(path.split('.').pop(), path, container, node['x-keyRef']?.[0]?.note)
}

const renderMapValue = (schema, value, path) => {
  if (schema.type === 'number' || schema.type === 'integer' || schema.enum || schema.anyOf) {
    return el('input', {
      class: 'v',
      type: 'number',
      step: 'any',
      value: value ?? '',
      onchange: (event) =>
        setPath(state.draft, path, event.target.value === '' ? 0 : Number(event.target.value)),
    })
  }
  return el('input', {
    class: 'v',
    type: 'text',
    value: typeof value === 'string' ? value : JSON.stringify(value),
    onchange: (event) => {
      let v = event.target.value
      try {
        v = JSON.parse(v)
      } catch {
        /* keep string */
      }
      setPath(state.draft, path, v)
    },
  })
}

const renderArray = (node, value, path, parent) => {
  const items = Array.isArray(value) ? value : []
  const itemSchema = node.items ?? {}
  const marker = pickMarker(itemSchema['x-ref'], parent)
  const container = el('div', {})

  const redraw = () => container.replaceChildren(...buildRows())

  const buildRows = () =>
    items.map((item, index) => {
      const itemPath = `${path}.${index}`
      const inner =
        itemSchema.type === 'object' || unionOf(itemSchema).length
          ? renderAnyObject(itemSchema, item, itemPath)
          : renderScalar(itemSchema, item, itemPath, marker)
      return el(
        'div',
        { class: 'array-item' },
        el(
          'div',
          { class: 'row-head' },
          el('span', {}, `#${index}`),
          el(
            'button',
            {
              onclick: () => {
                items.splice(index, 1)
                setPath(state.draft, path, items)
                redraw()
              },
            },
            '×',
          ),
        ),
        inner,
      )
    })

  const addButton = el(
    'button',
    {
      onclick: () => {
        items.push(skeletonValue(itemSchema))
        setPath(state.draft, path, items)
        redraw()
      },
    },
    '+ add',
  )

  container.append(...buildRows(), addButton)
  return fieldShell(path.split('.').pop() ?? path, path, container)
}

const renderObjectFields = (node, value, path) => {
  const parent = value ?? {}
  const fields = []
  for (const [name, property] of Object.entries(node.properties ?? {})) {
    const childPath = path ? `${path}.${name}` : name
    fields.push(renderAny(property, parent[name], childPath, parent))
  }
  return fields
}

const renderUnion = (node, value, path, parent) => {
  const discriminator = node['x-discriminator']
  const variants = unionOf(node)
  if (!discriminator || !variants.length) {
    // discriminator が無い union は raw JSON で編集してもらう。
    return fieldShell(
      path.split('.').pop() ?? '(value)',
      path,
      el('textarea', {
        value: JSON.stringify(value, null, 2),
        onchange: (event) => {
          try {
            setPath(state.draft, path, JSON.parse(event.target.value))
          } catch {
            /* invalid JSON while typing */
          }
        },
      }),
      'union (JSON で編集)',
    )
  }

  const current = value?.[discriminator]
  const variant =
    variants.find((v) => v.properties?.[discriminator]?.const === current) ?? variants[0]

  const select = el(
    'select',
    {
      onchange: (event) => {
        const chosen = variants.find(
          (v) => v.properties?.[discriminator]?.const === event.target.value,
        )
        if (!chosen) return
        // strictObject: 別 variant のフィールドを残すと検証で弾かれるので作り直す。
        const shared = {}
        for (const name of chosen.required ?? []) {
          shared[name] = skeletonValue(chosen.properties?.[name])
        }
        for (const [name, property] of Object.entries(chosen.properties ?? {})) {
          if ('const' in property) shared[name] = property.const
          else if (value && name in value) shared[name] = value[name]
        }
        shared[discriminator] = event.target.value
        assignDraft(path, shared)
        rerenderDetail()
      },
    },
    variants.map((v) =>
      el('option', { value: v.properties[discriminator].const }, v.properties[discriminator].const),
    ),
  )
  queueMicrotask(() => {
    select.value = variant.properties[discriminator].const
  })

  return el(
    'div',
    {},
    fieldShell(discriminator, `${path}.${discriminator}`, select),
    ...renderObjectFields(variant, value, path),
  )
}

const renderAny = (node, value, path, parent) => {
  const marker = pickMarker(node['x-ref'], parent)

  if (marker && node.type === 'string') {
    return renderScalar(node, value, path, marker)
  }

  if (unionOf(node).length) {
    return renderUnion(node, value, path, parent)
  }

  if (node.type === 'array') {
    return renderArray(node, value, path, parent)
  }

  if (node.type === 'object') {
    if (node.properties) {
      return el(
        'fieldset',
        { class: 'nested' },
        el('legend', {}, path.split('.').pop()),
        renderObjectFields(node, value, path),
      )
    }
    if (node.additionalProperties || node['x-keyRef']) {
      return renderRecordMap(node, value, path)
    }
    return fieldShell(
      path.split('.').pop(),
      path,
      el('textarea', {
        value: JSON.stringify(value ?? {}, null, 2),
        onchange: (event) => {
          try {
            setPath(state.draft, path, JSON.parse(event.target.value))
          } catch {
            /* typing */
          }
        },
      }),
    )
  }

  return renderScalar(node, value, path, marker)
}

const renderAnyObject = (node, value, path) => {
  if (unionOf(node).length) {
    return renderUnion(node, value, path, value)
  }
  return el('div', {}, renderObjectFields(node, value, path))
}

/* ---------- views ---------- */

const renderKinds = () => {
  const nav = document.getElementById('kinds')
  nav.replaceChildren(
    ...state.kinds.map((entry) =>
      el(
        'button',
        {
          class: entry.kind === state.kind ? 'active' : '',
          onclick: () => selectKind(entry.kind),
        },
        el('span', {}, entry.kind),
        el('span', { class: 'count' }, String(entry.count)),
      ),
    ),
  )
}

const renderRecords = () => {
  const list = document.getElementById('records')
  const query = state.query.toLowerCase()
  const visible = state.records.filter(
    (record) =>
      query.length === 0 ||
      record.id.toLowerCase().includes(query) ||
      record.label.toLowerCase().includes(query),
  )
  list.replaceChildren(
    ...visible.slice(0, 500).map((record) =>
      el(
        'li',
        {
          class: state.record?.id === record.id && !state.isNew ? 'active' : '',
          onclick: () => openRecord(record.id),
        },
        el('div', { class: 'rid' }, record.id),
        el('div', { class: 'rlabel' }, record.label),
      ),
    ),
    visible.length > 500 ? el('li', {}, `… 他 ${visible.length - 500} 件（検索で絞る）`) : null,
  )
}

const refsPanel = (detail) => {
  if (!detail) return null
  const { references = [], referencedBy = [] } = detail
  const row = (cells) =>
    el(
      'tr',
      {},
      cells.map((c) => el('td', {}, c)),
    )
  const link = (kind, id) => el('a', { onclick: () => navigateTo(kind, id) }, `${kind}/${id}`)

  return el(
    'div',
    { class: 'panel' },
    el('h3', {}, 'references'),
    references.length
      ? el(
          'table',
          { class: 'refs-table' },
          references.map((ref) =>
            row([
              el('code', {}, ref.path),
              ref.targets?.length
                ? link(ref.targets[0], ref.value)
                : `${ref.vocabulary ?? '?'}: ${ref.value}`,
            ]),
          ),
        )
      : el('p', { class: 'placeholder' }, '参照なし'),
    el('h3', {}, 'referenced by'),
    referencedBy.length
      ? el(
          'table',
          { class: 'refs-table' },
          referencedBy.map((entry) =>
            row([link(entry.kind, entry.id), el('code', {}, entry.path)]),
          ),
        )
      : el('p', { class: 'placeholder' }, 'どこからも参照されていない'),
  )
}

const resultPanel = () => {
  const result = state.lastResult
  if (!result) return null

  const lines = []
  lines.push(
    el(
      'p',
      { class: result.ok ? 'msg-ok' : 'msg-err' },
      result.dryRun
        ? `DRY-RUN → ${result.file}${result.ok ? '（書き込み可能）' : ''}`
        : `WROTE ${result.file} — post-check exit ${result.postCheck?.exitCode ?? '?'}`,
    ),
  )
  if (result.renamedFrom) lines.push(el('p', {}, `renamed from ${result.renamedFrom}`))
  for (const error of result.errors ?? []) {
    lines.push(el('p', { class: 'msg-err' }, `ERROR ${error}`))
  }
  if (result.diff?.length) {
    lines.push(
      el(
        'pre',
        {},
        result.diff
          .map((entry) => {
            const s = (v) => {
              const t = JSON.stringify(v)
              return t && t.length > 70 ? `${t.slice(0, 67)}…` : t
            }
            if (entry.type === 'added') return `+ ${entry.path} = ${s(entry.after)}`
            if (entry.type === 'removed') return `- ${entry.path} = ${s(entry.before)}`
            return `~ ${entry.path}: ${s(entry.before)} → ${s(entry.after)}`
          })
          .join('\n'),
      ),
    )
  }
  if (result.postCheck?.lines) {
    lines.push(el('pre', {}, result.postCheck.lines.slice(-6).join('\n')))
  }
  return el('div', { class: 'panel' }, el('h3', {}, 'result'), lines)
}

const renderDetail = () => {
  const detail = document.getElementById('detail')
  if (state.draft === undefined || state.spec === undefined) {
    detail.replaceChildren(el('p', { class: 'placeholder' }, '左から kind とレコードを選ぶ'))
    return
  }

  const head = el(
    'div',
    { class: 'detail-head' },
    el('h2', {}, state.isNew ? `(new ${state.kind})` : `${state.kind}/${state.record?.id ?? ''}`),
    state.record ? el('span', { class: 'file' }, state.record.file) : null,
    state.isNew ? el('span', { class: 'badge' }, 'unsaved') : null,
  )

  const toolbar = el(
    'div',
    { class: 'toolbar' },
    el('button', { onclick: runValidate }, 'validate'),
    el('button', { onclick: () => runWrite(true) }, 'preview diff (dry-run)'),
    el('button', { class: 'primary', onclick: () => runWrite(false) }, 'write'),
    state.isNew ? null : el('button', { onclick: duplicateRecord }, 'duplicate'),
    el('button', { onclick: resetDraft, disabled: state.isNew }, 'reset'),
  )

  const tabs = el(
    'div',
    { class: 'tabs' },
    el(
      'button',
      { class: state.tab === 'form' ? 'active' : '', onclick: () => switchTab('form') },
      'form',
    ),
    el(
      'button',
      { class: state.tab === 'json' ? 'active' : '', onclick: () => switchTab('json') },
      'raw json',
    ),
  )

  const body =
    state.tab === 'json'
      ? el('textarea', {
          style:
            'width:100%;min-height:60vh;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:12px',
          value: JSON.stringify(state.draft, null, 2),
          onchange: (event) => {
            try {
              state.draft = JSON.parse(event.target.value)
              state.issues = []
            } catch (error) {
              state.issues = [{ path: '', message: `invalid JSON: ${error.message}` }]
            }
          },
        })
      : unionOf(state.spec.schema).length
        ? renderUnion(state.spec.schema, state.draft, '', state.draft)
        : el('div', {}, renderObjectFields(state.spec.schema, state.draft, ''))

  detail.replaceChildren(head, toolbar, tabs, resultPanel() ?? '', body, refsPanel(state.detail))
}

const rerenderDetail = () => renderDetail()

/* ---------- actions ---------- */

const selectKind = async (kind) => {
  state.kind = kind
  state.record = undefined
  state.draft = undefined
  state.isNew = false
  state.issues = []
  state.lastResult = undefined
  state.detail = undefined
  state.spec = state.spec?.kind === kind ? state.spec : await api(`/api/schema?kind=${kind}`)
  const data = await api(`/api/records?kind=${kind}`)
  state.records = data.records
  renderKinds()
  renderRecords()
  renderDetail()
}

const openRecord = async (id) => {
  const data = await api(`/api/record?kind=${state.kind}&id=${encodeURIComponent(id)}`)
  state.record = data.record
  state.detail = data
  state.draft = structuredClone(data.record.raw)
  state.isNew = false
  state.issues = []
  state.lastResult = undefined
  renderRecords()
  renderDetail()
}

const navigateTo = async (kind, id) => {
  await selectKind(kind)
  await openRecord(id)
}

const newRecord = async () => {
  if (!state.kind) return
  state.spec =
    state.spec?.kind === state.kind ? state.spec : await api(`/api/schema?kind=${state.kind}`)
  state.record = undefined
  state.detail = undefined
  state.draft = structuredClone(state.spec.skeleton)
  state.isNew = true
  state.issues = []
  state.lastResult = undefined
  renderRecords()
  renderDetail()
}

const duplicateRecord = () => {
  if (!state.draft || !state.spec) return
  state.draft = structuredClone(state.draft)
  state.draft[state.spec.identityField] = ''
  state.record = undefined
  state.isNew = true
  state.issues = []
  state.lastResult = undefined
  renderDetail()
}

const resetDraft = () => {
  if (!state.record) return
  state.draft = structuredClone(state.record.raw)
  state.issues = []
  state.lastResult = undefined
  renderDetail()
}

const switchTab = (tab) => {
  // raw json 編集中の変更は onchange で既に draft へ反映済み。
  state.tab = tab
  renderDetail()
}

const runValidate = async () => {
  if (!state.kind || state.draft === undefined) return
  const result = await post('/api/validate', { kind: state.kind, value: state.draft })
  state.issues = result.issues ?? []
  state.lastResult = result.ok
    ? { ok: true, dryRun: true, file: '(schema only)', errors: [], diff: [] }
    : {
        ok: false,
        dryRun: true,
        file: '(schema only)',
        errors: state.issues.map((i) => `${i.path}: ${i.message}`),
        diff: [],
      }
  renderDetail()
}

const runWrite = async (dryRun) => {
  if (!state.kind || state.draft === undefined) return
  const result = await post('/api/write', {
    kind: state.kind,
    file: state.isNew ? undefined : state.record?.file,
    value: state.draft,
    dryRun,
  })
  state.lastResult = result
  state.issues = []

  if (!dryRun && result.ok) {
    // 書き込み成功: 一覧とレコードを取り直す（id rename もここで反映される）。
    const data = await api(`/api/records?kind=${state.kind}`)
    state.records = data.records
    await openRecord(result.id)
    state.lastResult = result
    const kindsData = await api('/api/kinds')
    state.kinds = kindsData.kinds
    renderKinds()
  }
  renderRecords()
  renderDetail()
}

/* ---------- boot ---------- */

const boot = async () => {
  document.getElementById('search').addEventListener('input', (event) => {
    state.query = event.target.value
    renderRecords()
  })
  document.getElementById('new-record').addEventListener('click', newRecord)
  document.getElementById('reload').addEventListener('click', async () => {
    await post('/api/reload', {})
    state.optionsCache.clear()
    const data = await api('/api/kinds')
    state.kinds = data.kinds
    if (state.kind) await selectKind(state.kind)
    renderKinds()
  })

  const data = await api('/api/kinds')
  state.kinds = data.kinds
  document.getElementById('status').textContent =
    `${data.kinds.reduce((sum, k) => sum + k.count, 0)} records` +
    (data.diagnostics.length ? ` — ${data.diagnostics.length} invalid file(s)` : '')
  renderKinds()
}

boot().catch((error) => {
  document.getElementById('status').textContent = `boot failed: ${error.message}`
})
