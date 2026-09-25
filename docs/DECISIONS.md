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

## Phase 15 — Content Scale Foundation（1000+ Species）

Phase 15 は「ゲームルールの追加」ではなく、1000+ Species / 多数 Region / 多数 Spot に
耐える **Content Architecture** の整備である。既存の Content 量（82 Species / 53 Spot /
10 Region / playable 5）は変えず、その表現方法と読み込み経路だけを変えた。

決定:

- **Species ID は今後も global。** 地域ごとに別 ID を作らない
  （`tokyo-maaji` のような prefix 付き ID を禁止し、`validate:content` が検出する）。
  地域差は Occurrence / Presence / Environment / Size tuning 側で表現する
- **軽量カタログ（lightweight index）を起動時に読む。** `content-index.json` には
  Species summary（id / 名前 / scientificName / englishName（あれば）/ waterTypes /
  category / 分布 Region / habitats / rarityBand）と Region summary（id / 名前 /
  country / stage / packKey）だけを置く。生物学の詳細・Spot 地形・Trade tuning は入れない。
  Codex の一覧・検索・絞り込みはこの索引だけで完結する
- **Content Pack は「1 pack = 1 dynamic import」にする。** 5 つの region pack
  （tokyo-area / hokkaido / alaska / british-columbia / queensland）と 3 つの global pack
  （species-detail / tackle / world）に分ける。pack の実体は
  `scripts/build-content-index.ts` が生成する `src/content/generated/packs/*.ts` で、
  JSON を **静的 import** する（dynamic import を並べると 1 ファイル = 1 chunk になり、
  1000 Species 規模でリクエスト数が破綻するため）
- **起動時に読むのは「軽量カタログ + 今いる地域 + species-detail + tackle + world」**。
  他の地域は Expedition 画面で事前読み込みし、Region を選んだ時点で pack を読む。
  「全 Region の Spot / occurrence / tuning を初期 chunk へ入れる」状態にしない
- **Content loading は Application / UI 境界（`src/content/runtime`）で行う。**
  Domain へ Promise / dynamic import / fetch を持ち込まない。Domain は
  「読み込み済み Content」を受け取るだけである。loaded pack は application の
  cache に置き、Save には保存しない（architecture の詳細を Save へ持ち込まない）
- **pack loader は idle / loading / ready / error を持ち、同時要求は Promise を共有し、
  失敗した pack だけ retry できる。** UI は「地域情報を読み込み中…」と retry を出し、
  開発者向けの文言（pack 名 / chunk 名）は画面に出さない
- **Node / CI は全 Content を集約して読む。** `validate:content` /
  `simulate:regional-content` / `simulate:trade-network` / `simulate:content-scale` /
  テストは従来どおり全 Content を使える（browser の遅延ロードとは役割を分離）。
  Content 定義は二重管理しない（生成物は 1 つの generator から出す）
- **validation を強化する。** pack manifest と生成 pack module の一致、
  pack 所有権の重複・欠落（orphan content）なし、全 runtime Species の summary 存在、
  全 playable Region の pack 存在、canonical Species ID の地域 prefix 禁止、
  生成物の freshness（index を再生成して一致）を `validate:content` で検査する
- **PWA の update strategy は変えない。** ただし offline 時に JS chunk 要求へ
  index.html を返さない（navigation 要求だけに限定する）。hash 付き chunk を
  古いキャッシュから返すこともない
- **Save は v9 のまま。** pack / chunk / module path を Save に保存しない
  （Save は SpeciesId / RegionId / SpotId / BuyerId 等の安定 ID のみ）

## Phase 15.1 — True Lazy Loading（起動 critical path の削減）

Phase 15 のレビューで「chunk は分かれたが runtime では起動時に全部読んでいた」問題を直した。
Domain / Save v9 / gameplay rule は変更していない。

決定:

- **起動 critical path は「軽量カタログ + world + 今いる地域 + その地域の Species shard」だけ。**
  AppShell が required にする pack は `bootPackKeys(regionId)` の 3 つで、tackle は
  non-blocking の background preload、他地域と全 Species は起動では読まない
