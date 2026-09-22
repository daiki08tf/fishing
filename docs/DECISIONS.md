# Decisions

この文書はFishingのProduct DecisionのSingle Source of Truthである。

他設計文書（GAME_DESIGN / PROGRESSION / DATA_MODEL / ARCHITECTURE / ROADMAP）と
記述が食い違った場合は、この文書を基準に判断し、どちらかを更新する。

## 1. World / Content

決定:

- 現代日本の現実世界をベースにする
- 実在する魚種・生態・地理・交通を利用する
- 初期の釣具ブランドは架空とする
- 後から実在ブランドをContentとして追加できる構造にする
- 実在ブランドの有無によってDomain Engineを書き換えない

実装への含意:

- 「実在か架空か」はContentの属性であり、Domainの分岐条件にしない
- ブランド追加は、コード変更ではなくContent追加として扱える形にする
- 出典（source）はContent側に保持する

## 2. Skill Points

決定:

- MVPでは振り直し可能とする
- 永久選択や高額なRespecはまだ導入しない
- 正式ルールはプレイテスト後に決定する

実装への含意:

- Skill Pointの割り振りは、後から変更できる前提で保存・計算する
- Respecを禁止する設計（戻せない前提のデータ構造）にしない

## 3. Skill Effects

Skillが緩やかに改善してよい対象:

- casting accuracy
- timing window
- line / tension tolerance
- detection clarity
- rigging efficiency

禁止:

- Skill値だけによる自動捕獲
- プレイヤー操作の完全排除
- 非現実的な単純パーセント補正

実装への含意:

- Skillは操作の成功そのものを置き換えず、操作しやすさ（窓・許容・見やすさ）を動かす
- Domainの判定に「Skillが高いので成功」という短絡経路を追加しない

## 4. Distribution

決定:

- 初期ターゲットはWeb / PWA / mobile-firstとする
- Native app packagingは将来検討する

実装への含意:

- モバイル操作を第一級として扱う
- 初期はPWAで成立する範囲を制約とする

## 5. Transport

決定:

- Transportは主要な成長軸として扱う
- 早期Prototypeでも次の体験を検証する

```
徒歩 / 電車等
  ↓
行けるSpotが限られる
  ↓
車を入手
  ↓
アクセス可能な釣り場が明確に増える
```

実装への含意:

- アクセス判定はTransportを入力に持つ（accessEngine）
- 「Levelが上がったので解禁」ではなく、
  「移動手段・装備・Knowledge・Skillが広がったので行ける」形にする
- Spot は具体的な車種 ID ではなく物理的な access capability を要求する
- Transport の具体的な商品名・車種名・船名は Content に置き、AccessEngine の分岐へ書かない
- Transport ownership は WorldState と分離し、Save の独立ブロックとして保持する
- SUV は道路系の強み、Kayak は限定的な水上アクセス、Boat は offshore と役割を分ける。
  高価な 1 台ですべてを突破できる設計にしない
- 交通費・レンタル料は既存 Economy の円を使い、独立通貨を作らない
- Transport はアクセス・時間・費用・抽象的な積載までとし、燃料残量・故障・車検・
  保険・駐車違反・渋滞・実道路 routing はシミュレーションしない
- 入手できる Transport（初期利用可能 / Shop で購入可能）は、Content 上どの route でも
  使えない状態を許さない（`validate:content` が検出する）。入手手段が無い future-only は
  将来の route 追加を妨げないよう検査対象外にする
- 行けない理由は capability 条件の列挙ではなく、Transport 候補が落ちた段階
  （capability 不足 / 行ける route が無い / 所有が必要 / レンタル不可 / 設備不足）で説明する。
  持っている capability を「不足」と表示しない
- 移動手段はプレイヤーが選ぶ。既定は最も安い候補とし、速いだけの高額な候補を
  黙って選ばない（費用の内訳も出す）
- 世界は Country → Region → Area → Spot の Content 階層で表す。巨大な WorldManager を
  作らない。地域を「今いる場所（world.currentRegionId）」として持ち、違う地域の Spot へは
  遠征で移動してから行く
- 国内（北海道）と海外（アラスカ）は同じ Expedition の仕組みで扱う。海外専用システムを
  作らない。違いは Content（航空券の費用・時間、宿泊、許可）だけに置く
