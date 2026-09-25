# AGENTS.md — AI / 新規開発者のための front door

このリポジトリは「Fishing」— 現代日本を舞台にしたリアル志向の釣りハクスラ（Vanilla TS / React / Vite / Zustand / IndexedDB）。

## 最初にやること

```bash
npm ci            # Node は .nvmrc（24）
./dev doctor      # 環境・生成物・authority map の健康診断（read-only）
./dev check       # quick 検証（編集のたび）
./dev check --full  # merge / handoff 前（全 simulation + build を含む）
```

## 概念を調べる

```bash
./dev authority              # authority 一覧
./dev authority save         # 1 件の詳細（source of truth / persistence / mutation points）
./dev impact save            # 変更影響（files / tests / consumers / save 影響）
./dev context progression    # AI 用の軽量コンテキスト（token 節約）
./dev scope                  # 変更中のファイルを system/authority 別に分類
./dev map                    # project map の概要（--write で再生成）
```

生成される地図:

- `.dev/authority-map.json` — authority の**キュレートされた**定義（人が保守）
- `.dev/project-map.json` — **生成物**。`./dev map --write` で再生成。doctor が鮮度を見る
- `src/content/generated/content-index.json` — content の索引（`npm run content:index`）

## 設計の基本（詳細は docs/）

- `docs/ARCHITECTURE.md` — レイヤー分離（UI / Domain / Content / Infrastructure）
- `docs/DATA_MODEL.md` — 全型の定義と authority
- `docs/DECISIONS.md` — 各 Phase の設計判断とその理由
- `docs/ROADMAP.md` — フェーズ履歴と今後

重要な不変条件（抜粋 — `./dev authority` で各 concept の notes を見る）:

- **Domain は依存を持たない**。React / zustand / zod / content / state / infrastructure を import しない（eslint + tests/architecture で強制）
- **RNG は注入**。`SeededRandomSource` のみ。同じ seed は同じ結果を返す
- **Store は Content を読まない**。UI / simulation が検証済み定義を渡す
- **Save は versioned**。`CURRENT_SAVE_SCHEMA_VERSION` を上げたら migration を足す。migration は純粋関数・例外を投げない・未来 version は拒否
- **hydration 完了前に Save を書かない**（persistenceCoordinator が保証）
- **Zone の landed は一つの authority**（`actualLandedZoneId` — 現在 `src/ui/fishing/useFishingSession.ts`。encounter 加重・abrasion・catch result が同じ値を見る）

## Content を編集するとき

```bash
npm run studio                     # Content Studio（Web UI、http://127.0.0.1:4310）
./dev studio list fish-species     # CLI / AI 向けにも同じ操作が使える
./dev studio write <kind> f.json --dry-run   # diff + 検証だけ（書かない）
./dev content-check                # 編集後の全体検証
```

詳細は `docs/CONTENT_STUDIO.md`。Studio は独自の検証を持たない — schema / 参照検査 / generated index は game 側の authority をそのまま使う。

## Save を触るとき

```bash
./dev save-check    # v1..current の fixture migration round-trip
./dev impact save   # save 関連ファイルとテスト
```

- schemaVersion を上げる = `SaveGame.ts` に新 type + `saveSchema.ts` に zod + `migrateSave.ts` に migrate 関数
- `tests/fixtures/save.ts` に新 version の fixture を足す（`./dev save-check` が自動で拾う — FIXTURES 配列を更新）

## 変更を終えるとき

```bash
./dev scope        # 触れた範囲の確認
./dev handoff      # handoff テンプレート（auto-detect + 記入欄）
./dev check --full # 最終検証
```

## Git 安全

- コミット前に `./dev scope` で gameplay / save / content を不用意に触っていないか確認
- 生成物は `.dev/project-map.json` と `src/content/generated/` のみコミット可
- `node_modules/` `dist/` `coverage/` `.env*` は ignore 済み
- ユーザーの未コミット作業を reset / stash / 上書きしない

## やってはいけないこと

- gameplay authority を「インフラの都合」で変更しない
- save schema を互換性なく書き換えない（必ず version bump + migration）
- `./dev` や `npm run check` の検証を黙ってスキップしない
- content の balance 値を validator の文脈で「良い/悪い」と判断しない（構造検証のみ）

## 更に詳しく

- `docs/DEVELOPMENT.md` — 開発ワークフロー
- `docs/TESTING.md` — テスト戦略と実行時間
- `docs/SAVE_COMPATIBILITY.md` — save 設計と migration 規則
- `docs/AI_WORKFLOW.md` — 将来の AI orchestration との境界
- `docs/RECOVERY.md` — バックアップ対象の分類（将来の Mac Recovery プロジェクト用）
