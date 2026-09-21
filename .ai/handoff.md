# Handoff

最終更新: Phase 6（Tackle Depth）完了

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
- Phase 2: `feat: formalize fish individuals and variety`
- Phase 3: Angler Progression + Codex 永続化の整合性修正
  （本変更。`git log --oneline` で確認する）
- Phase 3.1: Save / Load の配線（起動時 hydration と autosave）
- Phase 4: World / Time / Access / Spot Knowledge（自宅から釣りへ行って帰るループ）
- Phase 5: Economy / Calendar / Shop / Transport（給料・生活費・有給・中古車）
- Phase 6: Tackle Depth（Gear 7 カテゴリ・Loadout・互換性・Tackle Resolver・
  架空ブランド・Save v5）。前セッションの基盤 `feat: add economy and tackle foundation`
  を引き継いで完成させた

コミットの位置は `git log --oneline` で確認する。
本文書にはマシン固有の絶対パスや作業ディレクトリの UUID を記録しない。

## 実装済みの範囲

| Phase | 内容 | ゲームプレイ |
|---|---|---|
| 0A | 設計文書の統合、`docs/DECISIONS.md` | なし |
| 0B | 技術基盤（ビルド・層の強制・RNG・Content 検証・Save・PWA・CI） | なし |
| 1 | Fishing Vertical Slice（状態機械・ファイト・魚の行動・釣り画面） | 釣り 1 種 |
| 2 | 個体生成（サイズ・体重・コンディション・Trait・百分位）と Codex | 釣り 10 種 + 個体差 |
| 3 | Angler Progression（XP・Lv1〜100・7 Skill・Perk・Save v2） | 成長ループ |
| 3.1 | Save / Load の配線（起動時 hydration・autosave・壊れた Save の扱い） | 再起動で成長と記録が残る |
| 4 | World（ゲーム内時間・移動・Spot・Access・Knowledge）と Map / Spot 画面 | 自宅から釣りへ行って帰る |
| 5 | Economy / Schedule / Shop（給料・生活費・有給・中古車購入） | 働きながら釣りに行く生活ループ |
| 6 | Tackle Depth（Gear 7 カテゴリ・Loadout・互換性・Tackle Resolver・架空ブランド） | 装備を組んで狙う |

## Phase 6（Tackle Depth）で実装したもの

前セッション分の基盤は checkpoint commit `19ed43f`
（`feat: add economy and tackle foundation`）にあり、working tree は clean だった。
このセッションは**それを再利用**して残作業（配線・Save・UI・テスト）だけを実装した。
基盤の作り直しや別方式への差し替えはしていない。

| 領域 | 内容 |
|---|---|
| Gear（基盤） | `src/domain/gear/Gear.ts` — Rod / Reel / Line / Leader / Hook / Lure / Bait の型。`GearTuning.ts` にゲーム調整値を分離 |
| Brand | `src/domain/gear/Brand.ts` — 架空ブランド。**性能倍率を持たない**（表示・整理の属性） |
| Method | `src/domain/method/FishingMethod.ts` — lure / light_lure / bait / bottom |
| Loadout | `src/domain/tackle/Loadout.ts` — スロット・Starter gear・装備変更の検証（存在 / 所有 / カテゴリ） |
| Inventory | `src/domain/tackle/Inventory.ts` — `ownedGearIds` のみ（耐久・消費を扱わない） |
| Compatibility | `src/domain/tackle/compatibility.ts` — fatal / warning / suboptimal / good / excellent |
| Resolver | `src/domain/tackle/resolveTackle.ts` — `ResolvedFishingSetup` / `EncounterProfile` / `composeFishingModifiers` |
| Modifier | `PlayerFishingModifiers` に `maxTensionMultiplier` / `slackToleranceMultiplier`。Engine は解決済み modifier だけを使う |
| Catalog | `assembleContent` / `builtInContent` / `nodeContent` が gear・methods・brands を実行時カタログへ載せる。参照切れは `references.ts` が検出する |
| Encounter | `encounterEngine.ts` の `EncounterProfile`（method / offering の重み付け）と `speciesAffinity`。魚種ごとの相性は Content |
| Save | schema **v5**（inventory / loadout）。v4 → v5 migration で Starter gear と有効な Starter loadout を付与 |
| Store | `equipGear` / `setMethod` / `purchaseGear` / hydrate / autosave slice。判定は Domain に委ねる |
| Shop | Gear 商品を Content から並べる。購入は cash 減少 + `ownedGearIds` 追加（自動装備はしない） |
| UI | TACKLE 画面（Current Loadout / 互換性 / 所有 Gear からの選択）、SHOP の Gear 一覧、SPOT のタックル要約 |
| 検証 | `npm run simulate:tackle`（Starter / Finesse / Balanced / Power の比較） |

