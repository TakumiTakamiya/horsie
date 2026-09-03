# Horsie 引き継ぎ

更新日: 2026-09-03

## 現在の状態

- 作業ブランチは `main`、追跡先は `origin/main`。今回の開始時点は `8853ccd` で同期済み、マージ作業なし。
- 今回は表のTickets列を削除し、設定ダイアログに「的中確率を表示」を追加。初期状態は表示。非表示時は見出しと全データ行を隠し、表を2列幅に縮める。R・条件・設定変更後も表示状態は維持する（リロードで初期化）。計算データ内のequivalentTicketsは変更しない。
- 1R〜12RそれぞれのPattern/Joker・キー・結果をページ内メモリへ記録。Rを戻すとそのRの条件と結果が復元される。初めて開くRは直前のPattern/Jokerを引き継ぎ、結果は未選択。
- 現在Rより小さい番号のボタンだけを「R／キー／結果」の3行に変更。R番号・キーは小さく、結果は大きめ。現在以降はR番号のみを大きく中央表示し、ボタンの高さは揃える。未訪問・未選択は「—」。
- 過去Rの修正はそのRの記録だけに反映。Space/Alt+Spaceで1R・12Rを循環しても記録は残る。記録はリロードでリセットされる（永続保存は未実装）。
- 右側に電卓を実装。三連単の結果選択（D2は4種類、DDは6種類）、共通の整数入力、単勝・2連単・三連単の倍率と計算結果3行、既存SVGによるチップ加算とクリア。
- 倍率は選択結果の先頭1・2・3文字で検索し、表のTax Rate・丸め設定・小数2桁表示と一致させる。結果はBigIntで正確に計算し、小数第2位を四捨五入して小数第1位まで表示。
- 入力範囲は0〜9007199254740991。小数・負数・指数表記・上限超過は無効。空欄は結果を「—」としチップは0から加算。クリアは入力だけ0へ戻す。
- 整数入力とTax Rate・丸め設定はR間で共有。各RのPattern/Joker変更時は、そのRの結果が引き続き有効なら維持、無効なら解除して記録を更新。倍率データ欠損は0扱いせず「—」。設定変更でも即時再計算。
- コミット時のCSS/JSバージョン自動付与は既存フックを使用。新しい `calculator.js` も対象。
- このチェックアウトでは `core.hooksPath=.githooks` を有効化済み。新しいclone先では `git config --local core.hooksPath .githooks` を一度実行する必要がある。Node.jsが必要。
- `AGENTS.md` の継続方針どおり、検証後に変更とこの記録をコミット・pushする。
- Selectionは余白なしの連続文字列。Dは濃い緑の太字、@はグレーの通常文字。
- 既存機能: 上部R選択、左にSelection・Probability（非表示可）・Fair oddsの表、右に電卓。表示設定は歯車ボタンから開くダイアログ。Space/Alt+SpaceでRを循環。
- 確率とオッズはPythonの出力時に小数2桁へROUND_HALF_UPで四捨五入。元の計算精度は維持。表示時も小数2桁に揃える。

## 実行・検証

- データ再生成: `py -3.9 calculate_odds.py`
- 表・電卓・履歴テスト: `node --test scripts/calculator.test.cjs`（今回14件成功。Tickets削除、確率列の初期表示・切り替え・状態維持と電卓への影響がないことを追加検証）
- フック回帰テスト: `node --test scripts/update-asset-versions.test.cjs`（今回6件成功。使い捨てGitリポジトリで実際のコミットも検証）
- Pythonテスト: `py -3.9 -m unittest test_calculate_odds.py`（今回8件成功）
- フック構文確認: `node --check scripts/update-asset-versions.cjs`（今回成功）
- アプリ構文確認: `node --check docs/app.js`、`node --check docs/calculator.js`、`node --check docs/odds-data.js`
- 差分確認: `git diff --check`（今回成功）
- ローカル表示: `py -3.9 -m http.server 8000 --bind 127.0.0.1 --directory docs`
- フック検証内容: 初回付与、冪等性、無関係なコミットでは更新なし、ステージ内容のみ採用、HTMLの部分ステージ保護、欠損アセット時の停止、通常コミットと `-a`、`--only` の安全な拒否。
- 電卓と履歴のイベント連携はNodeのモックDOMで確認。ローカルHTTP配信も確認。実ブラウザによる画面サイズ別の目視・操作検証は未実施。

## 公開・注意点・次の作業

- GitHub Pages公開元は `main` の `/docs`。公開URL: https://takumitakamiya.github.io/horsie/
- 通常のpush後のPages公開完了は別途確認が必要。認証トークンや秘密鍵は記録・コミットしない。
- 電卓のデータ形式・Python計算処理・SVGそのものは変更なし。追加のUI調整はユーザーのフィードバックに合わせる。