- 遠征の費用は「航空券（往復）＋宿泊＋許可」をまとめて予約する。空港・パスポート・ビザ・
  手荷物・座席・為替・実際の予約・現地法規の詳細はシミュレーションしない
- 現地の移動は Phase 7A の Transport / Access をそのまま使う。国・地域による分岐は
  Content に置き、Engine（AccessEngine / FishingEngine）には書かない
- 地域の解放条件に Angler Level を使わない。行けるかどうかは資金・許可・移動手段・
  Knowledge で決まる（Lv1 でも金と許可があればアラスカへ行ける）
- Permit は遠征予約に含める簡易な所持リストとし、`permit` 条件を持つ Spot にだけ効く
- 追加した魚（アラスカ / 北海道）は PROVISIONAL とし、既存の FishIndividual /
  Trait / FightEngine をそのまま使う（新しい魚生成システムを作らない）
- Environment（季節 / 時間帯 / 天候 / 潮 / 水）は WorldTime と地域の気候プロファイル
  （Content）から決定論的に解決する。天気・潮汐の外部 API は使わず、Math.random も
  Domain に入れない。商用の気象・潮汐シミュレーションは作らない
- Environment を FishingEngine へ直接渡さない。Conditions Resolver が
  resolved numerical modifiers へ写し、Engine は数値だけを受け取る
- 地域ごとの違いは Content（climate / 魚種の environmentAffinity）に置き、
  国・地域・魚種による分岐を Engine に書かない。天候の乱数も「同じ日付・地域なら同じ」にする
- 条件が悪くても魚種の Encounter 重みを 0 にしない（下限 0.35）。「絶対に釣れない」を作らず、
  good / neutral / poor の差だけを感じさせる
- 大型魚は「Hard gate」ではなく確率で難しくする。軽いタックルでも獲れるが、
  ラインブレイク / フックアウトが増える（理想は Light でも理論上は獲れること）
- 大型個体の強さは個体サイズから解決し、魚種固有の分岐を Engine に足さない
- Fish Finder は Gear カテゴリ `electronics`（1 種）として既存 Inventory に載せる。
  Electronics アーキテクチャを巨大化しない（Search Water は反応と手がかりだけ）
- Environment は再生成できるため Save を増やさない（v7 のまま）。Search Water の結果は
  釣行中の一時情報として保存しない
- **Catchability is soft by default / Physical impossibility is the only normal hard gate**（Phase 9.1）。
  タックルクラス（Rod / Reel / Line / Leader）で魚種の eligibility を決めない
- 釣法・offering の相性は soft multiplier（目安: excellent 1.8 / good 1.3 / neutral 1.0 /
  poor 0.5 / very poor 0.15）。相性だけを理由に確率を 0 にしない
- ルアー / フックが魚に対して物理的に大きすぎる場合だけ Bite = 0 を許す。
  小さすぎる場合は可能のまま（確率・保持・掛かりが悪くなる）
- 物理サイズは実データ（ルアーの長さ・フックの rank・魚の体長と捕食プロファイル）で判断し、
  具体 ID で分岐しない。サイズデータが無い offering（餌など）は neutral として扱う
- ファイトの難しさは Bite 確率とは別に扱う（食いついた後の世界で表現する）
- 「魚がいるのに食わない」を fishTable から消すことで表現しない

### Phase 10 — Text Fishing Battle（HOOKED 以降）

- **Fishing combat is decision-driven, not button-spam driven.**
  1 コマンド = 1 battle step。同じボタンを速く連打しても有利にならない
  （FIGHTING / LANDING は tick では進まず、プレイヤーのコマンドだけで進む）
- 魚の行動は 8 種の generic な behaviour（normal / run / surge / head_shake / dive /
  come_toward / rest / second_run）。魚種名や国では分岐せず、
  既存の fightProfile・Trait・個体サイズから解決した数値だけで重みが決まる
- 行動は文章で予兆（telegraph）を出してから発動する。
  「読んで次の一手を選ぶ」ことがゲームの中心であり、反射神経は要求しない
- コマンドは固定ダメージボタンではない。同じ REEL でも、魚の行動・テンション・
  タックルで結果が変わる（RUN 中の POWER_REEL は危険、COME_TOWARD 中の REEL は有効）