### Phase 6 の主な設計判断

1. **互換性は「使用不可」を最小にする** — `fatal` だけが装備不可。
   warning / suboptimal は使用可能（現実でも外れた道具は使える）。
   例: ロッド上限の 1.3 倍を超えるルアーだけが fatal。
2. **フックの掛かりを Engine に接続した** — `hookSuccessModifier` は 0 が基準の加算値で、
   `effectiveHookWindowTicks` を広げる。これまで Engine から使われていなかった
   （Skill の Hooking だけが値を動かしていた）ため、フック装備が釣りへ効く経路を追加した。
3. **フックのサイズ判定を修正** — フックは「数字が大きいほど小さい針」。
   旧実装は大小が逆だったため、大型魚に小さい針 / 小型魚に大きい針で警告するよう直した。
4. **ブランドは性能を持たない**（DECISIONS §1）— 性能差は各製品の現実由来スペックで表現する。
5. **Series / sizeClass は Engine の分岐条件にしない** — 商品を増やしても Engine は変わらない。
   `tests/contracts/tackleContent.test.ts` が「新 Gear を足しても Engine 改造が要らない」ことを、
   `tests/architecture/tackle-boundaries.test.ts` が「fishing / encounter domain に具体 Gear ID が
   現れない」ことを検査する。
6. **Save は v4 → v5 の 1 段だけ**（まだリリース前なので migration chain を増やさない）。
   v4 以前のプレイヤーには Starter gear 一式と有効な Starter loadout を付与し、
   「何も買えず釣りができない」状態を作らない。
7. **ShopItem.grantsGearId を追加** — 「1 商品 = セット売り」を Content で表現できる。
   参照切れは validate:content が検出する。

### Phase 6 の検証結果（このセッション）

- `npm run check`: PASS（typecheck / lint / format / validate:content / test / build）
- `npm run test:run`: **54 files / 482 tests PASS**（Phase 6 開始時は 45 files / 377 tests）
- `npm run validate:content`: PASS（**56 件**。魚種 10 + 釣り場 8 + Gear 23 + Methods 4 + Brands 10 + 商品 1）
- `npm run simulate:tackle`: 11 チェックすべて PASS。
  大型（phase2-sample-fish-i）を 9 割まで攻める操作では
  Power 100% / Starter 67% / Balanced 49% / Finesse 22% が取り込みに成功し、
  LINE_BREAK は Finesse 94 回・Power 0 回。
  小型と大型が混ざる場所では Finesse が小型 86 / 大型 30、Power が小型 37 / 大型 79 を掛ける
- `npm run simulate:day`: 9 チェックすべて PASS（変化なし）
- `npm run simulate:trip`: 6 チェックすべて PASS（変化なし）
- `npm run simulate:progression -- --catches 2000`: 9 チェックすべて PASS（変化なし）
- `npm run simulate:fishing -- --seed demo`: LANDED（174 tick。Phase 4 から変化なし。
  このスクリプトはタックルを渡さないため、中立条件の挙動は保たれている）
- `npm run sample:individuals -- --samples 10000`: 全魚種 invalid=0（変化なし）
- バンドル: JS 447.06 kB（gzip 133.24 kB）、CSS 5.36 kB（gzip 1.55 kB）
- 開発サーバー実測: `/` 200、TACKLE 画面 / SHOP 画面 / builtInContent /
  tackle domain / playerStore / gear JSON / brand JSON / method JSON がすべて 200
- UI スモーク（`tests/ui/tackleScreenSmoke.test.ts`）: 新規ゲームの初期状態で
  TACKLE 画面が Starter 装備を描画し、SHOP が Gear とブランドを並べることを確認

## Phase 5 で実装したもの

