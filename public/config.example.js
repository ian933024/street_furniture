// ============================================================
//  config.js — 複製這個檔案並重新命名為 config.js，填入你的 API 金鑰後儲存
// ============================================================

const CONFIG = {

  // ── 必填：OpenAI API 金鑰 ──────────────────────────────────
  // 用途：gpt-image-2 生成情境圖
  // 申請：https://platform.openai.com/api-keys
  OPENAI_API_KEY: "sk-...",

  // ── 選填：Google Gemini API 金鑰（影片生成功能）────────────
  // 用途：以 Veo 3.1 將生成圖片轉為 8 秒短影片
  // 申請：https://aistudio.google.com/apikey
  // 留空則影片按鈕會顯示設定說明，其餘功能不受影響
  GEMINI_API_KEY: "",

  // ── Firebase（作品上傳 + 展示 Gallery）──────────────────────
  // 在 Firebase 控制台 > 專案設定 > 一般 > 你的應用程式 取得
  FIREBASE_API_KEY:  "AIza...",
  FIREBASE_BUCKET:   "your-project-id.firebasestorage.app",

};
