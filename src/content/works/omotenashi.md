---
title: "表無し"
titleEn: "Omotenashi"
year: 2026
roles: ["バックエンド"]
stack: ["Python", "FastAPI", "SQLModel", "Supabase", "PostgreSQL", "React Native"]
summary: "地元の人だけが知る裏スポットを地図で共有する街歩きアプリ。訪れると足あとが投稿者へ届く。"
thumbnail: "./images/omotenashi.png"
cover: "./images/omotenashi.png"
links:
  - label: "GitHub"
    href: "https://github.com/progatehackathon-26-07-kawappiramochi/omotenashi"
  - label: "紹介ページ"
    href: "https://topaz.dev/projects/50b90b0dc5732dc3bc14"
order: 2
---

## OVERVIEW

「Progateハッカソン 2026.07」（テーマ: おもてなし 〜ここに来たいと思わせる最高の体験〜）で制作。「おもてなし」を「表無し」ともじり、地元の人だけが知る穴場や裏スポットを地図上で共有・探索できる街歩きアプリにした。

実際にスポットを訪れた人の反応が投稿者へ届く形にすることで、継続的な投稿と街の探索を促すことを狙っている。

## ROLE

4人チーム。バックエンドを担当した。

スポット情報の取得・投稿API、ユーザー情報取得API、足あと登録APIを FastAPI で実装。あわせて現在地とスポットの距離による範囲判定、Supabase の JWT を用いた認証、ユーザープロフィールと利用状況の集計機能も担当した。

## HOW IT WORKS

地図上に裏スポットを写真付きで表示し、詳細の確認と新規投稿ができる。ユーザーがスポットの所定範囲内に入ると、写真とリアクションを添えて「足あと」を残せる仕組みで、投稿者には通知が届く。

マイページでは投稿数・足あと数・探索率を確認できる。

## STACK

- モバイル: TypeScript / React Native / Expo / NativeWind / MapLibre
- Webフロントエンド: TypeScript / React / Vite / Tailwind CSS
- バックエンド: Python / FastAPI / SQLModel / Uvicorn
- 認証・データベース: Supabase Auth / PostgreSQL
- インフラ: Railway / Cloudflare Pages / Docker