- 高テンション（LINE_BREAK）と slack（HOOK_ESCAPE）の両方を危険にする。
  「常に GIVE / 常に REEL / 常に POWER_REEL」が最適解にならない
- タックルは「失敗の余地（margin）」を変える。Light でも大型魚は理論上獲れるが、
  effective tension limit が低く、break / hook escape が増える。
  Heavy は安定するが、掛かり（Bite / Hook）では万能ではない
- 小さい魚のファイトは短い（1〜3 コマンド）。大型・記録級は長い（15〜30+）。
  戦闘の長さは個体とタックルとプレイヤーの判断で変わる
- Domain は BattleEvent / behaviour / numeric result を返し、文章は UI の表現である。
  Domain の判定を文章文字列で行わない
- Knowledge は予兆の文章の精度にだけ効く（結果は変えない）。
  Knowledge が低くてもゲームは成立する

### Phase 10.1 — Playtest Cleanup（runtime Content と fixture の分離）

- **プレイヤーが見る Content（`src/content/data`）に検証用の合成魚を置かない。**
  合成魚（サンプル魚 A〜J）は `tests/fixtures/content/fish-species/` に置き、
  test / simulation だけが `loadFixtureContent()` で追加読み込みする。
  runtime の Spot は常に `src/content/data` だけを参照する
- 通常プレイの画面に内部情報（seed / tick / 内部 state 名 / phase code）を出さない。
  開発用の導線は `import.meta.env.DEV` のときだけ表示する
- 古い Save に「今の Content に無い魚種 id」が残っていてもアプリは落ちない。
  表示（記録種数）は今の Content にある魚種だけを数え、**Save 自体は書き換えない**
- プレイテストのやり直しは、開発ビルドの HOME にある「セーブデータを初期化」で行う。
  起動時に勝手に Save を消す処理は入れない
- 釣行中の FishingEngine は、釣果記録の副作用（世界時間 → Environment → Conditions、
  成長 → 倍率）では作り直さない。セッション開始時の入力で固定する
  （作り直すと、取り込んだ瞬間に画面が最初の状態へ戻ってしまう）

## 6. Phase 0 で定義する機械判定可能な制約

Phase 0では、CI / lint / testで機械的に判定できる制約だけを定義する。

- Levelをlocation hard lockに使わない
- Domain layerはReact / UIに依存しない
- RNGは注入可能かつseed可能にする
- Contentはtyped schemaでvalidateする
- SaveはschemaVersionを必須とする
- Domain testsはdeterministicにする
- Fish generationは物理的制約を守る
- 禁止layer dependencyをlint / testで検知する

## 7. Scope Discipline

採用しない考え方:

> 設計書に存在しないコードをCIが意味的に検出する

理由:

- 「設計書に書かれていない」ことの意味判定は機械的に安定しない
- 誤検知・見逃しのコストが高く、CIが信頼されなくなる

代わりに:

- CI / lint / testは、6の機械判定可能な制約のみを担当する
- 意味論的なProduct Scope逸脱の検出はhuman / code reviewの責務とする

## 8. 変更規律

- この文書の変更は、意志決定として記録する
- 設計文書の変更は、そのPhaseの範囲に限定する
- 実装で得た知見は設計へ戻す（設計を先に固定しすぎない）


## Phase 11 — Casting Distance & Fishing Zones

決定:

- **遠投は上位互換ではない。** 距離は Spot 内で狙える水域を変えるために使う
- Spot は optional な `FishingZone` を持てる。Zone は距離・水深・habitat を Content として表す
- 既存 Spot に Zone が無い場合は runtime が 1 つの fallback Zone を作り、従来の釣りを壊さない
- FishOccurrence は `zoneAffinity` を持てる。Zone は Encounter presence を変えるが、
  遠投そのものへ直接 Bite bonus を付けない
- Cast capability は実スペックを元に `comfortableDistanceM / maxDistanceM / precision` へ解決する
- 主な入力は Rod length / castingProfile / lure weight range、offering weight、
  Line diameter、Reel line capacity / control、method、Casting Skill、wind