- **Species detail は Region ごとの shard にする。** 1 つの global pack に 1000 Species を
  入れて起動時に読む構造は禁止。各 shard は「その地域の釣り場に出る Species」だけを持ち、
  同じ Species 定義は source 上コピーしない（同じ JSON を複数の shard module が参照し、
  共有分は bundler が shared chunk にまとめる）。`detailShard` は各 Species の代表 shard
  で、Fish Box の別地域の魚を読むときの入口になる
- **Fish Box / Trade は保存された Species ID から必要な shard を追加で読む。**
  Save には pack / shard 情報を書かない（Fish Box の魚が扱えなくなることを禁止）
- **Tackle は HOME を block しない。** 起動では background preload だけ行い、
  Tackle / Shop / Spot など本当に必要になる画面で gate する
- **EXPEDITION は開いただけでは何も読まない。** 目的地カードの focus / 出発操作で、
  その地域の pack だけを先読みする（全地域の一括 preload を廃止）
- **Codex の名前検索は捕獲済みだけを対象にする。** 未捕獲 Species は名前 / 英語名 /
  scientificName / id で検索しても 1 件も返さない（検索から存在を推測できない）。
  Region / water filter の semantics は従来どおり
- **二次的な画面は dynamic import にする。** Codex / Shop / Tackle / Expedition /
  Fish Box / Trade / Contacts / Menu / Progression は初期 chunk に入れない
  （HOME / MAP / SPOT / FISHING は最初の導線なので eager のまま）

実測（production build）:

| | Phase 14 | Phase 15.0（boot） | Phase 15.1（boot） |
| --- | --- | --- | --- |
| boot raw | 925.44 kB | 871.38 kB | **604.95 kB** |
| boot gzip | 216.48 kB | 210.51 kB | **170.67 kB**（-21.2%） |
| initial chunk | 925.44 kB | 536.35 kB | 512.00 kB |

boot の内訳: index 512.00 / region-tokyo-area 39.01 / species-tokyo-area 31.26 /
world 12.47 / 共有 Species chunk 8.21。Tokyo の起動で読む Species は 38 種（全 82 種ではない）。

### Phase 15.2 — Startup Network Final Hardening

Phase 15.1 のレビューで「tackle は required ではないが AppShell mount 直後に background fetch
されるため、実効 startup network には含まれてしまう」問題を直した。

決定:

- **AppShell から tackle の preload を削除する。** 起動で読むのは
  `bootContentFor(regionId)`（= `bootPackKeys`: world + 今いる地域 + その地域の Species shard）
  だけ。tackle は Tackle / Shop / Spot / Fishing の gate（`usePack(GLOBAL_PACK_KEYS.tackle)`）
  で、実際に必要になった時点で読む。HOME は tackle 未ロードでも
  `NEUTRAL_FISHING_MODIFIERS` 等の fallback で成立する（Domain rule は変えない）
- **requestIdleCallback による preload は行わない。** 「最も単純で安全なのは削除」
  という方針に従い、起動直後の追加 fetch を 0 にする。将来的に preload する場合も
  「初回 HOME が ready になった後 + browser idle」に限定する
- **起動 network の保証は behavioral test にする。** `bootContentFor` が呼ぶ runtime を
  instrumented importer に差し替え、実際に呼ばれた pack importer を数える:
  - boot 直後: world / region:tokyo-area / species:tokyo-area の 3 つだけ
  - tackle / hokkaido / alaska の importer = 0 calls
  - HOME → MAP の遷移では新しい fetch なし
  - Spot / Tackle / Shop / Fishing で tackle を **1 度だけ**読み、以降は cache
  - 目的地を選ぶまで他地域 importer = 0 calls
  source 文字列の検索は主要な保証にしない（Expedition の mount 一括 preload の
  再発防止だけ、secondary guard として残す）
