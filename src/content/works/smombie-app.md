---
title: "歩きスマホ検知アプリ"
titleEn: "Smombie App"
year: 2026
roles: ["データ前処理", "実装"]
stack: ["Python", "Streamlit", "scikit-learn", "pandas", "SQLite"]
summary: "スマホのセンサーデータを機械学習で分析し、歩きスマホをリアルタイムで検知して警告する。"
thumbnail: "./images/smombie-app.png"
cover: "./images/smombie-app.png"
links:
  - label: "GitHub"
    href: "https://github.com/cog-pr/smombie_app"
order: 4
---

## OVERVIEW

スマートフォンの線形加速度センサーとジャイロセンサーのデータを機械学習で分析し、歩きスマホをリアルタイムで検知して警告するWebアプリケーション。大学の実験の授業で制作した。

歩きスマホによる事故を防ぎ、安全な歩行を促すことを目的としている。

## ROLE

6人チーム。データの前処理は6人全員で、アプリの制作は3人で取り組んだ。

センサーデータの収集と前処理に加え、サンプルコードを参考に Streamlit でWebアプリの雛形を作成し、トップページを実装した。予測結果について、状態ごとの合計時間を算出・表示する機能も担当した。

## HOW IT WORKS

Excel形式のセンサーデータから学習用のデータを作り、「停止」「歩きスマホ」「歩きスマホ以外」の3状態をラベルとして設定した。

6軸のセンサーデータをスライディングウィンドウで分割し、平均・標準偏差・四分位数・歪度・尖度などを特徴量として抽出する。抽出した特徴量を Random Forest で学習し、Streamlit 上でモデルの評価とリアルタイム予測を行う構成。

実行時は phyphox からセンサーデータをリアルタイムで取得し、歩きスマホを検知すると登録されたメールアドレスへ警告を送信する。ユーザー登録・ログインと、モデルのパラメータ設定にも対応している。

## STACK

- 言語: Python
- Webアプリ: Streamlit
- 機械学習: scikit-learn / Random Forest
- データ処理: pandas / NumPy / SciPy / openpyxl
- 可視化: Matplotlib
- データベース: SQLite / SQLAlchemy
- センサー連携: phyphox / requests
- 通知: yagmail
