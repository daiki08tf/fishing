# Handoff

最終更新: Phase 2（Fish Individuals & Variety）完了時点

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
- Phase 1: `feat: implement fishing vertical slice`
- Phase 2: Fish Individuals & Variety（本変更。`git log --oneline` で確認する）

コミットの位置は `git log --oneline` で確認する。
本文書にはマシン固有の絶対パスや作業ディレクトリの UUID を記録しない。

## 実装済みの範囲

| Phase | 内容 | ゲームプレイ |
|---|---|---|
| 0A | 設計文書を worktree へ統合、`docs/DECISIONS.md` 追加 | なし |
| 0B | 技術基盤（ビルド・テスト・層の強制・RNG・Content 検証・Save・PWA・CI） | なし |
| 1 | Fishing Vertical Slice（状態機械・ファイト・魚の行動・釣り画面） | 釣り 1 種 |
| 2 | 個体生成（サイズ分布・体重・コンディション・Trait・百分位）と Codex / Record | 釣り 10 種 + 個体差 |

## Phase 2 で実装したもの

| 領域 | 内容 |
|---|---|
| 体長分布 | `src/domain/fish/lengthModel.ts`。`normal` / `lognormal` の判別 union。対数正規が「通常サイズが多く大型ほど急減する」形を作る |
| 百分位 | `lengthPercentile`。分布の累積確率から 0〜100 を算出。Trophy 判定と記録の基礎 |
| 体重 | `src/domain/fish/weightModel.ts`。W = a·L^b（a は g/cm^b）。独立した乱数では決めない |
| コンディション | `src/domain/fish/fishCondition.ts`。0〜1 の内部値 + 表示区分（thin/standard/good/excellent）。体重に ±15% だけ効く |
| Trait | `src/domain/fish/fishTraits.ts`。抽選と効果表（TraitModifiers）。Trophy / Heavy は乱数ではなくサイズ・体重から決まる |
| 個体生成 | `src/domain/fish/generateFishIndividual.ts`。Species → Length → Condition → Weight → Percentile → Trait |
| ファイト特性 | `src/domain/fishing/createFightingFish.ts`。個体と Trait 倍率から power / speed / stamina を導出 |
| Codex | `src/domain/codex/`。捕獲数・最大・最重・最高百分位・Trait 種類・自己記録を純粋関数で更新 |
| 魚種 | 検証用サンプル 10 種（`src/content/data/fish-species/`）。Engine は無改造 |
| 検証ツール | `npm run sample:individuals`（統計 sanity check）/ `npm run simulate:fishing`（釣行シミュレーション） |

## 主要な設計判断（Phase 2）

1. **体長分布は判別 union にした** — Phase 0B の `{mean, sd, min, max}` は
   「正規分布」1 種だけの最小表現だった。Phase 2 で `kind` を持つ union にし、
   `lognormal` を追加した。将来 `empirical`（実測データ）を足すときも、
   メンバーを 1 つ追加するだけで済む。
2. **体重の単位を明示した** — `lengthWeightA` は **g/cm^b**（文献値をそのまま貼れる単位）、
   戻り値は kg。実装中に単位を取り違えて「20cm の魚が 89kg」になるバグを作り、
   統計チェック（体重 / 体長^3 が現実的な範囲か）で検出して修正した。
   この検査はテストとスクリプトの両方に残してある。
3. **Trophy は乱数にしない** — size percentile が閾値（既定は上位 1%）以上で付与する。
   Heavy も標準体重比から決まる。「レア度は乱数ではなく、サイズ分布上の位置で決まる」
   という設計（GAME_DESIGN.md §5.1 / §6）に対応する。
4. **Trait の効果は表で持つ** — `TRAIT_MODIFIERS` に倍率を書き、
   `combineTraitModifiers` で乗算合成する。FishingEngine は Trait 名を一切知らず、
   合成済みの 2 つの倍率（run の起こりやすさ・持続時間）だけを受け取る。
   **Trait を追加しても Engine は変わらない**。
5. **乱数の消費順を固定** — Encounter（1〜2）→ 個体（体長 2 → コンディション 2 →
   Trait 4）→ ファイト特性（3）→ 待ち tick（1）。Trait は成立しなくても必ず 4 回引く
   （結果に依存して消費数が変わらないようにするため）。
6. **Codex は純粋関数** — `recordCatch(state, entry)` が新しい state と
   「初記録か」「自己記録か」「新 Trait か」を返す。UI はルールを持たない。
   自己記録は**百分位が最も高い個体**とする。
7. **魚種追加は Content 追加だけで完結する** — ブラウザは `import.meta.glob`、
   Node は fs で同じディレクトリを読み、共通の `assembleBuiltInContent` で検証・組み立てる。
   JSON を 1 つ足せば Encounter に登場する。カタログのコード変更も Engine の変更も要らない。
8. **`weightModel` を必須にした** — 体重を体長から導出する以上、
   係数が無い魚種は扱えない。Schema と Domain 型の両方で必須にした
   （Phase 0B の「省略可」から変更）。