- **analyze:content-scale は実際に即時要求される chunk を数える**（initial + boot packs +
  それらが静的に読む shared chunk）。boot pack 一覧も出力し、tackle / 他地域が
  含まれないことを検査する

実測: boot raw 604.93 kB / boot gzip 170.62 kB（Phase 14 比 -21.2%、Phase 15.1 と同じ水準を
immediate network set でも維持）。tackle chunk は 201.31 kB（gzip 32.05）で **boot に含まれない**。

## Phase 16 — World Expansion I（Japan + International）

Phase 15 の Content Pack / Region lazy loading / Species shard / 軽量カタログ /
Codex scale 基盤を、実際の大規模コンテンツで使う最初の Phase。
**今回は Part 1**（世界の骨格 + 9 地域の representative content）であり、
目標の 200〜230 Species / 130〜150 Spot へは Part 2 で積み増す。

決定:

- **世界は 14 playable Region**（Tokyo / Hokkaido / Alaska / British Columbia /
  Queensland + Izu Peninsula / Tohoku Pacific / Hokuriku Japan Sea / Okinawa /
  Norway Fjords / New Zealand / Baja California / Thailand / Amazon Basin）。
  既存の planned region は Phase 16 の要求 id へ統合した
  （nordland→norway-fjords / southland→new-zealand /
  gulf-of-thailand→thailand / amazonas→amazon-basin。planned は Save に載らないため移行不要）
- **Species ID は今後も canonical global。** regional prefix は禁止で、
  同じ生物に 2 つの ID を作らない。Region 差は occurrence / presence / seasonality /
  temperature / size / zone affinity / habitat / timing で表現する
- **Spot は架空 / 一般化 / 複合**（実在の秘密ポイントや正確な座標を扱わない）。
  各 Phase 16 地域は public 4 + hidden 1（Amazon は 6）で、
  Region ごとに 3 種類以上の environment を持つ
- **外道を普通に混ぜる。** Phase 16 の野生 Spot は 4 Species 以上、
  1 種が encounter weight の 75% を超えないことを `simulate:world-expansion` が検査する
  （managed pond / 既存 Phase の Spot は警告に留める）
- **Discovery と Access は分離したまま。** 各地域に 1 つ以上の Hidden Spot を置き、
  必ず discover_spot 報酬（Trust 35）から発見できる。噂（intel, Trust 15）は
  Spot 名や正確な場所を明かさない
- **Trust / Rumor / Buyer も地域ごとに用意。** 9 地域に Buyer を 1 つずつ追加し、
  既存の tag affinity / local source bonus / region enforcement をそのまま使う
- **PROVISIONAL を維持。** 追加した分布・季節・サイズ・価格・fight tuning は
  gameplay PROVISIONAL であり、sourceRefs にその旨を明記する。
  実在の漁業規制・保護区・立入可否の主張はしない
- **scientificName 重複は report（warning）。** 既存 Content に 1 組
  （`giant-queenfish` / `queenfish` = Scomberoides commersonnianus）があり、
  ID 統合は Save / Codex / Trade を跨ぐ作業のため、Phase 16 では検出と報告に留め、
  新規重複を作らないことを Hard check にする

実測（Part 1）: species 82 → **144** / playable region 5 → **14** / spot 53 → **99** /
expedition 4 → **13** / buyer 3 → **12** / contact reward 12 → **30**。
boot は catalog が Species 数に比例するため 170.62 → 187.21 kB gzip
（Phase 14 比 -13.5%、raw は 644.70 / 925.44 = -30%）。

### Phase 16 Part 2 — World Expansion I: depth / progression / world UX

Part 1 の世界骨格の上に、深さ・進行・World UX を積んだ。新しい Phase ではなく、
同じ Phase 16 の続きである（Save v9 / Domain rule は不変）。

決定:

- **Content scale は目標範囲に収める。** Species 212（200〜230）、Spot 140（130〜150）、
  Buyer 24（20〜28）、playable Region 14（変更なし）。数字のための水増しはせず、
  各 Region の bycatch / 地域性を厚くする追加に限定した