| 領域 | 内容 |
|---|---|
| 時間進行 | 移動・釣り・帰宅・**翌朝まで休む**（`sleepUntilMorning`）。仕事による制限は無い |
| 暦 | `WorldTime` の日付・曜日・時分・日跨ぎ。曜日は将来（混雑・大会・季節・釣り場ルール）のために保持 |
| 資金 | `src/domain/economy/`。円単位の cash、給与、簡易生活費、直近履歴 |
| 月次精算 | `settleFinance`。月を跨いだときに給与 − 生活費を 1 回だけ処理（複数月も可） |
| 交通費 | Spot の `travelOptions.cost`（片道）。往復分を出発時に引く。徒歩は無料 |
| Shop | `src/domain/shop/`。商品は Content（`shop-items`）。購入は残高チェックのみ |
| 車 | 中古コンパクトカー ¥450,000。購入で `world.availableTransports` に car が増える |
| UI | HOME（日時・予定・現金・有給・休む）、SHOP、MAP（交通費と時間の可否）、SPOT（帰る目安） |
| Save | schema v4（finance 詳細・schedule・purchases）と v3 → v4 migration |
| 検証 | `npm run simulate:day`（1 日 → 翌朝 → 月跨ぎ → 車購入 → 新 Spot 解禁） |

## 設計変更（重要・Phase 5 / Fishing-first）

**会社員という設定は世界観として維持するが、仕事はゲームシステムにしない。**

仕事は「毎月、生活費を差し引いた自由資金が入る背景設定」としてのみ扱う。
プレイヤーの釣行を勤務時間で制限しない。ゲームの主役は完全に釣りである。

採用しないもの:

- 勤務時間（平日 09:00〜18:00）と通勤による拘束
- 有給（Paid Leave）
- 仕事の予定による釣行の拒否
- Career XP / Performance / 昇進 / 転職 / Job Offer / Work Skill / Cross-Skill
- 仕事ミニゲーム、上司・同僚

維持するもの:

- WorldTime（日付・曜日・時分・日跨ぎ）と移動・釣り・帰宅の時間消費
- 月次精算（給与 − 生活費 = 自由資金）
- 交通費、Shop、中古車、車による Spot 解禁
- Economy / World の永続化

理由:

- 仕事をゲーム化すると、プレイヤーの最適化が釣りから仕事へ流れる。
  主役は常に釣りである（GAME_DESIGN.md §12 の方針をさらに徹底した）。
- 曜日は今後、混雑・大会・イベント・季節・釣り場ルールのために使う。
  カレンダーは「釣りの条件」を載せるための器として保持する。

実装・文書上の扱い:

- `src/domain/schedule/`（WorkSchedule / ScheduleState / timeAvailability）は撤去した。
- `src/domain/career/` の型（CareerState / JobDefinition）は使わない。
  Save にも含めない（v4 は progression / codex / world / knowledge / finance / purchases のみ）。
- `tests/architecture/economy-boundaries.test.ts` が「仕事の仕組みを作っていない」
  ことを機械的に確認する。
- `docs/` はこの方針に更新済みである。GAME_DESIGN.md §12（仕事とお金）/
  PROGRESSION.md §15（仕事とお金）/ DATA_MODEL.md §17（仕事・採用しない）/
  ROADMAP.md Phase 5 が「仕事はゲームシステムにしない」と明記している。

## Phase 4 で実装したもの

| 領域 | 内容 |
|---|---|
| 時間 | `src/domain/world/WorldTime.ts`。日付・曜日・時分、日/月/年跨ぎ、うるう年。`Date` を使わない純粋計算 |
| 世界 | `worldSession.ts`。HOME → TRAVELLING → AT_SPOT → RETURNING_HOME → HOME の状態機械 |
| Access | `src/domain/access/accessEngine.ts`。行けるか / 行けない理由 / 使える移動手段を返す |
| 移動 | Spot ごとの `travelOptions`（walk / train / bus）。運賃は扱わない |
| Knowledge | `spotKnowledge.ts` / `regionKnowledge.ts`。訪問・釣り・捕獲で増え、100 で頭打ち |
| 釣りの時間 | 1 回の釣りでゲーム内 20 分（PROVISIONAL）。釣れなくても時間は進む |
| Spot | 東京近郊を模した 8 件（すべて `dataStatus: provisional`）。`fishTable` で魚種が変わる |
| UI | HOME / MAP / SPOT 画面を追加。釣り終了後は SPOT に戻る（瞬間移動しない） |
| 検証 | `npm run simulate:trip`（移動 → 釣り ×N → 帰宅 を seed 固定で再現） |
| Save | schema v3（world を追加）と v2 → v3 migration |