- 重いルアーほど無条件に飛ぶ設計にはしない。ロッドの適正重量域との fit を見る
- リール番手や具体 Gear ID を性能分岐に使わない。line capacity は実数値を使う
- 最大距離ぎりぎりでは着水誤差が増え、別 Zone へ落ちることがある
- Level で Zone や魚種を解禁しない。届くかどうかは物理的なキャスト能力で決まる
- Casting Domain は決定論的で、乱数は `RandomSource` を注入する
- FishingEngine は Zone / Gear / 天候を知らない。実着水距離など resolved numerical value だけを受け取る
- 実着水距離は Text Battle の初期距離へ圧縮して反映し、小魚の遠投を単調な長期戦にしない
- Zone / cast selection は釣行中の一時状態なので Save schema は v7 のまま
- Phase 11 の Zone 数値は PROVISIONAL。実在釣り場の地形・魚分布を verified として断定しない

初期の Zone Content は荒川下流、多摩川下流、河口部、林道奥の貯水池ワンド、
北海道の海岸、Alaska Coastal Bay に入れる。Phase 12 の魚種 / Spot 拡張はこの Zone 構造を使う。


## Phase 12 — Regional World Expansion / Alpha Content

決定:

- FishSpecies は**世界で 1 魚種 1 ID**とする。地域名を species identity に含めない
- 同じ魚種が複数地域にいる場合、Species 定義を複製せず `FishOccurrence` で地域差を表す
- 旧 regional ID は Save v8 migration で canonical ID へ写す
- migration 対象は Codex だけでなく fish Knowledge と repetition も含む
- regional duplicate が同じ canonical ID に合流する場合:
  - catchCount / repetition は加算
  - Knowledge は最大値
  - largest / heaviest / percentile は良い方
  - Traits は union
  - personalBest は percentile が高い個体
- Alpha Content の目安を 80 前後の Species / 40〜50 Spot とし、Phase 12 は
  **82 Species / 45 Spot / 5 playable Region** で着地する
- playable Spot は原則 explicit Fishing Zone を持つ。fallback Zone は後方互換用に残す
- British Columbia / Queensland も北海道 / Alaska と同じ Expedition / Access / Economy を使う
- 国・地域別の分岐を FishingEngine / AccessEngine に追加しない
- Phase 12 の新規 Species / Spot / Zone / distribution / access / expedition 数値は
  **PROVISIONAL**。現実の生態・規制・釣行可否として verified と断定しない
- Content 規模が増えたため `simulate:regional-content` を CI gate にする
- 82 Species 程度では既存 eager Content loading を維持する。1000 Species 規模へ進む前に
  bundle 計測を見て Region pack / lazy loading を別 Phase で判断する

## Phase 13 — Fish Trade, Contacts & Hidden Spots

決定:

- Core Loop は「Catch → Keep/Release → Fish Box → 売却先を選ぶ → Cash + Trust →
  Rumor/Intel/Contact → Hidden Spot Discovery → 既存 Access 判定 → 新しい釣り」とする。
  単なる「魚を売る→お金が増える」だけの機能にしない
- LANDED 時点の Codex / XP 記録（`resolveCatch`）は Keep / Release の判断と独立させる。
  Release しても既存の「釣った記録」は失わない
- FishSpecies の性能値（rarity 等）と経済データ（取引価格）を分離する。
  `SpeciesTradeProfile` を別 Content とし、「希少 = 市場価値が高い」を前提にしない
- 全 runtime Species は `tradable` / `unpriced` / `non_tradable` / `unverified` の
  いずれかを明示する。この完全性検査は `validateContentReferences`
  （fixture 検証用魚種と混在する）には置かず、
  `validate:content` CLI（runtime ディレクトリだけを見る）と
  `simulate:trade-network` の両方で行う
  （Phase 10.1 の「runtime Content と fixture の分離」方針をそのまま踏襲する）
- 売値は deterministic に計算する（RNG を使わない）。
  `base species trade value × weight × condition factor × size quality factor ×
  freshness × buyer affinity`
- 実際の市場価格を再現したとは主張しない。すべて **Phase 13 gameplay PROVISIONAL**
  チューニング値である。魚の販売可否・価格・漁業法・遊漁規制について、
  調査していないものを現実の法的事実として断定しない
- Buyer（居酒屋 / 卸 / 市場の 3 type）は Contact の一種として同じ ID 空間
  （ContactId）を使う。data-driven な BuyerDefinition（pricingProfile /
  trustProfile）で差を表現し、具体的な店名・魚種 ID で Domain を分岐しない
