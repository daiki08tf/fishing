# Handoff

最終更新: Phase 1（Fishing Vertical Slice）完了時点

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
- Phase 1: Fishing Vertical Slice（本変更。`git log --oneline` で確認する）

コミットの位置は `git log --oneline` で確認する。
本文書にはマシン固有の絶対パスや作業ディレクトリの UUID を記録しない。

## 実装済みの範囲

| Phase | 内容 | ゲームプレイ |
|---|---|---|
| 0A | 設計文書を worktree へ統合、`docs/DECISIONS.md` 追加 | なし |
| 0B | 技術基盤（ビルド・テスト・層の強制・RNG・Content 検証・Save・PWA・CI） | なし |
| 1 | Fishing Vertical Slice（状態機械・ファイト・魚の行動・釣り画面） | **あり（釣り 1 種）** |

## Phase 1 で実装したもの

| 領域 | 内容 |
|---|---|
| 状態機械 | `src/domain/fishing/FishingPhase.ts`。IDLE / CASTING / WAITING / BITE / HOOK_WINDOW / HOOKED / FIGHTING / LANDING / LANDED と失敗 3 状態（HOOK_MISSED / HOOK_ESCAPE / LINE_BREAK） |
| 遷移の強制 | 状態ごとの許可コマンド表 + Engine の private 遷移。表に無いコマンドは状態を変えずに拒否する |
| Engine | `src/domain/fishing/FishingEngine.ts`。コマンド（cast / hook / reel / give / reset）と tick で進行する |
| ファイト | Fish Stamina / Line Tension / REEL / GIVE。テンション帯による REEL 効率、緩みすぎによるフックアウト、上限超過によるラインブレイク |
| 魚の行動 | `src/domain/fishing/FishBehavior.ts`。NORMAL / RUN。Domain が決定し、RUN 中はテンション増加が増え REEL 効率が落ちる |
| 個体生成 | `src/domain/fishing/createFightingFish.ts`。魚種の `lengthModel` / `weightModel` / `fightProfile` から個体を生成。stamina / power / speed / individualSeed を持つ |
| Encounter | `src/domain/encounter/encounterEngine.ts`。FishOccurrence の basePresence からヒット判定と魚種選択を行う。外れ（ボウズ）もある |
| Content | サンプル魚種 1 件 + サンプル釣り場 1 件（`src/content/data/`）。実行時にも Zod で検証する（`src/content/catalog/`） |
| UI | `src/ui/fishing/`。状態・魚名・スタミナ・テンション・行動・ログを表示し、CAST / HOOK / REEL / GIVE / RESET を操作する。モバイル優先 |
| 検証ツール | `npm run simulate:fishing`。seed と policy（balanced / reel / give）で Domain のループを流して確認できる |

## 主要な設計判断（Phase 1）

1. **状態遷移はデータで強制する** — `ALLOWED_COMMANDS` が唯一の遷移表。
   UI は `dispatch(command)` を呼ぶだけで、遷移も勝敗も決められない。
2. **乱数の消費順を固定する** — 同じ seed から同じ個体・同じ行動系列・同じ結果が出る。
   順序を変えると再現性が壊れるため、`createFightingFish` と Engine の抽選順は
   コード上で明示している。
3. **糸の緩み（slack）は時間ベース** — 操作ごとではなく tick ごとに進める。
   連打するほど不利になる（＝操作速度がゲーム性になる）ことを避けるため。
   実装中に一度この誤りを作り、テストで検出して修正した。
4. **走っている魚は竿を引く** — RUN 中は毎 tick テンションが加わり
   （`runPullTensionGain`）、GIVE の効きが弱い（`runGiveTensionReliefMultiplier`）。
   これが無いと「走られたら GIVE し続ける → テンションが 0 に張り付く →
   フックが外れる」という詰み筋になる。テストで検出して修正した。
5. **連打では勝てない** — REEL 連打は LINE_BREAK、GIVE 連打は HOOK_ESCAPE になる。
   釣り上げるにはテンションを良い帯に保ち続ける必要がある。