## Phase 3.1 で実装したもの

| 領域 | 内容 |
|---|---|
| 配線 | `src/app/persistence/persistenceCoordinator.ts`。`SaveRepository → Coordinator → Store` の依存方向 |
| 起動時 | `main.tsx` が `loadRaw → migrateSave → hydrateFromSave` を実行（Save 無しは初期状態で ready） |
| Store | `hydrationStatus`（idle / hydrating / ready / error）と `hydrationFailure`、明示的な hydrate 経路 |
| Autosave | 保存対象 slice（progression / codex）の変化だけを購読して保存。既定は debounce 0（取りこぼしを避ける） |
| Guard | hydration が ready になるまで保存しない。Store の操作も ready 前は無効 |
| 壊れた Save | 読み込まずに error 状態へ。**上書きしない**。UI から「新規で始める」で復帰できる |
| UI | 起動直後の loading 表示と、読み込み失敗時の最小のエラー表示 |

## Phase 3 で実装したもの

| 領域 | 内容 |
|---|---|
| レベル | `src/domain/progression/AnglerLevel.ts`。Lv1〜100、複数レベル同時上昇、上限で XP を溜めない |
| XP | `xpCalculation.ts`。`Base × Size × Challenge + Discovery Bonuses`（減衰は倍率部分のみ） |
| サイズ倍率 | 上位 10% で ×1.5、上位 1% で ×3、上位 0.1% で ×8（Phase 2 の percentile を接続） |
| 反復減衰 | `repetitionDecay.ts`。species / spot / method を別々に数え、初捕獲・自己記録・Trophy・高百分位・新 Spot・新釣法では減衰しない |
| Skill | `AnglerSkill.ts`。7 Skill・0〜100・割り振りの検証・MVP の振り直し |
| Skill Point | レベルごとに 1、10 の倍数レベルで +1。同時上昇でも取りこぼさない |
| 修飾 | `playerFishingModifiers.ts`。Skill / Perk → `PlayerFishingModifiers`（9 種の倍率） |
| Perk | `perks.ts`。6 種の定義（Level + Skill 条件）と解禁。効果は倍率表で解決 |
| 捕獲解決 | `src/domain/catch/resolveCatch.ts`。記録 → 判定 → XP → 成長 を 1 箇所に固定 |
| Save | schema v2 と v1→v2 migration（総 XP をカーブから復元、Perk / 反復は空から開始） |
| Codex 永続化 | schema v2 に Codex（捕獲記録）を正式追加。v2 内で欠落を正規化し、破損は拒否する |
| UI | 成長画面（Lv / XP / Skill Point / 7 Skill / Perk / 現在の効果）、釣り画面に XP 結果とレベルアップ表示 |
| 検証 | `npm run simulate:progression`（反復・多様性・上限・決定論の 9 チェック） |

## 主要な設計判断（Phase 3）

1. **Engine は成長を知らない** — `FishingEngine` は `PlayerFishingModifiers` だけを受け取る。
   Skill 名も Perk 名も Level も知らない。`tests/architecture/progression-boundaries.test.ts` が
   Engine のソースに `anglerLevel|anglerXp|skillPoints|unlockedPerks|xpGained|codex` が
   現れないことを検査している（検出できること自体も合成ソースで確認）。
2. **レベルカーブは `80 + 12 × L^1.55`** — 序盤は数匹で上がり、後半は急に重くなる。
   累計で Lv100 まで約 59.6 万 XP。シミュレーション上の目安は約 1.5 万匹
   （PROVISIONAL。プレイテストで調整する）。
3. **上限では XP を溜めない** — Lv100 に達したらレベル内 XP は 0 に固定し、
   それ以上加算しない（`totalXp` は生涯累計として伸び続ける）。
4. **減衰は「倍率のかかる部分」だけ** — Discovery Bonus（初捕獲・自己記録・Trophy 等）は
   減衰させない。これにより「同じ魚を釣る楽しさ」と「新しい挑戦の価値」が両立する。
5. **Skill は操作の成功を置き換えない**（DECISIONS.md §3）— 動かすのは
   テンションの上がり方・REEL / GIVE の効率・アワセ猶予・アタリの見え方だけ。
   自動捕獲やプレイヤー操作の排除はしていない。
6. **Detection だけは UI 補助に接続した** — `detectionClarityMultiplier` が閾値
   （既定 1.2）以上だと、WAITING 中に「アタリまでの残り tick」を開示する。
   これは情報の補助であり、結果は変えない。