- Buyer ごとの評価の差は、(1) 個々の魚の condition / percentile / freshness への
  感度（qualitySensitivity / sizeSensitivity / freshnessSensitivity）、
  (2) volume bonus、(3) **魚種の tradeTags × Buyer の preferredTags /
  neutralTags**、(4) 産地一致（`buyer.regionId === catch.sourceRegionId`）で表現する。
  魚種 ID を直接分岐する対応表は作らない（`if (speciesId === 'maaji')` を禁止する）。
  生物データと経済データは分離したままにする（Phase 13.1 で明文化）
- Trust は 0〜100。取引単位で上限（`maxPerTransaction`）を持たせ、
  1 回の大物取引で即 100 に到達しない設計にする。一方で 100 到達まで
  何も起きない設計も禁止し、複数の threshold（reward）を刻む
- ContactReward（intel / discover_spot / introduce_contact）は `minTrust` 到達で
  1 度だけ claim する。`claimedRewardIds` を Save に永続化し、それだけを
  判定材料にする（Save/load をまたいでも重複付与されない）
- 「秘密の釣り場」は実在の秘密座標や立入禁止場所を収集する機能ではない。
  ゲーム用の fictional / generalized Spot として扱う
- Hidden Spot の **Discovery（存在を知っているか）** と **Access（実際に
  行けるか）** を完全に分離する。Discovery の authority は既存の
  `world.discoveredSpotIds` をそのまま再利用し、新しい二重 state
  （`hiddenSpotState` 等）を作らない
- Contact から場所を教わった瞬間は `discoveredSpotIds` に追加するだけで、
  実訪問の初回 Knowledge ボーナス（`arriveAtSpot`）は与えない（teleport 的な
  「教わった瞬間から一切のハードルなく行ける」体験にしない。Access は
  AccessEngine が通常どおり判定する）
- 一部の情報は Rumor（intel、正確な場所はまだ出さない）→ Exact Spot
  （discover_spot）の 2 段階にする。ただし巨大な Quest System は作らない
- 既存 45 Spot を全て hidden にはしない。新規 Content として Hidden Spot を
  追加し、公共 Spot / 最初から知っている近場 Spot / Knowledge で発見する Spot /
  Contact から教わる Hidden Spot が混在するようにする
- Encounter を「目的魚だけが効率よく出る」方向へ単純化しない。外道にも
  Trade を通じて価値を持たせる（Buyer によっては売れる、Trust に使える）
- 売却金は既存 Finance Domain（`earnCash` / `TransactionKind: 'trade'`）へ統合する。
  Finance state を二重化しない
- Save schema **v9**。`trade: TradeState`（fishBox / contactTrust /
  claimedRewardIds / knownRumorIds）を追加する。v8 までの全ブロックは変更しない
- 通常の近場釣行は「数百円〜数千円台」、かなり良い釣行で「1万円前後〜数万円」を
  目安に開始し、`simulate:trade-network` の balance simulation
  （複数 seed・100+ 試行）で確認する。既存の給与 ¥300,000 / 生活費 ¥180,000 /
  自由資金 約¥120,000 の思想を破壊しない
- Phase 14 の Visual Redesign はこの Phase の対象外。UI は構造と機能のみ作る

## Phase 13.1 — 独立レビューを受けた Phase 13 の補強

Phase 13 の独立レビューで見つかった不備を、同じ branch / 同じ PR 上で修正した。
新しい Phase ではなく、Core Loop を実プレイで安全に成立させるための補強である。

決定:

- **Trade state は Save の一部である。** persistence coordinator の保存 payload に
  `state.trade` を含め、変更検知（subscriber identity 判定）にも `state.trade` を
  含める。Fish Box / Trust / claimedRewardIds / knownRumorIds が reload で消えたり、
  売った魚が復活（= 二重売却）したりする状態を許さない。
  実際の coordinator / repository を通る統合テストで確認する
- **Fish Box から消えた魚は `trade.fishBox` にも反映する。** `sellCatches` の戻り値
  `fishBox` と `trade.fishBox` が食い違うと、Store が保存する `trade` 側に
  売却済みの魚が残る（レビューで実際に検出した）。Domain の戻り値は内部で整合させる
- **魚は「今いる地域の買取先」にしか売れない。** `world.currentRegionId ===
  buyer.regionId` でなければ `buyer_region_mismatch`。UI の出し分けだけを防壁にせず、
  Domain（`sellCatches`）と Store（`sellToBuyer`）の両方で拒否する。
  Trade 画面は現在地域の Buyer だけを出し、いない場合は自然な空状態を表示する