6. **魚の情報はバイトまで伏せる** — WAITING 中は `snapshot.fish` が null。
   UI が先に魚を知ることはできない。
7. **ゲーム調整値は Domain、現実データは Content** — 調整値は
   `src/domain/fishing/FishingTuning.ts` に `PROVISIONAL` として置く
   （DATA_MODEL.md §12 の「Observed / sourced」と「Game tuned」の分離）。
8. **Phase 1 のコンテンツはサンプル** — `phase1-sample-*` は現実の魚・釣り場ではない。
   現実データは Phase 2 / Phase 4 で投入する。
9. **セッションは画面ローカルに保持** — Zustand には置かない。
   Domain の Engine をグローバル状態に持ち込まないため
   （`src/ui/fishing/useFishingSession.ts`）。
10. **実行時の Content 検証はコストを伴う** — Zod をブラウザにも含めるため
    バンドルが増える（Phase 0B 比で gzip 約 +30 kB）。
    破損した JSON が UI に届かない利点を優先した。
    最適化するならビルド時検証のみにする選択肢がある（Phase 2 以降の課題）。

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
- これらの規則は `eslint.config.js` と `tests/architecture/` の両方で検査する。
  違反を検出できること自体もテストで確認している（偽陰性対策）。

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
npm run simulate:fishing -- --seed demo --verbose
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

### 直近の検証結果（Phase 1 完了時点）

- `npm run check`: PASS
- `npm run build`: PASS
- `npm run test:run`: 13 files / 96 tests PASS
- `npm run validate:content`: PASS（サンプル 2 件。fixture で正常系・異常系も検証）
- `npm audit`: 0 vulnerabilities
- バンドル: JS 331.60 kB（gzip 101.78 kB）、CSS 4.08 kB（gzip 1.30 kB）、144 modules
- 開発サーバー実測: root、`src/app/main.tsx`、`src/ui/fishing/FishingScreen.tsx`、
  サンプル Content の JSON がすべて 200
- シミュレータ実測（seed=demo）:
  balanced → LANDED（121 tick）、reel 連打 → LINE_BREAK、give 連打 → HOOK_ESCAPE

## 未完了・既知のギャップ

Phase 1 の範囲で意図的に残したもの:

- 魚種 1 種、釣り場 1 つ。どちらも現実データではない。
- 天候・潮・時間帯・季節はファイトに影響しない（Encounter は basePresence のみ）。
  設計上の入力（ARCHITECTURE.md §7）は Phase 4 以降。
- 装備・タックル・釣法は存在しない。REEL / GIVE の強さは常に同じ。
- Knowledge / 成長 / 経済 / 交通は未実装（Phase 3〜7）。
- UI の自動テストは無い（意図的に Domain を優先）。
- セッション seed は UI 側で `Date.now()` から作る。
  同じ経過を再現したい場合は画面の「同じSeedで再挑戦」を使う。
- ファイトのバランス値は `PROVISIONAL`。プレイテストで調整する前提。
- IndexedDB 実装は依然ブラウザでの自動テストが無い（Phase 0B からの持ち越し）。
- Service Worker はシェルのみ。オフラインでのゲームプレイキャッシュは未実装。

## 次の推奨タスク

**Phase 2 — Fish Individuals & Variety**（詳細は `.ai/current-task.md`）

1. 個体生成を正式化する（分布・条件・Trait・percentile）。
2. Trait をファイト特性へ反映する
   （Trophy / Strong Runner / Heavy / Old / Scarred / Aggressive）。
3. 非現実的なサイズ・重量が出ないことを統計テストで担保する。
4. Codex に記録できる最小構造を Domain に追加する。
5. 魚種を増やしても Engine を書き換えないことを確認する（Content 追加のみで完結）。

## ブロッカー

- なし（Phase 1 の作業自体は完了）。
- 補足: 実行環境によっては Git メタデータ（`.git`）への書き込みが制限され、
  `git add` / `git commit` が失敗することがある。
  その場合はユーザー側でコミットを実行し、本文書を更新する。