7. **Casting / Landing / Rigging は将来用の interface** — 倍率として解決・保存されるが、
   Phase 3 のファイトでは使っていない（Phase 6 以降のタックル・取り込み操作で使う）。
8. **振り直しで Perk を取り直せない** — Skill をリセットすると、条件を満たさなくなった
   Perk は未解禁に戻す。振り直しが無料の Perk 取得にならないようにするため。
9. **捕獲処理は 1 箇所** — `resolveCatch` が記録・判定・XP・成長を順番に実行する。
   UI もストアも First Catch や自己記録を判定しない。
10. **プレイヤー状態はストア、釣行は画面ローカル** — Codex と Progression は
    `src/state/playerStore.ts`（Zustand）が保持し、FishingEngine は釣り画面のフックが持つ。
    Engine は「今の釣行」の状態であり、プレイヤー恒久の状態ではないため。
11. **Save v2 と migration** — v1 は累計 XP を持っていなかったので、
    カーブから「そのレベルに達する累計 + レベル内 XP」を復元する。Perk と反復状態は空から。
12. **level-lock 検査の範囲を絞った** — `requiredLevel` は Perk の解禁条件として正当に使う。
    検査対象を「アクセス条件に関わるファイル」に限定し、
    「Level を場所の解禁キーにしない」という本来の意図を維持した。
13. **Codex を Save v2 に追加した（schemaVersion は 2 のまま）** — Phase 3 の
    First Catch / Personal Record 判定は Codex に依存するため、Codex を保存しないと
    再起動のたびにボーナスを取り直せてしまう（XP の抜け道）。
    版を上げるか v2 内で正規化するかを比較し、**v2 内の正規化**を選んだ:
    - この Save は未リリースで、実際に書き出された v2 Save は存在しない
      （アプリに保存/読み込みの配線がまだ無い）。v3 を切ると、
      存在しない版のための migration を 1 段増やすことになる。
    - 「キーが無い＝古い v2」は空の Codex へ正規化し、
      「キーはあるが中身が不正」は拒否する。欠落と破損を区別するので、
      壊れたデータを黙って捨てることはない。
    将来 Codex 以外の破壊的変更（設計文書の player / inventory / world 追加など）を
    入れるときに、まとめて v3 へ上げる。
14. **永続化は Application 層の Coordinator が行う** — Store も Domain も
    IndexedDB を知らない。Coordinator は `SaveRepository` と Store だけを受け取り、
    migration は既存の `migrateSave` をそのまま使う。
    これにより Domain に永続化処理を足さずに済んでいる。
15. **hydration 前は絶対に書かない** — 購読は最初から張るが、書き込みの入口で
    `hydrationStatus === 'ready'` を必ず確認する。初期状態で既存 Save を
    上書きする事故（＝進行度の消失）を防ぐ。テストで再現して確認している。
16. **hydration 直後に 1 回保存する** — 読み込んだ内容を書き戻すことで、
    v1 から移行した Save や、欠落を正規化した Save が確定する。
    書き込まれるのは必ず「読み込んだ状態」であり、初期状態ではない。
17. **壊れた Save は error 状態で停止し、上書きしない** — 復旧は UI の
    「新規で始める」から行う。このときも、プレイヤーが実際に釣るまで保存しない
    （＝壊れた Save を勝手に消さない）。
18. **Store の操作も ready 前は無効** — UI のガードだけに頼らず、
    `recordCatch` / `spendSkillPoint` / `resetSkills` は hydration 前には何もしない。
19. **新規プレイヤーの初期 Save は PROVISIONAL** — `createInitialSaveV2` が
    career / finance を中立値で埋める（開始時の職種・資金は Phase 5 で決める）。
    knowledge は空から始める。
20. **World は Fishing と別 Domain** — `worldSession` は時間・位置・Knowledge だけを扱い、
    FishingEngine の内部状態を触らない。釣りの結果は「1 回の釣りが終わった」という
    イベントとして World に渡す（`recordFishingAttempt`）。
    UI（fishing 画面）が両者をつなぐ。
21. **Access の入力に Level が存在しない** — `AccessEvaluationInput` には
    transports / knowledge / （将来の）reputation・permit・season しかない。
    Level を渡す場所がないので、Level ロックは構造的に起こらない
    （architecture contract test と accessEngine.test の両方で確認）。