- **未発見の Hidden Spot へは、Access 条件を満たしていても移動できない。**
  Discovery（知っているか）と Access（行けるか）の分離は維持しつつ、
  `leaveForSpot`（World Domain の最終境界）で `visibility === 'hidden' &&
  !discoveredSpotIds.includes(id)` を拒否する。AccessEngine は Transport / Permit /
  Knowledge の専門のままでよい。Store も交通費を引く前にここで止める
- **売却見積りは Domain の単一関数（`quoteSale`）に一本化する。**
  Trade 画面のプレビューと実際の売却が同じ関数を通る。`sum(lines.valueYen) ===
  totalValueYen` を不変条件とし、volume bonus は「tradable と確定した配列」に対して
  だけ計算する。取引不可の魚の位置や魚の並び順で合計額が変わってはいけない
- **Trust は「計算上の増加量」ではなく「実際に state へ入った差分」を返す。**
  `actualTrustGain = nextTrust - currentTrust`。Trust 100 では `+0` と表示する
- **Discovery の表示は「訪問済み」ではなく「発見済み」。** Contact から場所を
  教わっただけの Spot を訪問済みと呼ばない。HOME の Spot 件数は Map と同じ
  visibility / discovery 規則で集計し、未発見 Hidden Spot の総数を漏らさない
- **`introduce_contact` は Content で禁止する（reserved / not yet supported）。**
  Domain / schema には kind として残すが、実装されていない unlock 挙動を
  claim だけして何も起きない silent no-op にしないため、`validate:content` が
  Content 追加を拒否する。実装したらこの検査を外す
- **`simulate:trade-network` のバランス確認は「1 trial = 1 匹の売却」ではなく
  「1 trial = 1 釣行」にする。** 移動 → 釣り ×N（既存 FishingEngine）→ Keep →
  帰宅 → 地域内の買取先へ売却、を 100 釣行以上回し、attempt / landed / kept /
  gross / travel cost / net / median / p90 / max / 月換算を出す。
  現実の収入推定ではなく gameplay balance simulation である

## Phase 14 — Retro Management-Sim UI / Visual Identity Redesign

Phase 13 / 13.1 の Core Loop（Domain / State）は一切変更しない。
このフェーズは UI 層だけの再スキンである。

決定:

- **ゲームルールは 1 つも変えない。** FishingEngine / Text Battle / Casting Zone /
  Catchability / Save v9 / Fish Box / Trade / Trust / Contacts / Hidden Spot /
  Discovery・Access の分離 / Transport / Expedition / Economy / Codex / Knowledge
  / Regional Content は Phase 13.1 の実装のまま。Domain 層のコードは 1 行も
  変更していない（変更したのは `src/ui/` と `src/app/main.tsx` の import だけ）
- **狙う比率は「モダンなモバイル操作性 70% / レトロゲーム感 30%」。** 全画面を
  8bit 風のドット絵にはしない。本文テキストは読みやすい日本語システムフォントの
  まま、数値表示・見出し・HIT / NEW RECORD / トロフィーなど「ゲームらしい瞬間」
  だけに `--font-pixel` を使う（`src/ui/styles/tokens.css` の
  `.pixel-text` / `.pixel-heading` / `.pixel-number`）
- **デザイントークンを 1 か所に集約する。** `src/ui/styles/tokens.css` を新設し、
  色・spacing・radius・border・shadow・typography・z-index・motion duration を
  CSS custom property として定義する。既存 4 つの CSS ファイルはすべて同じ
  `--color-*` 変数名を参照していたため、`global.css` の旧 `:root` 色定義を
  `tokens.css` に一本化するだけで、Phase 14 でまだ触れていない画面
  （Shop / Tackle / Expedition / Progression）にも新しい配色が自動的に伝播する。
  画面ごとに再配色を手作業でやり直す必要がない
- **魚のアートは画像アセットを増やさずに作る。** 著作権のあるゲーム素材・
  スクレイピング画像・外部ホットリンクは一切使わない。手書きの inline SVG
  シルエット 1 種類を、魚種 ID から決定論的にハッシュした色チップで塗り分ける
  だけにする（`FishSilhouette` / `fishChipColor`）。図鑑が 82 種から将来 1000 種
  に増えても、画像アセットも DOM の複雑さも増えない
