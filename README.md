# Horsie Odds

Horsie Odds は、レース条件ごとのシミュレーション結果から的中確率とフェアオッズを確認し、選択した結果とチップ数から払戻相当値を計算する静的Webページです。

- 公開URL: https://takumitakamiya.github.io/horsie/
- 公開元: `main` ブランチの `docs/`
- 構成: HTML / CSS / JavaScriptのみ（外部バックエンド、フレームワーク、ビルド工程なし）

## ページの目的

レース番号、Pattern、Jokerから検索キーを組み立て、その条件に対応するSelection・Odds・Probabilityを一覧表示します。実際の三連単結果とチップ数を入力すると、同じ表示設定を使って単勝・2連単・三連単の倍率と計算結果を確認できます。

ブラウザ内で完結するため、GitHub Pagesへそのまま配置して利用できます。入力内容やレース履歴はサーバーへ送信されません。

## 画面構成と各コンポーネントの役割

PC表示は、左側のオッズ表を1、右側の操作・電卓を2とする幅比です。900px以下では操作、表、電卓の順に縦並びになります。

### R選択

1R〜12Rを切り替えます。R番号は `docs/data.js` の `R_TO_X` によって距離コード `S` / `M` / `L` に変換されます。

- 現在より前のRには、記録したR番号・キー・実際の結果を3行で表示します。
- レースごとのPattern、Joker、キー、結果はページを開いている間だけメモリに保持します。
- リロードすると履歴は初期化されます。
- `Space` で次のR、`Ctrl + Space` で前のRへ循環します。

### Pattern / Joker選択

検索条件の残りを選択します。

- Pattern: `D2` または `DD`。`D` キーでも順に切り替えられます。
- Joker: なし、`J`、`JJ`。`J` キーでも順に切り替えられます。

検索キーは次の形式です。

```js
key = `${R_TO_X[r]}${pattern}${joker}`
```

例: `MDD`、`SD2J`、`LDDJJ`

### オッズ表

現在のキーに対応する固定データを `docs/odds-data.js` から読み込み、次の順で表示します。

1. Selection
2. Odds
3. Probability（設定で表示・非表示を切り替え可能）

表タイトルでは距離コードだけを日本語化し、`S` は「短距離」、`M` は「中距離」、`L` は「長距離」と表示します。Selection内の `D` は強調し、`@` とひと続きのパターンとして読めるようにしています。

### 表示設定

表タイトル横の歯車ボタンからダイアログを開きます。

- Probability列の表示・非表示
- 実値、または丸め
- 丸める場合の単位（0.1、0.5、整数）
- 丸める場合の方法（切り捨て、四捨五入）
- 単勝・2連単・三連単それぞれのTax Rate（0〜100%）

Tax Rateと丸めは保存済みの値そのものを書き換えず、画面表示時だけ次の順で適用します。

```text
元のオッズ
  → originalOdds × (1 - 券種別taxRate / 100)
  → 選択した切り捨て・四捨五入
  → 実値は小数第2位、0.1・0.5単位は小数第1位、整数単位は整数で表示
```

不正なTax Rateは券種ごとにエラー表示になり、その券種の直前の有効値を維持します。

### 電卓

実際の三連単結果を選び、チップ数と現在のオッズから単勝・2連単・三連単を同時に計算します。

- 結果候補は現在のキーに存在する三連単Selectionから生成します。
- 単勝と2連単は、選択した三連単結果の先頭1文字・2文字を使って対応する倍率を検索します。
- 入力は `0`〜`9007199254740991` の整数のみです。
- Tax Rate入力欄以外では、フォーカス位置にかかわらず数字キーを押すと電卓へ入力され、`C` キーで0へ戻ります。電卓入力欄は表示専用で、文字・記号・貼り付け入力やカーソル表示はありません。
- 入力欄は単勝行の横に置き、その下（2連単・三連単行の横）に1、5、10、25、100チップとクリアを2列×3行で配置します。
- チップで値を加算でき、クリアで0に戻せます。
- 計算は大きな整数でも誤差が出ないよう `BigInt` を使い、結果を小数第1位へ四捨五入します。
- 券種別Tax Rateと丸め設定は、表と電卓の倍率へ共通して適用されます。

## データの流れ

```text
simulate.py
  ↓ 100,000シード × 各シナリオの結果件数
simulation_results.json
  ↓ 確率・フェアオッズを計算
calculate_odds.py
  ↓ JavaScriptデータとして出力
docs/odds-data.js
  ↓ キー検索・表示設定を適用
docs/app.js + docs/calculator.js
  ↓
表と電卓
```

