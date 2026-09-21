# Fishing

現代日本を舞台にした、リアル志向の釣りハクスラゲーム。

東京近郊で働く普通の会社員としてスタートし、休日や仕事帰りに釣りへ出かける。
魚を釣り、経験・知識・資金・名声を得て、道具、車、船、人脈を増やしながら、日本中の釣り場と魚へ到達していく。

## Core Idea

世界は最初から存在する。

ただし最初のプレイヤーには、

- 技量がない
- 金がない
- 道具がない
- 車がない
- 船がない
- 知識がない
- 人脈がない

ため、世界のごく一部しか遊べない。

成長することで「Lvでステージが開く」のではなく、実際の能力・資産・知識・関係性によって行動範囲が広がる。

## Progression

4つの主要成長軸を持つ。

- **Angler Level** — 本人の総合経験・技量（Lv1〜100）
- **Reputation** — 釣り人としての名声・信用
- **Assets** — タックル、車、船、魚探など
- **Knowledge** — 魚、釣り場、地域、釣法についての知識

## Fish

現実の日本の魚、生息環境、季節、釣法等を参考にデータ化する。

長期的には:

- 1000+ fish species
- hundreds to 1000+ fishing spots

を扱える構造を目指す。

同じ魚種でもサイズ・重量・コンディション・行動・Traitが異なる。
「同じ場所でも次の一匹は違う」ことをハクスラ性の中心にする。

## Design Documents

- [Game Design](docs/GAME_DESIGN.md)
- [Progression](docs/PROGRESSION.md)
- [Data Model](docs/DATA_MODEL.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)

## Current Status

Phase 7A — Transport / Access Domain 完了。

徒歩・公共交通・自転車・二輪・車・SUV・カヤック・レンタル船・所有船を
data-driven Content として扱い、Spot の物理 access capability、所有・レンタル費、
移動時間、Save v6 migration を実装している。世界の解放に Angler Level は使わない。

```sh
npm run check
npm run simulate:transport
```
