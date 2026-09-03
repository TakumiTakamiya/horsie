# Horsie 引き継ぎ

更新日: 2026-09-03

## 現在の状態

- 作業ブランチは `main`、追跡先は `origin/main`。今回の開始時点は `03f7aaa` で同期済み、マージ作業なし。
- 今回は `.githooks/pre-commit` と `scripts/update-asset-versions.cjs` を追加。コミットするCSS/JSの内容ハッシュをHTML参照の `?v=...` に自動設定し、HTMLも同じコミットへ含める。
- フックはステージ済み内容を使用。未ステージのCSS/JS編集は巻き込まない。更新が必要なHTMLに未ステージ変更がある場合やファイル指定コミットの場合は、変更前に安全に停止する。
- このチェックアウトでは `core.hooksPath=.githooks` を有効化済み。新しいclone先では `git config --local core.hooksPath .githooks` を一度実行する必要がある。Node.jsが必要。
- `AGENTS.md` の継続方針どおり、検証後に変更とこの記録をコミット・pushする。
- Selectionは余白なしの連続文字列。Dは濃い緑の太字、@はグレーの通常文字。
- 既存機能: 上部R選択、左に4列オッズ表、右に電卓のプレースホルダー。数値設定は歯車ボタンから開くダイアログ。
- 確率とオッズはPythonの出力時に小数2桁へROUND_HALF_UPで四捨五入。元の計算精度は維持。表示時も小数2桁に揃える。

## 実行・検証

- データ再生成: `py -3.9 calculate_odds.py`
- フック回帰テスト: `node --test scripts/update-asset-versions.test.cjs`（今回6件成功。使い捨てGitリポジトリで実際のコミットも検証）
- Pythonテスト: `py -3.9 -m unittest test_calculate_odds.py`（今回8件成功）
- フック構文確認: `node --check scripts/update-asset-versions.cjs`（今回成功）
- アプリ構文確認: `node --check docs/app.js`、`node --check docs/odds-data.js`
- 差分確認: `git diff --check`（今回成功）
- ローカル表示: `py -3.9 -m http.server 8000 --bind 127.0.0.1 --directory docs`
- フック検証内容: 初回付与、冪等性、無関係なコミットでは更新なし、ステージ内容のみ採用、HTMLの部分ステージ保護、欠損アセット時の停止、通常コミットと `-a`、`--only` の安全な拒否。

## 公開・注意点・次の作業

- GitHub Pages公開元は `main` の `/docs`。公開URL: https://takumitakamiya.github.io/horsie/
- 通常のpush後のPages公開完了は別途確認が必要。認証トークンや秘密鍵は記録・コミットしない。
- 電卓の仕様はユーザーからの指示待ち。現時点ではプレースホルダーのまま維持する。
