# Gemini教師支援プロキシ

GitHub Pagesで動く「宿題ポスト」からGemini APIキーを隔離する、Cloud Run向けの最小プロキシです。任意のプロンプト・モデル・スキーマは受け付けず、教師支援の4タスクだけを固定契約で実行します。リクエスト本文と生成文はログ・サーバー・Gemini側へ保存しない設定です。

## 必須環境変数

- `GEMINI_API_KEY`: Google AI Studioで発行したキー。Cloud RunのSecret Manager参照として設定します。
- `AI_GATEWAY_TOKEN`: 24文字以上のランダム値。教室端末のAI設定にも同じ値を登録します。
- `ALLOWED_ORIGIN`: 宿題ポストの完全なOrigin。複数はカンマ区切り（例: `https://gigayama.github.io,http://localhost:5173`）。
- `GEMINI_MODEL`: 任意。既定値は `gemini-3.5-flash`。
- `AI_RATE_LIMIT`: 任意。15分あたりの上限。既定値は30回。

## Cloud Runへの例

```sh
gcloud run deploy shukudai-post-ai \
  --source server/gemini-proxy \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars ALLOWED_ORIGIN=https://gigayama.github.io \
  --set-secrets GEMINI_API_KEY=shukudai-post-gemini-key:latest,AI_GATEWAY_TOKEN=shukudai-post-ai-token:latest
```

Cloud RunのURLを管理画面の「AI教師支援」に登録します。Gemini APIキーそのものは、ブラウザへ入力しないでください。ゲートウェイトークンはブラウザから利用される共有秘密なので、APIキーの代替ではありません。CORS、固定タスク、レート制限を組み合わせて悪用範囲を抑えるためのものです。組織運用ではCloud ArmorやIdentity-Aware Proxy、トークン定期更新も検討してください。

疎通確認は `GET /health`、生成は `POST /v1/teacher-assist` です。生成エンドポイントはBearer認証と許可Originが必須です。