- **Biome の見た目は Region ID の巨大 switch にしない。** `BiomeScene` は
  既存の content-driven な `Spot.environment` 文字列（canal / river / estuary /
  bay_shore / lake / managed_pond の 6 種類、すでに Phase 9 の Environment
  Domain が使っている語彙）だけをキーにする。未知の environment には安全な
  デフォルトへフォールバックする
- **ナビゲーションはスマホ下部固定の 5 項目に統一する。** ホーム / マップ /
  魚かご / 図鑑 / メニュー。Trade は Fish Box 配下、Contacts は Menu 配下に
  格納する（画面遷移そのものは既存のまま。BottomNav は `setActiveScreen` を
  呼ぶだけの薄い層）。釣行中（fishing 画面）は Bottom Nav を隠す
  （画面が狭いモバイルでファイト中の操作面積を優先する）
- **MAP を最優先で作り直す。** 長い 1 行リストではなく、Region タブ + ノード風
  Spot Card にする。Public Spot と発見済み Hidden Spot は見た目のアイコンを
  変える（drop / star）。移動手段の詳細は `<details>` へ折りたたむが、
  「行く」ボタン自体は常に見える一等地に置く
- **`<details>` / `<summary>` で「折りたたみ」と「exact-text スモークテスト」を
  両立させる。** `renderToStaticMarkup`（サーバー描画）は `open` 属性の有無に
  関わらず `<details>` の中身を静的 HTML に含める。これを利用し、
  Map の移動手段・Spot の水域/タックル/食いつき/分かっていること・Fish Box の
  詳細を視覚的には畳みつつ、既存の exact-text テスト（`mapScreenSmoke.test.ts`
  等）を 1 文字も変えずに通す
- **LANDED の結果は独立した ResultBanner にする。** 魚名・サイズ・状態・珍しさ・
  NEW SPECIES / NEW RECORD / TROPHY バッジを 1 枚のカードにまとめ、
  ファイト中から続く「魚」パネルの数値表と重複させない（LANDED のときだけ
  重複ブロックを非表示にする）。判定（`firstCatch` / `personalBest` /
  `traits.includes('trophy')`）は既存 Store（`lastCatch` / `codex`）が
  Phase 13 で既に出している値をそのまま使い、新しい判定ロジックは作らない
- **HIT 演出は 100〜300ms を目安にする。** `--motion-fast`（120ms）/
  `--motion-normal`（200ms）/ `--motion-special`（350ms）の 3 段階を用意し、
  BITE の瞬間の画面演出は `--motion-normal`（200ms）を使う。NEW RECORD /
  Trophy / LANDED の背景遷移のようなより大きな演出だけ `--motion-special` を使う。
  `prefers-reduced-motion: reduce` では全アニメーションを実質即時にする
  （`tokens.css` の `*{animation-duration:0.001ms!important;…}`）
- **釣り画面の水面ビジュアルは phase / behaviour からだけ決める。** `WaterScene`
  の `sceneKeyOf` は Domain のイベント名やコマンド名では分岐せず、既存の
  `FishingPhase` と `BattleBehaviour`（Phase 10 で既に定義済みの 8 種の generic
  behaviour）だけから見た目の状態キーを合成する。新しい Domain の状態は増やさない
- **Buyer / Contact の「短い好み文」は既存 `description` フィールドをそのまま
  使う。** Buyer カードの説明文を作るために魚種タグ→日本語ラベルの新しい変換表を
  作らない。すでに Content（`buyers/*.json`）にある自然文の `description` を
  そのまま表示するだけにし、「具体的な Buyer ID / Species ID で UI を分岐しない」
  という Phase 13.1 の方針をそのまま UI にも適用する
- **Trade の査定比較は既存 `quoteSale` を今いる地域の Buyer 分だけ呼ぶ。**
  比較のための新しい Domain 関数は作らず、Phase 13.1 で導入した
  「プレビューと実売却で同じ関数を通す」という不変条件をそのまま比較表示にも使う。
  他地域の Buyer は比較にも出さない（持ち込めない Buyer を見せて期待させない）