22. **移動は即時解決だが、状態は 2 段** — TRAVELLING / RETURNING_HOME を実際に持つので、
    将来 UI に演出を足せる。ストアは 2 段を連続で呼んで即時に見せている。
23. **Knowledge はボウズでも増える** — 訪問 +15、釣り 1 回 +3、捕獲 +5（PROVISIONAL）。
    水域の Knowledge も別に増え、`scope: 'region'` のアクセス条件で使う。
    これにより「通うほど行ける場所が増える」が成立する。
24. **実在の場所を断定しない** — Spot に `dataStatus`（provisional / verified）を必須にし、
    Phase 4 のコンテンツはすべて `provisional`。UI にも「暫定データ」と表示する。
    魚種・規制・立入可否の根拠が無い情報は書かない。
25. **Spot 追加は Content のみ** — `fishing-spots/*.json` を足せば Map に並び、
    Access Engine が判定する。Engine の変更は不要（テストで確認）。
26. **Save v3 は v2 から World を足すだけ** — progression / codex / knowledge は
    そのまま引き継ぐ。v1 → v2 → v3 の順に適用する。
    テスト用の `SaveGameV2` 型と schema は移行検証のために残している。
27. **仕事はゲームシステムにしない** — 会社員設定は月次の定期収入としてだけ現れる。
    勤務時間・有給・キャリアは持たない。曜日は釣りの条件（混雑・大会・季節）を
    載せるために保持している。
28. **Access は「物理的に行けるか」だけ** — 時間の都合は判定に入れない。
    費用が足りるかは Economy 側で別に見る。
29. **時間は自動では進まないので「翌朝まで休む」がある** — `sleepUntilMorning` が
    翌日 06:00 まで進める。昼間でも休める（仕事の予定による制限は無い）。
30. **お金は選択を作るために使う** — 支出は残高チェックで拒否するが、
    給与と生活費は必ず適用する（軽微な赤字は許容、Game Over は無い）。
    徒歩の釣り場は常に無料で残しているので、資金 0 でも釣りは続けられる。
31. **月次精算は `lastSettledMonth` で 1 回だけ** — 何か月進んでも通過した月を
    すべて処理し、二重支給しない。
32. **車の購入は World の状態を増やすだけ** — Economy から AccessEngine の条件を
    書き換えない。`availableTransports` が増えるので、同じ Spot の判定結果が変わる。
33. **Save v4 は v3 から finance を拡張し、purchases を足す** —
    progression / codex / world / knowledge はそのまま引き継ぐ。
    v4 は `progression / codex / world / knowledge / finance / purchases` だけを持ち、
    `schedule`（勤務時間・有給）と `career`（仕事の状態）は**保存しない**。
    会社員設定は finance の定期収入だけに現れる。

## アーキテクチャ境界（Phase 0B から継続）

```
src/app   … 起動・配線（composition root）
src/ui    … 表示と入力のみ
src/state … Application / UI 状態（Zustand）
src/domain… ゲームルールと契約（最内層）
   ├ progression … XP / Level / Skill / Perk（Fishing の上位）
   ├ catch        … 記録と成長をまとめる唯一の入口
   ├ codex        … 捕獲記録
   ├ fishing      … 状態機械とファイト（PlayerFishingModifiers のみ受け取る）
   └ fish         … 魚種と個体生成
src/content… データとその検証スキーマ
src/infrastructure… 永続化などの実装
```

- `src/domain` は **外部パッケージを一切 import しない**。
- `src/domain` は React / DOM / Zustand / IndexedDB / ブラウザ API に依存しない。
  `tsconfig.domain.json`（`lib: ES2022`、`types: []`）で型レベルでも強制している。
  Domain のテストも DOM / Node のグローバルを使わない（`structuredClone` は使えない）。
- 乱数は `RandomSource` を注入して使う。`Math.random()` は Domain で禁止。
- `src/ui` は infrastructure と `node:*` を import しない。

### 意味論的なレビューについて

CI は「設計書に書かれていない機能を意味的に検出する」ことはしない。
機械的に安定しないためである（`docs/DECISIONS.md` §7）。
機械判定可能な制約のみを CI / lint / test が担当し、
**意味論的な Product Scope 逸脱の検出は human / code review の責務**とする。

## 検証方法

