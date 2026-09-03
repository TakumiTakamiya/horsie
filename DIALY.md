# Horsie 引き継ぎ

更新日: 2026-09-03

## 現在の状態

- 作業ブランチは `main`、追跡先は `origin/main`。今回の開始時点は `cc82bd4` で同期済み、マージ作業なし。
- 今回はSelectionの背景・枠線・固定幅・文字間隔を削除し、`D@D` のような連続した文字列に変更。Dは濃い緑の太字、@はグレーの通常文字。
- `AGENTS.md` に、明示的な例外指定がない限り作業完了後にコミット・pushする継続方針を記録。この記録も今回の変更と同じコミットに含める。
- 既存機能: 上部R選択、左に4列オッズ表、右に電卓のプレースホルダー。数値設定は歯車ボタンから開くダイアログ。
- 確率とオッズはPythonの出力時に小数2桁へROUND_HALF_UPで四捨五入。元の計算精度は維持。表示時も小数2桁に揃える。

## 実行・検証

- データ再生成: `py -3.9 calculate_odds.py`
- Pythonテスト: `py -3.9 -m unittest test_calculate_odds.py`（今回8件成功）
- 構文確認: `node --check docs/app.js`、`node --check docs/odds-data.js`（今回成功）
- 差分確認: `git diff --check`（今回成功）
- ローカル表示: `py -3.9 -m http.server 8000 --bind 127.0.0.1 --directory docs`
- 今回のSelection変更は、生成される文字列が空白なしの `D@D` でありD/@のクラスが分かれることをNodeのモックDOMで確認済み。実ブラウザの目視検証は未実施。

## 公開・注意点・次の作業

- GitHub Pages公開元は `main` の `/docs`。公開URL: https://takumitakamiya.github.io/horsie/
- 通常のpush後のPages公開完了は別途確認が必要。認証トークンや秘密鍵は記録・コミットしない。
- 電卓の仕様はユーザーからの指示待ち。現時点ではプレースホルダーのまま維持する。
