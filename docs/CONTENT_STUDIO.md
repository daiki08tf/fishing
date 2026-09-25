# Content Studio

`src/content/data/**/*.json` を手で編集せずに、Content を閲覧・作成・編集・検証・書き出すためのローカルツール。gameplay の authority は変更しない — Studio は既存の content pipeline の上に乗る薄い層。

## 起動

```bash
npm run studio        # http://127.0.0.1:4310
# または
./dev studio serve --port 4310
```

127.0.0.1 のみに bind するローカル専用ツール。認証・DB・外部サービスは無い。

## できること

- **Browse / Search** — 左サイドバーで kind（16 種）を選び、id / name で検索
- **Inspect** — レコードの全フィールド、参照（uses）、被参照（referenced by）
- **Edit** — schema から生成されるフォーム（enum は select、参照は選択肢ドロップダウン、record キー参照はキー選択、配列・ネスト・discriminated union 対応）。raw JSON タブもある
- **New / Duplicate** — 必須フィールドだけを埋めたスケルトンから開始。id 重複は拒否
- **Validate** — `parseContentRecord`（`src/content/schema`）と同じ検査。エラーはフィールドの横に出る
- **Preview diff** — 書き込み前にフィールド単位の diff と検証結果を表示（dry-run）
- **Write** — atomic write（tmp → rename）→ generated 再生成（`content:index`）→ post-check（`validate:content`）
- **Rename** — id を変えて書き込むと、規約どおり `<id>.json` のファイルは rename される

## CLI / AI 向けインターフェース

Web UI と同じ store/write を CLI からも使える（`--json` で機械可読）:

```bash
./dev studio kinds                    # kind 一覧と件数
./dev studio list fish-species        # レコード一覧（--q で絞り込み）
./dev studio get fish-species aigo    # 1 件 + 参照/被参照
./dev studio schema gear              # フォーム仕様（JSON Schema + x-ref）
./dev studio refs fishing-spots <id>  # 参照 / 被参照
./dev studio options --targets=regions  # 参照選択肢（--vocabulary=tradeTags で語彙）
./dev studio validate brands x.json   # schema 検証のみ
./dev studio diff brands x.json [--target old.json]   # 差分プレビュー（書かない）
./dev studio write brands x.json [--target old.json] [--dry-run]
```

`write` の安全弁（この順で全部通ると書き込む）:

1. `parseContentRecord` で schema 検証（strictObject — 未知キーは拒否）
2. id 空間の重複検査（Buyer/Contact の共有 ContactId 空間を含む）
3. 仮想 corpus での参照整合性（`validateContentReferences` と同じ規則）
4. dry-run ならここで終了（diff + 検証結果だけ返す）
5. tmp → rename の atomic write
6. `npm run content:index` 相当の generated 再生成
7. `npm run validate:content` 相当の post-check（結果を報告）

Studio 自身は新しい検証規則を持たない。authority は常に game 側にある。

## アーキテクチャ

```
scripts/studio/
  model.ts       — loadContentDirectory で store を構築（record ↔ file / id 索引 / label）
  references.ts  — REFERENCE_SPECS: フィールド→参照先の地図 + referencesOf / referencedBy / 語彙
  formSpec.ts    — z.toJSONSchema(io:input) + x-ref / x-keyRef / x-discriminator 注釈 + skeleton
  diff.ts        — フィールド単位 JSON diff + シリアライズ規約
  write.ts       — 上記の安全な書き込みパイプライン
  server.ts      — node:http API + 静的配信（public/）。認証なし・127.0.0.1 のみ
  cli.ts         — 上記すべてをCLIから（--json 対応）
  public/        — 依存ゼロの vanilla JS SPA（build なし）
tests/studio/studio.test.ts — store / refs / formSpec / diff / write（tmpdir sandbox）
```

### 参照の記述（REFERENCE_SPECS）

`scripts/studio/references.ts` が「どのフィールドが何を参照するか」を持つ。これは表示/選択肢用のメタデータであり、**権威ではない**。検査の権威は `src/content/catalog/references.ts`。新しい参照規則を足すときは:

1. まず `catalog/references.ts` に検査を書く（そこが FAIL するかで正しさが決まる）
2. `scripts/studio/references.ts` に同じ参照をフォーム用に記述する
3. `tests/studio` の marker カバレッジテストが、記述したパスが schema に実在することを保証する

パス記法: `field`（スカラー）/ `field[]`（配列要素）/ `items[].sub`（配列内フィールド）/ `map.*`（record キー）/ `when: {field, is}`（条件つき — 例: `contact-rewards.targetId` は `kind` で参照先が変わる）。

### 特殊な参照

- **Buyer / Contact は同じ ID 空間（ContactId）** — `contacts-or-buyers` として扱う
- **species-trade-profiles の同一性は `speciesId`**（`id` フィールドを持たない）
- **ローカル参照**（`spot.areaId` → その region の areas、`fishTable[].zoneAffinity.*` → 同じ Spot の fishingZones）は `note` だけ付けてドロップダウンにはしない
- **語彙参照**（tradeTags / offeringTags / transportTypes / permitIds）は vocabulary として扱い、現在の Content / Domain 定数から選択肢を集める

## 注意

- Studio の write は **Git commit しない**。差分は `./dev scope` / `git diff` で確認してから owner が commit する
- post-check が FAIL した場合、ファイルは書き込まれたまま残る（revert は `git checkout` か再編集で）
- サーバ起動中に外部からファイルを編集した場合は UI の reload ボタン（または `./dev studio` は毎回読み直す）

## 関連

- `docs/DATA_MODEL.md` — 全型の定義
- `docs/TESTING.md` — `validate:content` の位置づけ
- `docs/AI_WORKFLOW.md` — orchestration 境界