`calculate_odds.py` はSelectionごとの等価な組み合わせ数を考慮して確率を計算し、その逆数をDecimal Oddsとして出力します。公開データへ書き出す段階でProbabilityとOddsを小数第2位へ四捨五入します。

## 各ファイルの役割

### 公開ページ（`docs/`）

| ファイル | 役割 |
| --- | --- |
| `docs/index.html` | ページのHTML構造、各コントロール、オッズ表、設定ダイアログ、電卓を定義します。CSS/JS参照にはキャッシュ更新用の `?v=` が付きます。 |
| `docs/style.css` | 1:2のPCレイアウト、スマートフォン表示、セグメンテッドコントロール、表、設定ダイアログ、電卓、D/@の表示を担当します。 |
| `docs/data.js` | R番号から距離コード `S` / `M` / `L` への固定マッピング `R_TO_X` を定義します。R対応を変える場合の編集箇所です。 |
| `docs/odds-data.js` | キーごとのSelection、券種、確率、オッズなどを保持する生成ファイルです。直接編集せず、`calculate_odds.py` で再生成します。 |
| `docs/app.js` | ページ全体の状態、キー生成、レース履歴、表描画、表示設定、キーボード操作、電卓との連携を管理します。 |
| `docs/calculator.js` | 整数入力の検証、チップ加算、結果候補の抽出、単勝・2連単・三連単の検索と正確な乗算を担当します。Node.jsテストからも直接利用できます。 |
| `docs/chips/*.svg` | 1、5、10、25、100チップボタンに表示する画像です。 |

### データ生成

| ファイル | 役割 |
| --- | --- |
| `simulate.py` | 距離・Pattern・Jokerの各シナリオを固定シード範囲でシミュレーションし、結果件数を生成します。 |
| `simulation_results.json` | シミュレーションで得たキー別・三連単結果別の件数です。`calculate_odds.py` の入力になります。 |
| `calculate_odds.py` | 結果件数から単勝・2連単・三連単の確率とフェアオッズを計算し、`docs/odds-data.js` を生成します。 |
| `test_calculate_odds.py` | シナリオ検証、確率計算、等価組み合わせ数、並び順、出力時の四捨五入を検証します。 |

### テスト・開発補助

| ファイル | 役割 |
| --- | --- |
| `scripts/calculator.test.cjs` | 電卓ロジックに加え、モックDOM上で表・設定・キーボード・R履歴などの画面連携を検証します。 |
| `scripts/update-asset-versions.cjs` | ステージ済みCSS/JSのGit Blob IDを使い、`docs/index.html` の `?v=` を更新します。 |
| `scripts/update-asset-versions.test.cjs` | キャッシュ更新処理とpre-commit連携の安全性を検証します。 |
| `.githooks/pre-commit` | コミット直前にキャッシュ更新スクリプトを実行します。 |
| `AGENTS.md` | このリポジトリでの作業、検証、commit・pushに関する継続ルールです。 |
| `DIALY.md` | 現在の実装状態、検証結果、注意点を次回作業へ引き継ぐための記録です。 |
| `カメラのアイコン素材 7.svg` | 現在の公開ページからは参照されていない、リポジトリ直下の素材ファイルです。 |

## データを更新する

シミュレーションから作り直す場合:

```powershell
py -3.9 simulate.py
py -3.9 calculate_odds.py
```

既存の `simulation_results.json` からオッズだけ再生成する場合:

```powershell
py -3.9 calculate_odds.py
```

`docs/odds-data.js` は生成物なので直接編集しないでください。Rと距離の対応だけを変える場合は `docs/data.js` を編集します。

## ローカルで確認する

```powershell
py -3.9 -m http.server 8000 --bind 127.0.0.1 --directory docs
```

ブラウザで `http://127.0.0.1:8000/` を開きます。ファイルを直接開くより、GitHub Pagesに近いHTTP配信で確認する方法を推奨します。

## テスト

```powershell
py -3.9 -m unittest test_calculate_odds.py
node --test scripts/calculator.test.cjs
node --test scripts/update-asset-versions.test.cjs
node --check docs/app.js
node --check docs/calculator.js
node --check docs/odds-data.js
node --check scripts/update-asset-versions.cjs
```

## commit時のキャッシュ更新

新しいcloneでは、最初に次を1回実行します。

```powershell
git config --local core.hooksPath .githooks
```

以後、CSSまたはJavaScriptをステージして通常の `git commit` を実行すると、pre-commitフックが内容に対応する `?v=` を `docs/index.html` に付与し、HTMLも自動でステージします。日付ではなく内容由来の値なので、ファイル内容が変わらなければURLも変わりません。

## 公開

GitHub PagesのSourceを `main` ブランチの `/docs` に設定します。`main` へpushするとGitHub Pagesが静的ファイルを公開します。