- **Region ごとの 3 段階チェーン。** 各 Phase 16 Region に
  「漠然とした噂（intel）→ より具体的な intel → discover_spot」を用意し、
  **閾値は Region ごとに変える**（例: Amazon 12/24/40、Okinawa 18/32/52、
  Thailand 13/25/43）。3 段階は Region 内の別 Buyer に分散し、人脈を広げる動機にする
- **Trust balance は simulation で確認する。** 平均 quality の売却あたり Trust から
  「最初の報酬まで 2〜5 回」「Hidden Spot まで 5〜15 回」を
  `simulate:world-expansion` が検査する（1 回で全部解禁しない / 何十回も要さない）
- **Expedition の cost curve を検査する。** 国内 < 国際、Izu が最安、Amazon が最高、
  どの旅も自由資金の 6 か月分以内（実在の旅行価格の主張ではなく PROVISIONAL）
- **Discovery と Access は分離したまま。** discover_spot 報酬は「知る」だけを与え、
  travel は既存 AccessEngine（transport / permit / knowledge / cost）が判定する。
  Hidden Spot の半分以上は capability などの access 条件を持つ
- **Region selector を横一列のタブから「国 → 地域」の折りたたみに変える。**
  14 Region でも破綻せず、現在地は「いま ここ」、選択中は強調表示。
  MAP board / 詳細リストの構造は変えない
- **legacy Spot の外道を部分的に補う。** 2〜3 Species しかない既存 Spot のうち、
  設計上自然なものへ共通外道を 1〜2 種足した。残りは warning として報告し、
  Part 2b の作業対象にする（管理釣り場などの例外はそのまま）
- **giant-queenfish / queenfish は統合しない。** 同一 scientificName を持つ既知の
  canonical ID 問題として warning を維持し、Save/Codex/Trade を跨ぐ専用 migration
  Phase に送る。新規の重複は Hard check で禁止する


### Phase 16 Part 2b — Final World Hardening

Part 2 の世界を最終 hardening した。新規 Region / 新規 gameplay は追加しない。
Save v9 / Phase 15 lazy loading / Domain rule は不変。

決定:

- **季節は半球つきで解決する。** 以前は暦月だけで季節を決めていたため、
  New Zealand / Queensland が北半球と同じ季節になっていた。
  `ClimateProfile.hemisphere`（`north` | `south`）を追加し、
  `seasonOf(month, hemisphere)` / `seasonalFactor(month, hemisphere)` は
  半球で位相を反転させる（南半球のピークは 2 月、底は 8 月。1 月 = summer）。
  Region ID による分岐は書かない。既定は `north` なので既存 Region と Save schema は
  そのまま互換である
- **熱帯気候を sanity test で押さえる。** Queensland / Okinawa / Thailand / Amazon は
  年平均水温 24℃以上・年間の水温振れが温帯より小さいことを test にする。
  値はすべて PROVISIONAL なゲーム調整であり、実在の気候データの主張ではない
- **occurrence depth は外道と地域性で厚くする。** 数字を増やすための追加はせず、
  生物学・ゲーム的に自然な範囲で Amazon / Baja / NZ / Norway / Okinawa / Thailand を
  底上げした（Amazon 22→29 など）。legacy Spot の 2〜3 species も audit し、
  自然なものへ共通外道を足した。残る warning は既知の scientificName 重複のみ
- **Expedition を 国内 / 海外 でグループ化する。** 既存 `Country.domestic` を使い、
  カードと Phase 14 の見た目は維持する。EXPEDITION を開いただけでは
  destination の Region pack を読まない（Phase 15 の保証は不変）
- **最終 scale contract を test で固定する。** 14 playable Region /
  200〜230 Species / 130〜150 Spot / 20〜28 Buyer。giant-queenfish / queenfish は
  warning のまま維持し、統合は Save / Codex / Trade を跨ぐ
  **future dedicated canonical-ID migration** に送る（Phase 17 = Boat/Offshore とは別）