```bash
npm ci                       # 依存の再現
npm run check                # typecheck → lint → format:check → validate:content → test → build
npm run build                # 本番ビルド
npm run dev                  # http://localhost:5173
npm run dev:host             # 同一 LAN の実機（iPhone Safari など）から開く
npm run validate:content     # Content の検証（不正なら非ゼロ終了）
npm run simulate:fishing -- --seed demo
npm run sample:individuals -- --samples 10000
npm run simulate:progression -- --catches 2000
npm run simulate:tackle        # Starter / Finesse / Balanced / Power の比較
```

### モバイル実機での確認

- `npm run dev:host` で LAN に公開し、iPhone Safari から `http://<MacのIP>:5173` を開く。
- PWA としてインストールするには secure context が必要である。
  `http://<IP>` は secure context ではないため、Service Worker は登録されない。
  実機で PWA を確認する場合は HTTPS で配信する（トンネル等）。
- Service Worker は本番ビルドでのみ登録する。

### 直近の検証結果（Phase 3 完了時点）

- `npm run check`: PASS
- `npm run build`: PASS
- `npm run test:run`: 45 files / 377 tests PASS
- `npm run validate:content`: PASS（11 件）
- `npm run simulate:progression -- --catches 2000`:
  反復（同一魚種）で Lv21 / 多様な釣りで Lv26、初捕獲 200 XP 対 反復 100 匹目 22 XP。
  9 チェックすべて PASS（Lv100 到達・上限・溢れなし・決定論・複数レベル同時上昇・Perk 解禁）
- `npm run sample:individuals`: 全魚種 invalid=0（Phase 2 から回帰なし）
- `npm run simulate:fishing -- --seed demo`: LANDED（142 tick）。
  **Phase 2 と完全に同じ結果**で、修飾が中立なら Engine の挙動が変わっていないことを確認
- Codex 永続化の round trip: 保存 → JSON 経由で再読み込み → 実際に釣る、までを検証。
  再読み込み後に同じ魚を釣っても First Catch / Personal Record ボーナスが再発生しない
- Save / Load の配線: hydration 前の autosave 禁止、壊れた Save を上書きしないこと、
  再読み込み後の減衰維持まで含めて確認
- 開発サーバー実測: root / 成長画面 / playerStore / progression domain がすべて 200
- `npm run simulate:trip`（seed 固定）:
  `06:00 HOME → 徒歩20分 → 06:20 到着（知識15%）→ 釣り3回（各20分）→ 07:40 HOME`。
  3/3 匹、+500 XP、Lv4、知識 39%。6 チェックすべて PASS（移動・釣行・帰宅の時間、決定論）
- 開発サーバー実測（Phase 4）: root / main.tsx / HOME・MAP・SPOT・FISHING 画面 /
  world domain / accessEngine / Spot JSON がすべて 200
- `npm run simulate:day`（決定論的）:
  05/04 06:00 HOME → 徒歩で近場（釣り 2 回）→ 翌朝まで休む →
  05/05 電車で東京湾岸（交通費 ¥840）→ 約 3 か月で現金 ¥119,160 → ¥479,160 →
  中古車 ¥450,000 を購入 → **車が必要だった釣り場が行けるようになる**。
  9 チェックすべて PASS（平日でも釣行可・翌朝 06:00・自由資金・車の解禁）
- `npm run simulate:trip`: 6 チェックすべて PASS
- バンドル: JS 407.20 kB（gzip 122.21 kB）、CSS 5.36 kB（gzip 1.55 kB）
- 開発サーバー実測（Phase 5）: root / HOME / SHOP / MAP / SPOT /
  economy・schedule domain / shop item JSON がすべて 200

### Phase 4 で変わった既存の検証値

- `simulate:progression -- catches 2000` は 9 チェックすべて PASS（変化なし）
- `sample:individuals` は全魚種 invalid=0（変化なし）
- `validate:content` は 18 件（魚種 10 + 釣り場 8）
- `simulate:fishing -- --seed demo` の tick 数は 142 → **174 に変化**。
  これは内容（Spot）が変わって Encounter の乱数消費が変わったためで、
  Engine の挙動変更ではない

## 未完了・既知のギャップ

- Reputation / Boat / 全国 Map / 天候・潮は未実装（Phase 7 以降）。
- Casting / Landing / Rigging の効果は引き続き「将来用の interface」。
  数値は解決・保存されるが、ファイトでは使っていない。
  Casting はタックルの `castingPrecisionMultiplier` へ合成されるが、UI の演出はまだ無い。
