# Horsieの作業方針

## コミット・pushのデフォルト

- ユーザーから別の指定がない限り、変更作業の完了時は関連する検証を行い、その作業分をコミットして追跡先リモートへpushする。通常のコミット・pushについて再確認は不要。
- この方針は今後のセッションにも適用する。「コミットしない」「pushしない」などの明示的な指示がある場合はそちらを優先する。
- 調査・説明のみの依頼では、不要な変更や空コミットを作らない。
- ステージ前に差分を確認する。無関係な既存変更、秘密情報、認証情報は含めない。ユーザー作成ファイルは今回の作業範囲または明示的に許可されたものだけを含める。
- 現在のブランチと追跡先を確認して通常のpushを行う。force pushや履歴書き換えは行わない。競合・権限・認証などで進められない場合は状況を報告する。
- 最後にコミットID、push先、残った変更の有無を簡潔に報告する。

## セッションの引き継ぎ

- 実装・調査などのまとまった作業の終了時に、`DIALY.md` の状態、検証方法、未解決事項を更新する。古い状態を置き換え、秘密情報は記録しない。
- 引き継ぎファイルも通常の変更として、作業内容とともにコミット・pushする。

## キャッシュ更新フック

- このリポジトリをcloneしたら、一度 `git config --local core.hooksPath .githooks` を実行する。既に別のフック設定がある場合は上書きせず、先に確認する。Gitのローカル設定はclone先へ自動継承されない。
- コミット環境にはNode.jsが必要（テストはNode.js 22で確認）。`.githooks/pre-commit` が `scripts/update-asset-versions.cjs` を実行する。
- フックはステージ済みCSS/JSの内容ハッシュを `docs/index.html` の相対参照に `?v=...` として付与し、HTMLを自動ステージする。日付やHEADのコミットIDは使わず、内容が同じならURLは変えない。
- バージョン更新が必要な際に `docs/index.html` に未ステージ変更があるとコミットを停止する。HTMLをすべてステージするか、未ステージ部分を退避してから再試行する。フックを迂回して公開しない。
- 通常の `git add` → `git commit` と `git commit -a` を使う。バージョン更新が必要な `git commit --only` / ファイル指定コミット / カスタムインデックスは不整合防止のため停止する。
- 手動実行: `node scripts/update-asset-versions.cjs`（インデックスも更新するため、先に対象変更をステージする）。
- 回帰テスト: `node --test scripts/update-asset-versions.test.cjs`。使い捨てリポジトリでフック動作を検証する。

## プロジェクト構成

- GitHub Pages向けの静的サイトは `docs/`。HTML/CSS/JavaScriptのみで動作し、外部バックエンドやビルド工程は不要。
- `calculate_odds.py` が `simulation_results.json` から `docs/odds-data.js` を生成する。生成ファイルは手編集せず、Python側を修正して再生成する。
- Pythonテスト: `py -3.9 -m unittest test_calculate_odds.py`（利用可能な互換Pythonでも可）。
- JavaScript構文確認: `node --check docs/app.js`。
- 電卓の計算・入力・イベント連携テスト: `node --test scripts/calculator.test.cjs`。計算処理は `docs/calculator.js`、表と共通の倍率設定・画面連携は `docs/app.js`。