- **実機目視は未実施。** この環境ではブラウザを起動できないため、375 / 390 / 430 の
  確認は DOM / CSS の静的チェックに留め、目視したとは報告しない

実測（Part 2b）: Initial 572.15 kB（gzip 161.21）/ Tokyo boot 686.33 kB（gzip 195.76、
予算 200 kB / Phase 14 baseline 216.48 kB）/ tests 95 files / 834。

## Phase 17 — Boat & Offshore Expansion

「沖」と「水深」を既存の世界（14 Region / 229 Species / 140+ Spot）の上に足す。
新しい Region は追加しない。5 つの内部 sub-phase（17A〜17E）で進めたが、
ブランチ / PR は 1 つのまま（squash も rebase もしない）。

決定:

- **FishingPlatform は Save に保存しない。** `world.trip.transportId` +
  `TransportDefinition.boatCapability` / `transportType` から毎回 derive する
  （`shore | kayak | nearshore_boat | offshore_boat`）。Transport-ID / Region-ID
  では分岐しない
- **Depth は既存の `FishingZone.depthRangeM` をそのまま使う。** 新しい
  「DepthZone」コンテンツ種別は作らない。`DepthCapability` / `resolveDeployment` は
  既存の `CastCapability` / `resolveCast`（Casting Domain）を意図的に写した形にし、
  `Casting.ts` 自体は 1 行も変えていない。Zone の形（`castDistanceM` の有無）だけで
  cast 系と depth 系を振り分ける
- **Method presentation は状態機械を増やさない。** `cast | vertical | drift | troll`
  は UI ラベルと Platform 互換性だけを持つ任意フィールドで、既存 4 Method は
  省略時 `cast`・無制限（100% 後方互換）。CAST / HOOK / FIGHT という内部 phase 名は
  変えない。深場の Fight 距離は `depthToFightDistanceM`（sqrt 圧縮）で
  既存の cast-distance 単位へ落とす
- **Fish Finder は本物の `detectionDepthM` / `accuracy` を返す。** 「持っていれば
  強い反応」という boolean をやめ、探知深度を超えた Zone は見えない・海底も
  「不明」のままにする。Knowledge の解釈（`knowledgeTierFor`）と Fish Finder の
  物理観測は分離し、未捕獲 Species の実名は自動では明かさない
- **Reposition は transient。** 15〜30 分の game time を消費する deterministic
  seeded search で、`searchPositionIndex` は既存の `lastSearch` と同じ寿命
  （Spot を出る / 帰宅 / hydration でリセット）。Save には入れない
- **Buyer と汎用 Contact（Captain/Guide/Local Fisher/Rental Staff）は同じ
  `ContactId` 空間を共有する。** 新しい `contacts` Content 種別を Phase 15 の
  pack pipeline（schema → assembleContent → mergeContent → references →
  contentRuntime → build-content-index）へ full に載せた。`isContactKnown()` は
  Hidden Spot discovery と同じ「派生する、保存しない」方針を踏襲する
  （`initiallyKnown` または claim 済み `introduce_contact` から判定）
- **Charter は新しい世界 state を増やさない。** `TransportDefinition` に任意の
  `operatorContactId` を足しただけで、Booking システムやカレンダーは作らない。
  Charter 完了（帰宅）時に `applyCharterTripOutcome` が Base Trust
  （**ボウズでも入る**）+ 小さく頭打ちの釣果ボーナスを `TradeState.contactTrust`
  へ足し、既存の `claimEligibleRewards` で報酬を確定する。Captain Trust 専用の
  state は作らない
- **休眠していた `AccessRequirement.kind: 'relationship'` を実装した。**
  既存 Content はどれも使っていなかったため、安全に「常に満たす」から
  「`contactTrust[targetId] >= minimum` を実際に見る」へ変更した。Hidden Offshore
  Spot の一部は discover_spot の Trust より高い relationship Trust を access 条件にし、
  「知っている」と「連れて行ってもらえる」を意図的に分けた（Discovery ≠ Access）
