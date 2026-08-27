---
title: "たかがAI、されどAI。"
year: 2026
roles: ["PM", "設計", "実装"]
stack: ["TypeScript", "React", "Hono", "Cloudflare Workers", "WebSocket", "OpenAI API"]
summary: "人間チームとAIが大喜利で対戦する4人用のWebゲーム。AIに負けても早押しで挽回できる。"
thumbnail: "./images/takaga-ai-thumb.svg"
cover: "./images/takaga-ai-cover.svg"
links:
  - label: "GitHub"
    href: "https://github.com/tukutteasobu-hackathon-10/tukutteasobu_hackathon_10"
  - label: "サービス"
    href: "https://tsukuaso.com/"
order: 1
---

## OVERVIEW

「第10回 ツクってアソぶハッカソン」（テーマ: みたかAI！これが人類だ！）で制作した、スマートフォン向けの4人用Webゲーム。ランダムに選ばれた挑戦者とAIが同じ大喜利のお題に回答し、残りの3人が面白いと思ったほうへ投票する。

AIに負けた場合でも、早押しチャレンジに成功すれば人間側のポイントになる。フィジカルを持っている人間の特権という位置づけ。先に3ポイント取ったほうが勝ち。

ファイナリストに選出され、2分間のプレゼンテーションを行った。受賞はできなかった。

## ROLE

3人チーム。PMとしてタスク分割と進捗管理を行いながら、実装にも入った。

担当したのは開発環境の構築、ゲーム画面のワイヤーフレーム作成と実装、投票集計と回答匿名化のロジック、ルーム作成・参加API、WebSocketによるゲーム進行の同期、デプロイ。

## HOW IT WORKS

ホストがルームを作成し、発行されたルームコードで3台の端末から参加する。回答は人間・AIとも匿名化したうえで提示され、投票は挑戦者以外の3人が行う。

進行の同期は WebSocket。AIの回答は OpenAI API で生成しているが、APIが失敗したときは固定回答へ切り替えてゲームを継続する構成にした。4人が同時に待っている状況では、正確さより止まらないことのほうが体験に効くため。

## STACK

- フロントエンド: TypeScript / React / Vite / Tailwind CSS
- バックエンド: TypeScript / Hono
- 通信: REST API / WebSocket
- AI: OpenAI API
- デプロイ: Cloudflare / Wrangler
- 開発・テスト: Node.js / npm / Vitest
