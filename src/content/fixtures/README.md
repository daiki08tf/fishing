# Content Fixtures

スキーマ検証用の**合成データ**である。現実の魚種・釣り場・法令を表すものではない。
`id` は `fixture-...` で始まり、実コンテンツと区別できるようにしている。

- `valid/` — 全種別の正常系
- `invalid/missing-required/` — 必須フィールド欠落
- `invalid/invalid-bounds/` — 数値範囲違反
- `invalid/malformed-source/` — 出典メタデータ不正
- `invalid/invalid-json/` — JSON 構文エラー
- `invalid/unknown-kind/` — 未知のコンテンツ種別ディレクトリ

これらはテスト（`src/content/load/contentLoader.test.ts`）から使用する。