- **Boat 進行の抜けていた段を埋めた。** kayak（¥160,000, nearshore）→
  small owned boat（¥1,600,000, nearshore, ramp launch, 新規）→
  rental-boat（¥28,000/trip, offshore）/ charter-boat（¥42,000〜65,000/trip,
  offshore, Captain 紐付き, 新規）→ owned-boat（¥4,800,000, offshore）。
  すべて PROVISIONAL な gameplay 数値であり、実際の相場の主張ではない
- **Hidden Offshore Spot は 5 → 10 に増やした。** Tokyo（既存 Captain の続き）/
  Izu / Norway / Hokkaido / Alaska に 1 つずつ、Captain の discover_spot
  （低い Trust）→ access の relationship 要件（やや高い Trust）という 2 段階にした。
  すべて fictional / generalized。実在の座標は使わない
- **Species は増やさない。** 新しい Spot はすべて、その Region の既存 fish table に
  ある global Species ID だけを再利用する（229 のまま）
- **Fish Finder は 3 段階にした。** basic（80m/0.6, 既存）/ mid（150m/0.75, 新規）/
  advanced（250m/0.9, 新規）。効果は検知深度と精度だけで、bite 率のボーナスにはしない
- **`simulate:offshore` を追加し `npm run check` に組み込んだ。** Depth /
  Sonar / Marine Readiness / 5 Method の再生可能性 / 岸釣り回帰 / Offshore Core
  Loop / Captain Loop / Skunk Loop / Boat Economy を実 Content 上で検証する
  （`simulate-trade-network.ts` と同じ PASS/FAIL 形式）
- **Save は v9 のまま。** Charter Trust は既存 `TradeState.contactTrust` を再利用し、
  Contact の既知判定は Hidden Spot discovery と同じ派生方式にした。永続化が
  必要な新しい state は最後まで 1 つも出てこなかった
- **Phase 18（Big Game）境界は越えない。** 大型種は既存 Text Battle のままにし、
  専用の巨大魚 fight system・fighting chair・harness は作らない

実測: 890 tests（`simulate:offshore` 追加分含む）/ boot gzip 181.5 kB
（予算 200 kB、Phase 16 baseline 181.06 kB から実質横ばい）。実機ブラウザでの
目視は Playwright（Chromium）で実施した: HOME→MAP は 375 / 390 / 430px の 3 段階、
MAP→相模湾 沖（レンタルボート）→SPOT（乗船/水深/海況/流れの行・狙える水域・
Search Water・Reposition）→FISHING（狙う水深パネルと CAST の提示ラベル）→
CONTACTS（未紹介の Captain が隠れていること）までの一本通しは 390px で確認した。
console error は 0 件。

## Phase 18 — Big Game / Endgame

大型魚を「別の戦闘システム」ではなく、既存 Text Battle の capability vs demand
として扱うことにした。魚種ごとの専用分岐は作らない。

- **FightCapability / FightDemand で難度を決める。** タックル側は
  effectiveLineCapacityM / dragCapacityKg / retrievePower / rodControl /
  leaderAbrasionResistance / weakLink(line/leader/hook の最弱点) に、魚側は
  massLoad / burstLoad / enduranceLoad / runPotential / divePressure /
  demandKg に分解する。チャレンジ帯（easy/manageable/demanding/extreme）は
  demandKg と実効 weak-link 強度の比だけで決める（種 ID を見ない）。
- **ライン容量の authority は 1 か所。** `lineCapacity.resolveEffectiveLineCapacityM`
  （reel の容量テーブルから「選んだライン強度に最も近いエントリ」を採用）を
  Depth / Fight の両方が使う。容量不明（null）は無限ではなく「上限扱いしない」。
- **物理ライン（lineOutM）と gameplay 距離（distanceM）は別変数。** 走り・
  GIVE・着底失敗で lineOut が伸び、REEL/HOLD/PUMP で戻る。容量に達すると
  LINE_BREAK とは別の終端 `SPOOLED`。大型魚ほど距離スケールは対数で
  頭打ち（sublinear）にし、巨大種でも距離が発散しない。