- **Codex は 82 種・将来 1000 種を見越して 1 種 1 小さなタイルにする。**
  仮想化（windowing）は Phase 15 の対象とし、Phase 14 では作らない。
  未捕獲種は種名を「？？？」にし、捕獲済みの既存 `CodexState`（catchCount /
  largestLengthCm）だけを出す。新しい Knowledge / Codex ルールは作らない
- **未解禁の Contact 報酬は「？？？」に留める。** `next reward` の内容は開示せず、
  解禁に必要な Trust 閾値だけを見せる（Phase 13 の仕様を維持）。
  `introduce_contact` は Phase 13.1 同様、Content からは禁止されたままにする
  （実装されていない機能を UI で仄めかさない）
- **Phase 14 では新しい釣りルール・経済ルール・地域・魚種・ボート深度機構は
  追加しない。** Region Pack / 遅延ロードのアーキテクチャ変更、料理・水槽・
  マルチプレイ、実地図 API、大量スプライト制作、著作権のあるビジュアル資産の
  流用も対象外とする（Phase 15 以降の候補）

## Phase 14.1 — iPhone UI polish（結果導線 / 画面遷移 / 地図 / 文章）

Phase 14 の iPhone 実機相当レビューで見つかった UI の問題を、同じ branch / 同じ PR で直した。
新しいゲーム機能・Domain ルールは追加していない（Save schema も変更なし）。

決定:

- **LANDED の Catch Result は DOM 順として最上位に置く。** 結果カードを CSS の
  `position` で持ち上げるのではなく、`ResultView`（魚・サイズ・NEW バッジ・
  Keep / Release）を header の直後に描画する。390x844 の初期 viewport に
  「魚・長さ・重さ・NEW・持ち帰る・リリース」が入ることを目標にする。
  ResultBanner の内部も「魚 → サイズ → バッジ」の順に読み替えた（
  サイズの方が先に知りたい情報であるため）
- **釣りが終わった phase ではファイト UI を出さない。** `isTerminalPhase` を
  そのまま使い、LANDED / HOOK_MISSED / HOOK_ESCAPE / LINE_BREAK では
  Fish stamina / Tension / Hook hold / Distance / Drag / 行動ログ / ファイト
  コマンド / AUTO / 狙う場所を描画しない。「操作できない戦闘 UI が結果を
  押し下げる」状態をなくす（Domain の状態は変えず、UI の条件分岐だけ）
- **画面遷移の scroll reset は 1 箇所に集約する。** `src/ui/nav/scrollReset.ts` が
  `appStore` を購読し、top-level screen が変わったときだけ `window.scrollTo(0, 0)`
  する（AppShell から 1 回だけ install）。各画面では呼ばない。釣り中の phase 遷移は
  screen が変わらないので reset しない
- **MAP は「地図ボード → 詳細」の 2 段にする。** 実座標は使わず、Content の
  `environment`（river / lake / managed_pond / canal / estuary / bay_shore /
  nearshore / offshore）から「上流・湖 / 川・運河・河口 / 海・磯 / 沖」の帯へ
  決定的に割り当てる。Spot ID や Content の並び順では分岐せず、帯の中は名前順に
  並べる（同じ集合なら同じ配置）。ノードは flex-wrap で折り返し、390px 幅で
  横スクロールを出さない。未発見の Hidden Spot はノードも詳細も出さず、
  「情報で見つけた場所」は★として区別する（Rumor と exact location を混同しない）。
  従来のカード一覧は「釣り場の詳細」として下に残す
- **買取先の紹介文は Content の長文 `description` を画面に出さない。**
  Phase 14 では `description` をそのまま出していたが、そこには
  「PROVISIONAL — gameplay tuning」のような開発向けの語が含まれる。
  Phase 14.1 では `BuyerDefinition` の pricingProfile / preferences から
  **1〜2 行の役割文と好みタグ**を UI 側で組み立てる（魚種 ID・Buyer ID では分岐しない）。
  長文 description と PROVISIONAL の事実は Content / docs / validation に残す
- **HOME の上部は「地域 → 日時 → 天気 → Primary CTA → 噂 → 前回の釣行」を優先する。**
  家計の内訳（給与・生活費）のような補足は `<details>` にたたむ
- Phase 14.1 で追加した依存は無い（jsdom / Playwright などの実行時依存は足していない）。
  新しい画像アセットも追加していない（装飾は CSS と既存 SVG のみ）