- Perk の効果は倍率表の範囲に留まる（本格的な Perk ツリーは未実装）。
- 釣り場は 8 件ですべて `provisional`（検証データではない）。実データの投入はしていない。
- 天候・潮・時間帯による釣果変化はまだ無い（`timeActivity` は Content にあるが未使用）。
- Calendar は「日付・曜日の判定」まで。曜日は混雑・大会・イベントへまだ接続していない。
- ボートなどの所有は無い。Access は transport tag の有無だけを見る。
- **UI は画面配信までしか確認していない**。ブラウザ自動操作が無いため、
  HOME → MAP → SPOT → FISHING → SPOT → HOME → TACKLE → SHOP の
  クリック操作は未確認（新規ゲーム初期状態の描画だけスモークテストで確認）。
- 釣行の途中終了からの完全復元は Phase 4 の対象外（安全な checkpoint として
  「現在時刻・位置・Knowledge・釣行記録」までを保存する）。
- Phase 6 の残り:
  - 装備の互換性スコアは PROVISIONAL。人間のプレイテストによる調整は未実施。
  - FishSpecies の `methodAffinity` / `offeringAffinity`、Bait / Lure の
    `targetProfile` は検証用の暫定値（生物学的事実ではない）。
  - Gear は 23 件（Rod / Reel / Line / Leader / Hook / Lure / Bait）。
    Rod 200+ / Reel 150+ / Lure 500+ の拡張は Content 追加だけで可能な構造だが、
    実際にその量は投入していない。
  - Reel の `sizeClass` は 1000〜30000 を定義しているが、投入済みは 1000 / 2500 / 4000 のみ。
  - 装備の耐久・破損・ルアーロスト・売却・中古市場は無い（意図的に未実装）。
  - Bait は Phase 6 では無限使用（数量管理はしない）。
  - 装備による `castingPrecisionMultiplier` / `detectionClarityMultiplier` /
    `landingStabilityMultiplier` の一部は、まだファイトの数値へ直接は効かない。
- Phase 5 の残り:
  - 車の維持費（`simpleVehicleMonthlyCost`）は構造だけ用意し、まだ請求していない。
  - 車種スペック・ローン・保険・駐車場・車検・故障・ガソリン残量は扱わない。
  - 遠征費・宿泊・フェリーは未実装。
  - 天候・潮・時間帯による釣果変化はまだ無い。
- IndexedDB adapter の自動テストは Fake による API 形状の確認に留まる
  （実ブラウザでの永続化・バージョン管理・障害時の挙動は未検証）。
- 複数タブの同時編集、Save の export / import、スロット選択、復旧 UI は未実装。
- XP カーブ・減衰・Skill 効果・GearTuning はすべて `PROVISIONAL`。人間のプレイテストは未実施。
- 魚種 10 種・釣り場 8 件・Gear 23 件・ブランド 10 件はいずれも検証用サンプル（現実データではない）。
- UI のテストはスモーク（初期状態の描画）のみ。クリック操作の自動テストは無い
  （意図的に Domain を優先）。
- 実行時 Content 検証のため Zod をブラウザに含む（gzip +約 30 kB、Phase 1 からの継続課題）。
- IndexedDB 実装は依然ブラウザでの自動テストが無い（Phase 0B からの持ち越し）。

## 次の推奨タスク

**Phase 7 — Full Transport / Access Progression**（`docs/ROADMAP.md`）

Phase 6 までで「装備 → 釣果 / ファイト」は繋がった。次は交通と到達範囲を広げる。

1. 移動手段（bicycle / motorcycle / boat）を Content と所有者状態で増やす。
2. Access を「transport tag の有無」から、時間・費用・積載を伴う判定へ広げる。
3. Spot を増やし、移動手段の差で「行ける場所」が変わることを見せる。
4. 遠征費・宿泊・フェリーの構造を Economy と接続する。

Phase 6 から持ち越した調整（プレイテスト前提）:

- GearTuning / 互換性スコア / affinity の暫定値を実プレイで調整する。
- 未接続の modifier（casting / detection / landing）を演出へ接続する。

## ブロッカー

- なし（Phase 6 の作業自体は完了）。
- 補足: 実行環境によっては Git メタデータ（`.git`）への書き込みが制限され、
  `git add` / `git commit` が失敗することがある。
  その場合はユーザー側でコミットを実行し、本文書を更新する。
