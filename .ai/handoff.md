# Handoff

最終更新: Phase 0B 完了時点

## このプロジェクトは何か

**Fishing** — 現代日本を舞台にした、リアル志向の釣りハクスラゲーム。

東京近郊で働く普通の会社員としてスタートし、休日や仕事帰りに釣りへ出かける。
魚を釣り、経験・知識・資金・名声を得て、道具・車・船・人脈を増やしながら、
日本中の釣り場と魚へ到達していく。

成長は Level によるステージ解放ではない。
**「装備・Knowledge・Skill・Transport の成長によって、アクセスできる世界が広がる」**
ことを早期に検証するのが Phase 4〜7 の目的である。

設計の SSOT は `docs/` 以下。
Product Decision の SSOT は `docs/DECISIONS.md`。

## ブランチと状態

- Repository: Fishing Game
- Branch: `deepseek/9cd8b72b2f3f`
- Workspace: current Git worktree
  （実際の作業ディレクトリは `git rev-parse --show-toplevel` で解決する）
- Phase 0A: `docs: establish product decisions and roadmap`
- Phase 0B: `chore: establish technical foundation for phase 0B`
  （末尾の「未完了・既知のギャップ」を参照）
- `main` / `origin/main` は `a12354b` のまま変更していない

コミットの位置は `git log --oneline` で確認する。
本文書にはマシン固有の絶対パスや作業ディレクトリの UUID を記録しない。

## Phase 0B で実装したもの

技術基盤のみ。**ゲームプレイは一切実装していない。**

| 領域 | 内容 |
|---|---|
| ビルド | React 19 + TypeScript 6 + Vite 8（`npm run dev` / `build` / `preview`） |
| 状態管理 | Zustand 5。アプリ起動状態・アクティブ画面・開発用表示のみ |
| テスト | Vitest 5。Domain / Content / Save / Architecture の決定論的テスト |
| 乱数 | `RandomSource` interface と `SeededRandomSource`（mulberry32、seed 再現） |
| Domain 契約 | FishSpecies / FishIndividual / FishTrait / Region / FishingSpot / FishOccurrence / Transport / AccessRequirement / PlayerProgression / KnowledgeState / Regulation / SourceRef / CareerState / JobDefinition / FinanceState / Gear / Save |
| Content 検証 | Zod によるスキーマと `npm run validate:content`（不正なら非ゼロ終了） |
| Save | schemaVersion 必須、v1 スキーマ、`migrateSave`（v1→v1、未来 version は安全に失敗） |
| 永続化 | `SaveRepository` interface（Domain 所有）+ InMemory 実装 + IndexedDB 実装 |
| PWA | manifest、Service Worker（シェルのみ）、192/512/apple-touch PNG + SVG アイコン |
| UI | 最小のアプリシェルのみ。ゲームプレイ画面は無し |
| 層の強制 | ESLint の no-restricted-imports / globals / properties + `tests/architecture` |
| CI | `.github/workflows/ci.yml`（typecheck → lint → format:check → validate:content → test:run → build） |

## アーキテクチャ境界

```
src/app   … 起動・配線（composition root）
src/ui    … 表示と入力のみ
src/state … Application / UI 状態（Zustand）
src/domain… ゲームルールと契約（最内層）
src/content… データとその検証スキーマ
src/infrastructure… 永続化などの実装
```

- `src/domain` は **外部パッケージを一切 import しない**。
  相対 import のみで `src/domain` 内に閉じる。
- `src/domain` は React / DOM / Zustand / IndexedDB / ブラウザ API に依存しない。
  `tsconfig.domain.json`（`lib: ES2022`、`types: []`）で型レベルでも強制している。
- 乱数は `RandomSource` を注入して使う。`Math.random()` は Domain で禁止。
- `src/ui` は infrastructure と `node:*` を import しない。
- これらの規則は `eslint.config.js` と `tests/architecture/` の両方で検査する。
  違反を検出できること自体もテストで確認している（偽陰性対策）。

### 意味論的なレビューについて

CI は「設計書に書かれていない機能を意味的に検出する」ことはしない。
機械的に安定しないためである（`docs/DECISIONS.md` §7）。
機械判定可能な制約のみを CI / lint / test が担当し、
**意味論的な Product Scope 逸脱の検出は human / code review の責務**とする。

## 実装上の重要な判断

1. **ディレクトリ構成** — `docs/ARCHITECTURE.md` §4 は `src/core` / `src/data` /
   `src/features` / `src/store` / `src/components` / `src/types` を推奨しているが、
   Phase 0B の指示に従い `app` / `domain` / `content` / `infrastructure` / `state` / `ui`
   を採用した。対応関係は core→domain、data→content、features→ui、store→state。
2. **乱数の置き場所** — `ARCHITECTURE.md` §3 は seeded RNG を Infrastructure に置くが、
   指示は「Domain が所有する注入可能な `RandomSource`」である。
   interface と決定論的実装を `src/domain/rng` に置いた（純粋・依存なし）。