9. **Codex はまだ Save に入れていない** — Save schema v2 と migration は
   永続化を扱う Phase で行う。現状はアプリ実行中のみ保持する。
10. **percentile はまだ XP に接続していない** — Phase 3 で接続する
    （設計上も「Phase 2 では XP 等へまだ接続しない」と決められている）。

## アーキテクチャ境界（Phase 0B から継続）

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
- これらは `eslint.config.js` と `tests/architecture/` の両方で検査する。

### 意味論的なレビューについて

CI は「設計書に書かれていない機能を意味的に検出する」ことはしない。
機械的に安定しないためである（`docs/DECISIONS.md` §7）。
機械判定可能な制約のみを CI / lint / test が担当し、
**意味論的な Product Scope 逸脱の検出は human / code review の責務**とする。

## 検証方法

```bash
npm ci                      # 依存の再現
npm run check               # typecheck → lint → format:check → validate:content → test → build
npm run build               # 本番ビルド
npm run dev                 # http://localhost:5173
npm run dev:host            # 同一 LAN の実機（iPhone Safari など）から開く
npm run validate:content    # Content の検証（不正なら非ゼロ終了）
npm run sample:individuals  # 個体生成の統計 sanity check（既定 10,000 個体/魚種）
npm run sample:individuals -- --species phase2-sample-fish-e --samples 50000
npm run simulate:fishing -- --seed demo
npm run simulate:fishing -- --seed demo --species phase2-sample-fish-e --verbose
npm run simulate:fishing -- --seed demo --policy reel
npm run simulate:fishing -- --seed demo --policy give
```

### モバイル実機での確認

- `npm run dev:host` で LAN に公開し、iPhone Safari から `http://<MacのIP>:5173` を開く。
- PWA としてインストールするには secure context が必要である。
  `http://<IP>` は secure context ではないため、Service Worker は登録されない。
  実機で PWA を確認する場合は HTTPS で配信する（トンネル等）。
  Service Worker が無くてもアプリは動作する設計にしてある。
- Service Worker は本番ビルドでのみ登録する（開発中のキャッシュ事故を避けるため）。

### 直近の検証結果（Phase 2 完了時点）

- `npm run check`: PASS
- `npm run build`: PASS
- `npm run test:run`: 20 files / 150 tests PASS
- `npm run validate:content`: PASS（11 件 = 魚種 10 + 釣り場 1）
- `npm run sample:individuals`（10,000 個体 × 10 魚種）: すべて invalid=0。
  例: サンプル魚A は length 16.3–38cm / weight 0.047–0.690kg / trophy 0.96%
  （上位 1% 設定どおり）、buckets は common > p50-90 > p90-99 > p99+ と単調減少
- `npm run simulate:fishing -- --species <id>`: 10 魚種すべて LANDED
  （例: A 142 tick / E 207 tick / I 219 tick）
- 連打の検証: REEL 連打 → LINE_BREAK（53 tick）、GIVE 連打 → HOOK_ESCAPE（66 tick）
- 開発サーバー実測: root、釣り画面、カタログ、魚種 JSON がすべて 200。
  `import.meta.glob` が魚種ファイルを解決していることも確認
- バンドル: JS 345.96 kB（gzip 105.10 kB）、CSS 4.69 kB（gzip 1.45 kB）、167 modules

## 未完了・既知のギャップ

- 魚種は検証用サンプル 10 種。**現実の魚データではない**（名前も数値も暫定）。
- Codex は Domain のみ。Save schema v2 と永続化は未実装（アプリ実行中だけ保持）。
- `percentile` は XP / Reputation に未接続（Phase 3 以降）。
- Trait の閾値・発生率・倍率はすべて `PROVISIONAL`。プレイテストで調整する。
- 釣り場は 1 つ。地域・複数 Spot・時間帯・天候・潮は未実装（Phase 4）。
- 装備・タックル・釣法は無い。REEL / GIVE の強さは常に同じ。
- UI の自動テストは無い（意図的に Domain を優先）。
- 実行時 Content 検証のため Zod をブラウザに含む（gzip +約 30 kB、Phase 1 からの継続課題）。
- IndexedDB 実装は依然ブラウザでの自動テストが無い（Phase 0B からの持ち越し）。
- 実データ由来の分布（`empirical`）は未実装。union に追加できる形にはなっている。

## 次の推奨タスク

**Phase 3 — Angler Progression**（詳細は `.ai/current-task.md`）

1. XP 計算と Lv1〜100 カーブを `src/domain/progression/` に実装する。
2. Phase 2 の `percentile` をサイズ上位率ボーナスへ接続する。
3. Skill（7 種）をファイトへ緩やかに効かせる（DECISIONS §3 の範囲内で）。
4. XP 減衰と「新しい挑戦」ボーナスを入れ、反復が最適解にならないことをテストで示す。
5. Level がアクセスキーになっていないことを機械的に検査し続ける。

## ブロッカー

- なし（Phase 2 の作業自体は完了）。
- 補足: 実行環境によっては Git メタデータ（`.git`）への書き込みが制限され、
  `git add` / `git commit` が失敗することがある。
  その場合はユーザー側でコミットを実行し、本文書を更新する。
