import { z } from 'zod'
import { CONTENT_SCHEMAS, type ContentKind } from '../../src/content/schema'
import { REFERENCE_SPECS, type RefSpec } from './references'
import { identityFieldOf } from './model'

/**
 * Zod schema → Studio フォーム仕様。
 *
 * `z.toJSONSchema`（io: input）で JSON Schema を作り、参照フィールドには
 * `x-ref` / `x-keyRef` を、discriminated union には `x-discriminator` を付ける。
 * UI はこの JSON だけを見てフォームを組み立てる（Zod を browser に持ち込まない）。
 */

export type JsonSchema = Record<string, unknown> & {
  readonly properties?: Record<string, JsonSchema>
  readonly items?: JsonSchema
  readonly anyOf?: readonly JsonSchema[]
  readonly required?: readonly string[]
  readonly enum?: readonly unknown[]
  readonly const?: unknown
}

export type RefMarker = {
  readonly targets?: readonly string[]
  readonly vocabulary?: string
  readonly when?: { readonly field: string; readonly is: string }
  readonly note?: string
}

type MutableSchema = Record<string, unknown>

/** zod union/discriminatedUnion は anyOf か oneOf で出る（文脈依存）。両方見る。 */
const variantsOf = (node: JsonSchema): readonly JsonSchema[] => {
  const anyOf = node.anyOf ?? (node as Record<string, unknown>)['oneOf']
  return Array.isArray(anyOf) ? (anyOf as readonly JsonSchema[]) : []
}

const toMarker = (spec: RefSpec): RefMarker => ({
  ...(spec.targets !== undefined ? { targets: [...spec.targets] } : {}),
  ...(spec.vocabulary !== undefined ? { vocabulary: spec.vocabulary } : {}),
  ...(spec.when !== undefined ? { when: spec.when } : {}),
  ...(spec.note !== undefined ? { note: spec.note } : {}),
})

const attach = (node: unknown, key: 'x-ref' | 'x-keyRef', spec: RefSpec): void => {
  if (typeof node !== 'object' || node === null) {
    return
  }
  const target = node as MutableSchema
  // 選択肢を持たない注記専用の spec（areaId / zoneAffinity などのローカル参照）は
  // x-note として付ける — UI は select ではなくヒント表示にする。
  if (spec.targets === undefined && spec.vocabulary === undefined) {
    if (spec.note !== undefined) {
      target['x-note'] = spec.note
    }
    return
  }
  const existing = target[key]
  const marker = toMarker(spec)
  target[key] = Array.isArray(existing) ? [...existing, marker] : [marker]
}

/** spec のパスを JSON Schema 上のノードへ解決し、x-ref を付ける。 */
const annotatePath = (roots: readonly JsonSchema[], spec: RefSpec): void => {
  const hops = spec.path.split('.')
  let nodes: readonly JsonSchema[] = roots

  for (let index = 0; index < hops.length; index += 1) {
    const hop = hops[index]
    if (hop === undefined) {
      return
    }
    const last = index === hops.length - 1
    const next: JsonSchema[] = []

    for (const node of nodes) {
      if (hop.endsWith('[]')) {
        const property = node.properties?.[hop.slice(0, -2)]
        const items = property?.items
        if (items === undefined) {
          continue
        }
        if (last) {
          attach(items, 'x-ref', spec)
        } else {
          next.push(items, ...variantsOf(items))
        }
        continue
      }

      if (hop === '*') {
        // record のキーが参照（methodAffinity.* など）。対象は直前まで解決した object 自身。
        attach(node, 'x-keyRef', spec)
        continue
      }

      const child = node.properties?.[hop]
      if (child === undefined) {
        continue
      }
      if (last) {
        attach(child, 'x-ref', spec)
      } else {
        next.push(child, ...variantsOf(child))
      }
    }

    nodes = next
  }
}

/**
 * anyOf バリアントの discriminator（全バリアントが同じプロパティに
 * 異なる const を持つフィールド）を検出し、`x-discriminator` を付ける。
 */
const markDiscriminators = (node: JsonSchema): void => {
  const variants = variantsOf(node)
  if (variants.length > 0) {
    const candidates = new Map<string, Set<unknown>>()
    for (const variant of variants) {
      for (const [name, property] of Object.entries(variant.properties ?? {})) {
        if ('const' in property) {
          const values = candidates.get(name) ?? new Set<unknown>()
          values.add(property.const)
          candidates.set(name, values)
        }
      }
    }
    for (const [name, values] of candidates) {
      // 全バリアントがそのプロパティを持ち、値が一意なら discriminator。
      const appliesToAll = variants.every(
        (variant) =>
          variant.properties?.[name] !== undefined && 'const' in variant.properties[name],
      )
      if (appliesToAll && values.size === variants.length) {
        ;(node as MutableSchema)['x-discriminator'] = name
      }
    }
    for (const variant of variants) {
      markDiscriminators(variant)
    }
  }

  for (const property of Object.values(node.properties ?? {})) {
    markDiscriminators(property)
  }
  if (node.items !== undefined) {
    markDiscriminators(node.items)
  }
}

export type FormSpec = {
  readonly kind: ContentKind
  readonly identityField: string
  readonly schema: JsonSchema
}

export const buildFormSpec = (kind: ContentKind): FormSpec => {
  const schema = z.toJSONSchema(CONTENT_SCHEMAS[kind] as z.ZodType, {
    io: 'input',
    unrepresentable: 'any',
  }) as JsonSchema

  const roots: JsonSchema[] = [schema, ...variantsOf(schema)]
  for (const spec of REFERENCE_SPECS[kind]) {
    annotatePath(roots, spec)
  }
  markDiscriminators(schema)

  return { kind, identityField: identityFieldOf(kind), schema }
}

/**
 * 新規レコードのスケルトン。必須フィールドだけを埋める最小形
 * （enum は先頭候補、number は 0、配列は空）。balance 値は発明しない —
 * 必須を満たすためのプレースホルダであり、保存前の validation が弾く。
 */
export const skeletonFor = (schema: JsonSchema): Record<string, unknown> => {
  const node = variantsOf(schema).length > 0 ? variantsOf(schema)[0] : schema
  if (node === undefined) {
    return {}
  }

  const out: Record<string, unknown> = {}
  const required = new Set(node.required ?? [])

  for (const [name, property] of Object.entries(node.properties ?? {})) {
    if (!required.has(name)) {
      continue
    }
    out[name] = skeletonValue(property)
  }

  return out
}

const skeletonValue = (node: JsonSchema): unknown => {
  if ('const' in node) {
    return node.const
  }
  if (Array.isArray(node.enum) && node.enum.length > 0) {
    return node.enum[0]
  }
  if (variantsOf(node).length > 0) {
    const first = variantsOf(node)[0]
    return first === undefined ? {} : skeletonValue(first)
  }

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
      return skeletonFor(node)
    default:
      return null
  }
}