3. **Save の validation / migration は infrastructure** — Domain は Zod に依存しない。
   Save の**契約型**は `src/domain/save`、**検証と migration** は
   `src/infrastructure/persistence` に置いた。
4. **Save schema v1 の範囲** — `docs/ARCHITECTURE.md` §9 の
   `player` / `inventory` / `codex` / `world` は設計文書で型が未定義のため含めない。
   定義済みの `progression` / `knowledge` / `career` / `finance` のみを含む。
   初期値ファクトリは作らない（開始時の資金・職種はゲームプレイ側の決定）。
5. **PROVISIONAL な型** — `Range` / `SeasonalProfile` / `TimeProfile` / `TideProfile` /
   `CurrentProfile` / `LengthDistribution` / `WeightModel` / `FightProfile` /
   `HabitatType` / `RegionRef` / `EnvironmentType` / `SpotKnowledgeConfig` /
   Gear 各 spec は設計文書で構造が未定義である。
   最小の表現を選び、コード内に `PROVISIONAL` と明記した。
   実データ投入時（Phase 2 / Phase 4）に正式化する。
6. **RNG アルゴリズム** — mulberry32 を採用し、`seed 42` の系列を
   golden test で固定した。アルゴリズムを変えるとテストが落ちる。
   バランス検証とバグ再現を優先した意図的な選択である。
7. **import は相対パス** — パスエイリアスを使わない。
   Vite / Vitest / tsx / tsc のすべてで同じ解決になることを優先した。
8. **整形** — Prettier は `docs/` `README.md` `.ai/` を対象外にする。
   設計文書は散文であり、機械整形の対象ではない。
9. **content データは空** — 検証を通すためだけの実在データを作らない。
   fixture は `fixture-` 接頭辞の合成データである。

## 検証方法

```bash
npm ci                 # 依存の再現
npm run check          # typecheck → lint → format:check → validate:content → test → build
npm run build          # 本番ビルド
npm run dev            # http://localhost:5173
npm run dev:host       # 同一 LAN の実機（iPhone Safari など）から開く
```

### モバイル実機での確認（Phase 0B 時点）

- `npm run dev:host` で LAN に公開し、iPhone Safari から `http://<MacのIP>:5173` を開く。
- PWA としてインストールするには secure context が必要である。
  `http://<IP>` は secure context ではないため、Service Worker は登録されない。
  実機で PWA を確認する場合は HTTPS で配信する（トンネル等）。
  Service Worker が無くてもアプリは動作する設計にしてある。
- Service Worker は本番ビルドでのみ登録する（開発中のキャッシュ事故を避けるため）。

### 直近の検証結果

- `npm run check`: PASS
- `npm run build`: PASS
- `npm run test:run`: 8 files / 51 tests PASS
- `npm run validate:content`: PASS（実コンテンツ 0 件。合成 fixture で正常系・異常系を検証）
- `npm audit`: 0 vulnerabilities
- 依存: direct 4 + dev 15、推移的を含めて 184 packages
- バンドル: JS 223.10 kB（gzip 70.29 kB）、CSS 1.83 kB（gzip 0.76 kB）
- 開発サーバー: `/`、`/manifest.webmanifest`、`/icons/icon-512.png`、`/src/app/main.tsx`、`/sw.js` が 200

## 未完了・既知のギャップ

- IndexedDB 実装は**ブラウザでの自動テストが無い**。
  検証済みなのは「IndexedDB が無い環境で明確に失敗する」経路のみ。
  fake-indexeddb などの導入は未実施。
- Service Worker はシェルのみ。オフラインでのゲームプレイキャッシュは未実装。
- アイコンは暫定デザイン（`scripts/generate-icons.mjs` で再生成可能）。
- `README.md` に開発者向けの起動手順が無い（Phase 0A の指示で設計文書を触っていない。
  追記する場合は独立した変更として行う）。
- 実コンテンツ（魚種・Spot・規則）は 0 件。Phase 4 以降で投入する。
- Gear / Regulation の一部フィールド（`value` / `months`）は PROVISIONAL。
- Save の初期値生成、ロード失敗時の UI 導線は未実装。

## 次の推奨タスク

**Phase 1 — Fishing Vertical Slice**（詳細は `.ai/current-task.md`）

1. `src/domain/fishing/` に Fishing Engine の状態機械を実装する（純粋・注入可能）。
2. `src/domain/encounter/` に最小の Encounter Engine を実装する（1 Spot・少数魚種）。
3. `src/ui/` に釣り画面の最小操作を実装する。Domain の判定を UI から書き換えない。
4. seed 固定で個体・挙動・勝敗が再現するテストを追加する。
5. `docs/ROADMAP.md` の Phase 1 Done 条件を満たしたか確認する。

## ブロッカー

- なし（Phase 0B の作業自体は完了）。
- 補足: 実行環境によっては Git メタデータ（`.git`）への書き込みが制限され、
  `git add` / `git commit` が失敗することがある。
  その場合はユーザー側でコミットを実行し、本文書を更新する。