- **PUMP は大型魚向けの第 4 の能動コマンド。** retrievePower × rodControl +
  サイズボーナスで距離を詰めるが、スタミナを食いテンションを上げる。
  走っている最中は効かない。
- **Abrasion は leaderIntegrity に効く。** dive / head_shake / surge で
  耐摩耗性の低いリーダーが削れ、実効 break 閾値を下げる。
- **Readiness は派生表示。** ○/△/× の 5 項目（容量/ドラグ/巻上げ/最弱点/耐摩耗）を
  汎用 reference demand（36kg 級）または concrete demand に対して出す。
  大型魚の経験（Codex の PB 由来）が無い間はチャレンジ帯を隠す
  （Knowledge masking）。TACKLE パネルと遠征中パネルに出す。
- **Big Game Records は Codex から derive。** >=20kg or
  （>=10kg and >=90 percentile）。percentile は「その種の中では大きい」
  意味なので、小型種のトロフィー単体では Big Game experience にしない。
  未捕獲 Species は出さない（Codex の非開示ルールと同じ）。
- **Big Game spots は既存の hidden spot + discover_spot 機構。** Captain の
  高 Trust（55）で深場/潮目、Buyer の Trust（40）で磯の大物ポイント。
  新しい永続 state は無し（Save v9 のまま）。
- **`simulate:big-game` を `npm run check` に組み込んだ。** Light/Balanced/
  Heavy/Monster/Spool × Chinook/Halibut/GT/Arapaima/小型魚の着地率・
  ラインブレイク・SPOOLED を実 Content で検証する。各セットアップは
  `resolveGearForLoadout` + `resolveFightCapability` で実の
  FightCapability をエンジンに渡す（容量・weak link・retrievePower・
  rodControl・PUMP・自然な SPOOLED リスクが効く）。ファイト長は
  `totalTicks` ではなく `battle.step`（プレイヤー決定数）で測り、
  hooked ファイトの avg/p50/p90 を報告する。

## Dev Infrastructure（Phase 19 後の tooling 層）

ゲームプレイではなく、開発を支えるインフラを整備した判断を記録する。

- **`./dev` を front door にする。** `npm run dev` は vite 起動なので衝突を避け、repo root の `dev` シェルスクリプトが `scripts/dev/cli.ts` を呼ぶ形にした。新しい npm script は増やさない（`npm run dev` を奪わない）。
- **authority map はキュレート + 生成の2層。** `.dev/authority-map.json` は人が保守する定義（どこが source of truth か、どこに persist されるか、変更点はどこか）。`.dev/project-map.json` は `dev map` が import グラフから生成する派生物。 consumers / tests は手書きしない（すぐ古くなるため）。
- **doctor は read-only。** state を変えないため何度でも実行できる。生成物の鮮度（content-index / project-map）と authority map のパス整合を見る。
- **check は quick / full の2層。** quick は編集ごと（typecheck+lint+format+content+authority+save+smoke+tests ≈30s）、full は merge 前（+全 simulation+build ≈60s）。
- **save-check は fixture ベース。** `tests/fixtures/save.ts` の v1..v9 を serialize→migrate→validate→再migrate（冪等）する。IndexedDB を必要としないためどこでも動く。
- **smoke は domain API のみ。** ブラウザ自動化はしない。simulateTrip が HOME→travel→spot→fishing→home を seed 固定で2回実行し fingerprint を比較するので、これを束ねて save round-trip を追加しただけ。
- **scope / impact / context / handoff は生成された map を使う。** 静的解析ではなく index ベースの軽量版。 agent が「どこを読むべきか」を即座に得るためのもの。
- **生成物の commit 方針**: `.dev/project-map.json` と `src/content/generated/` はコミットする（決定論的）。CI の `./dev map --check` が鮮度を強制する。`dist/` `coverage/` `node_modules/` は ignore のまま。
