---
title: "Owl Snap"
year: 2026
roles: ["フロントエンド", "デプロイ"]
stack: ["TypeScript", "Next.js", "React", "FastAPI", "AWS Amplify", "Amazon Bedrock"]
summary: "夕食の写真から、その内容をモチーフにしたオリジナルのフクロウ画像を生成するWebアプリ。"
thumbnail: "./images/owl-snap.png"
cover: "./images/owl-snap.png"
links:
  - label: "GitHub"
    href: "https://github.com/cog-pr/progate_owl"
  - label: "紹介ページ"
    href: "https://topaz.dev/projects/c9c823fa726a841fa217"
order: 3
---

## OVERVIEW

「Progateハッカソン powered by AWS」で制作。テーマは各チーム名の動物で、自分たちはフクロウチームだった。

夕食の写真から、その内容をモチーフにしたオリジナルのフクロウ画像を生成するWebアプリ。忙しい日でも夕食を取るきっかけを作ることを目的に、画像認識と生成AIを組み合わせた。

## ROLE

3人チーム。フロントエンド2名・バックエンド1名に分かれ、主にフロントエンドを担当した。

Next.js によるプロジェクトの雛形作成、画面の実装、バックエンドAPIとの連携を行った。あわせてフロントエンドの AWS Amplify へのデプロイと、FastAPI で構築されたバックエンドの Amazon EC2 へのデプロイも担当した。

## HOW IT WORKS

一日に一回、夕食の写真をアップロードすると、写真の内容をモチーフにしたフクロウ画像が生成される。

画像は Next.js から FastAPI へ送られ、Amazon Rekognition で内容を認識したあと、検出された料理の情報をもとに Amazon Bedrock でフクロウ画像を生成する。ユーザー登録・ログイン、生成した画像の履歴表示、1日1回の生成制限に対応している。

## STACK

- フロントエンド: TypeScript / Next.js / React / Tailwind CSS
- バックエンド: Python / FastAPI / Uvicorn
- クラウド: AWS Amplify / Amazon EC2
- AI・画像認識: Amazon Rekognition / Amazon Bedrock
- 開発環境: Docker / Git / GitHub
