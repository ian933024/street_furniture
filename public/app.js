/* ================================================================
   app.js — 街道家具設計視覺化 主程式
================================================================ */

'use strict';

// ── Application State ──────────────────────────────────────────
const S = {
  imageBase64:        null,
  txtFurniture:       '',
  txtProblem:         '',
  txtLocation:        '',
  txtUsers:           '',
  txtOther:           '',
  generatedImgUrl:    null,   // data:image/png;base64,...
  generatedVidUrl:    null,   // Veo URI
  generatedVidBlobUrl: null,  // blob URL for <video> element
};

// ── DOM shorthand ──────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ================================================================
// SCREEN NAVIGATION
// ================================================================
const STEP_MAP = {
  upload: 1, details: 2, generating: 3, vgen: 3,
  result: 4,
};

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen-${id}`).classList.add('active');
  updateSteps(id);
  window.scrollTo(0, 0);
}

function updateSteps(id) {
  const ind = $('step-indicator');
  const step = STEP_MAP[id] ?? 0;
  if (step === 0) { ind.classList.add('hidden'); return; }
  ind.classList.remove('hidden');
  document.querySelectorAll('.step-item').forEach(el => {
    const n = +el.dataset.step;
    el.classList.toggle('active', n === step);
    el.classList.toggle('done', n < step);
  });
}

// ================================================================
// ERROR TOAST
// ================================================================
let toastTimer = null;
function showError(msg) {
  $('toast-msg').textContent = msg;
  $('toast').classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 6000);
}

// ================================================================
// SCREEN 1 — UPLOAD
// ================================================================
function setupUpload() {
  const area    = $('upload-area');
  const input   = $('file-input');
  const ph      = $('upload-placeholder');
  const prev    = $('upload-preview');
  const prevImg = $('preview-img');

  function openCamera()  { input.setAttribute('capture', 'environment'); input.click(); }
  function openGallery() { input.removeAttribute('capture'); input.click(); }

  area.addEventListener('click', e => {
    if (!e.target.closest('.btn-change')) openGallery();
  });
  $('btn-change-photo').addEventListener('click', e => { e.stopPropagation(); openGallery(); });
  $('btn-camera').addEventListener('click',  openCamera);
  $('btn-gallery').addEventListener('click', openGallery);

  input.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showError('請選擇圖片檔案（JPG、PNG 等）'); return; }
    compressAndPreview(file);
  });

  area.addEventListener('dragover', e => { e.preventDefault(); area.style.borderColor = 'var(--primary)'; });
  area.addEventListener('dragleave', () => { area.style.borderColor = ''; });
  area.addEventListener('drop', e => {
    e.preventDefault(); area.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) compressAndPreview(file);
  });

  async function compressAndPreview(file) {
    try {
      const base64 = await resizeToBase64(file, 1024);
      S.imageBase64 = base64;
      prevImg.src = base64;
      ph.classList.add('hidden');
      prev.classList.remove('hidden');
      area.classList.add('has-img');
    } catch (err) {
      if (err.message === 'heic-unsupported') {
        showError('無法讀取此圖片格式。請在相機 App 拍照後直接選取，或先將 HEIC 轉存為 JPG 再上傳。');
      } else {
        showError('無法讀取圖片，請換一張試試');
      }
    }
  }

  $('btn-upload-next').addEventListener('click', () => {
    if (!S.imageBase64) {
      if (!confirm('尚未上傳照片，要繼續嗎？\n（有照片能讓 AI 更準確呈現設計）')) return;
    }
    showScreen('details');
  });
}

function resizeToBase64(file, maxPx) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('heic-unsupported')); };
    img.src = url;
  });
}

// ================================================================
// SCREEN 2 — DETAILS
// ================================================================
function setupDetails() {
  const fields = [
    ['txt-furniture', 'txtFurniture'],
    ['txt-problem',   'txtProblem'],
    ['txt-location',  'txtLocation'],
    ['txt-users',     'txtUsers'],
    ['txt-other',     'txtOther'],
  ];
  fields.forEach(([id, key]) => {
    $(id).addEventListener('input', e => { S[key] = e.target.value; });
  });

  $('btn-details-back').addEventListener('click', () => showScreen('upload'));
  $('btn-generate').addEventListener('click', handleGenerate);
}

// ================================================================
// SCREEN 3 — GENERATE
// ================================================================
function setStep(n, state) {
  const el = $(`gstep-${n}`);
  el.classList.remove('active', 'done');
  if (state === 'active') el.classList.add('active');
  if (state === 'done')   el.classList.add('done');
  const badge = el.querySelector('.gstep-badge');
  badge.textContent = state === 'active' ? '進行中…' : state === 'done' ? '完成' : '等待中';
}

function setStatus(msg) { $('gen-status').textContent = msg; }

async function handleGenerate() {
  if (!S.txtFurniture.trim()) { showError('請填寫「我們的街道家具是」欄位'); return; }
  if (!S.txtLocation.trim())  { showError('請填寫「想要放在哪裡」欄位'); return; }

  if (!CONFIG?.OPENAI_API_KEY || CONFIG.OPENAI_API_KEY.includes('請填入')) {
    showError('請先在 config.js 填入 OpenAI API 金鑰');
    return;
  }

  [1, 2, 3].forEach(n => setStep(n, 'waiting'));
  showScreen('generating');

  try {
    await runGeneration();
  } catch (err) {
    console.error('[generate]', err);
    showScreen('details');
    showError(friendlyError(err));
  }
}

async function runGeneration() {
  setStep(1, 'active');
  setStatus(S.imageBase64 ? '正在準備模型參考照片…' : '正在準備設計資料…');
  await delay(400);
  setStep(1, 'done');

  setStep(2, 'active');
  setStatus('正在構建設計提案…');
  const prompt = S.imageBase64 ? buildPromptWithImage() : buildPromptTextOnly();
  await delay(600);
  setStep(2, 'done');

  setStep(3, 'active');
  setStatus('正在生成情境圖片，約需 20–40 秒…');
  const b64 = S.imageBase64
    ? await callGptImage2WithRef(prompt)
    : await callGptImage2(prompt);
  S.generatedImgUrl = `data:image/png;base64,${b64}`;
  setStep(3, 'done');
  setStatus('完成！');

  await delay(500);
  renderResult();
}

// ── Prompts ───────────────────────────────────────────────────
function buildPromptWithImage() {
  const location = S.txtLocation.trim();
  const users    = S.txtUsers.trim();
  const problem  = S.txtProblem.trim();
  const other    = S.txtOther.trim();
  const context  = [
    problem && `Design intent: ${problem}`,
    users   && `Target users: ${users}`,
    other   && `Additional notes: ${other}`,
  ].filter(Boolean).join('\n');

  return `The reference image shows a student-made handcraft model of a street furniture piece: ${S.txtFurniture.trim()}.

TASK: Create a photorealistic urban design visualization of this exact furniture at full human scale.

PRESERVE EXACTLY from the reference image:
- The furniture's complete shape, silhouette, proportions, and all structural elements
- Every distinctive design feature, curve, component, and visual character as shown in the photo
- Do NOT redesign, simplify, beautify, or alter ANY aspect of the furniture

CHANGE ONLY:
- Replace the background with a realistic ${location} outdoor environment
- Show the furniture as a real, full-scale installed street piece
- Add 2–3 people (${users || 'general public'}) naturally using and enjoying it
${context ? '\n' + context : ''}

Style: photorealistic architectural design proposal photograph, warm natural daylight, realistic shadows, wide-angle composition, professional urban photography.`;
}

function buildPromptTextOnly() {
  const location = S.txtLocation.trim();
  const problem  = S.txtProblem.trim();
  const users    = S.txtUsers.trim();
  const other    = S.txtOther.trim();
  const context  = [
    problem && `Design intent: ${problem}`,
    users   && `Target users: ${users}`,
    other   && `Additional notes: ${other}`,
  ].filter(Boolean).join('\n');

  return `Photorealistic urban design visualization photograph.

Street furniture design to reproduce exactly:
${S.txtFurniture.trim()}

Scene requirements:
- Location: ${location}
- Show the furniture at full human scale as a real installed piece in its environment
- Add 2–3 people (${users || 'general public'}) naturally using and interacting with it
- Preserve every described design detail faithfully — do not simplify or alter the furniture
${context ? '\n' + context : ''}

Style: professional architectural design proposal, warm natural daylight, realistic shadows, wide-angle composition. Photorealistic.`;
}

// ── gpt-image-2 ────────────────────────────────────────────────
function base64ToBlob(dataUrl, mimeType = 'image/jpeg') {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const bytes  = atob(base64);
  const buf    = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
  return new Blob([buf], { type: mimeType });
}

async function callGptImage2WithRef(prompt) {
  const fd = new FormData();
  fd.append('image',   base64ToBlob(S.imageBase64), 'model.jpg');
  fd.append('model',   'gpt-image-2');
  fd.append('prompt',  prompt);
  fd.append('n',       '1');
  fd.append('size',    '1536x1024');
  fd.append('quality', 'medium');

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}` },
    body:    fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `API error ${res.status}`);
  return data.data[0].b64_json;
}

async function callGptImage2(prompt) {
  const res = await openaiPost('images/generations', {
    model:   'gpt-image-2',
    prompt,
    n:       1,
    size:    '1536x1024',
    quality: 'medium',
  });
  return res.data[0].b64_json;
}

async function openaiPost(endpoint, body) {
  const res = await fetch(`https://api.openai.com/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `API error ${res.status}`);
  return data;
}

// ================================================================
// SCREEN 5 — RESULT
// ================================================================
function renderResult() {
  $('result-img').src = S.generatedImgUrl;

  const tagsEl = $('result-tags');
  tagsEl.innerHTML = '';
  [S.txtFurniture, S.txtLocation].forEach(txt => {
    if (!txt.trim()) return;
    const short = txt.trim().length > 20 ? txt.trim().slice(0, 20) + '…' : txt.trim();
    const t = document.createElement('span');
    t.className = 'rtag';
    t.textContent = short;
    tagsEl.appendChild(t);
  });

  // Reset video section for new generations
  $('result-video-col').classList.add('hidden');
  $('result-media').classList.remove('has-video');
  $('result-video-action').classList.remove('hidden');
  $('result-upload-row').classList.add('hidden');
  $('btn-dl-video').classList.add('hidden');

  showScreen('result');
}

function downloadImage() {
  if (!S.generatedImgUrl) return;
  const a = Object.assign(document.createElement('a'), {
    href:     S.generatedImgUrl,
    download: `街道家具設計_${Date.now()}.png`,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ================================================================
// VIDEO GENERATION (Veo 3.1)
// ================================================================
async function handleVideo() {
  if (!CONFIG?.GEMINI_API_KEY) {
    alert(
      '影片生成功能需要 Google Gemini API 金鑰。\n\n' +
      '請至 https://aistudio.google.com/apikey 申請後，\n' +
      '填入 config.js 的 GEMINI_API_KEY 欄位。\n\n' +
      '目前可先下載生成好的圖片使用。'
    );
    return;
  }
  if (!S.generatedImgUrl) { showError('請先生成圖片'); return; }

  showScreen('vgen');
  startProgressAnim();

  try {
    const videoUri = await generateVideoVeo();
    S.generatedVidUrl = videoUri;
    $('vprogress').style.width = '100%';
    await delay(300);

    const blobUrl = await fetchVideoAsBlob(videoUri);
    S.generatedVidBlobUrl = blobUrl;

    // Show video in result screen
    const src = $('result-video-src');
    src.src = blobUrl;
    $('result-video').load();

    $('result-video-col').classList.remove('hidden');
    $('result-media').classList.add('has-video');
    $('result-video-action').classList.add('hidden');
    $('result-upload-row').classList.remove('hidden');
    $('btn-dl-video').classList.remove('hidden');

    showScreen('result');
  } catch (err) {
    console.error('[video]', err);
    showScreen('result');
    showError(`影片生成失敗：${err.message}`);
  }
}

function startProgressAnim() {
  const bar = $('vprogress');
  bar.style.width = '0%';
  let pct = 0;
  const iv = setInterval(() => {
    pct += (90 - pct) * 0.025 + 0.2;
    if (pct >= 88) { clearInterval(iv); return; }
    bar.style.width = `${pct}%`;
  }, 2000);
}

async function generateVideoVeo() {
  const base64 = S.generatedImgUrl.includes(',')
    ? S.generatedImgUrl.split(',')[1]
    : S.generatedImgUrl;

  setVgenHint('正在提交影片生成任務…');
  const prompt  = buildVideoPrompt();
  const VEO_URL = 'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning';

  const res = await fetch(VEO_URL, {
    method: 'POST',
    headers: {
      'Content-Type':   'application/json',
      'x-goog-api-key': CONFIG.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      instances: [{
        prompt,
        image: {
          bytesBase64Encoded: base64,
          mimeType:           'image/png',
        },
      }],
      parameters: {
        aspectRatio:     '16:9',
        resolution:      '720p',
        durationSeconds: 8,
      },
    }),
  });

  const init = await res.json();
  if (!res.ok) throw new Error(init.error?.message || `Veo API error ${res.status}`);
  return await pollVeo(init.name);
}

function setVgenHint(msg) {
  const el = $('vgen-hint');
  if (el) el.textContent = msg;
}

function buildVideoPrompt() {
  const location = S.txtLocation.trim();
  return `Cinematic wide establishing shot. ${S.txtFurniture.trim() || 'A street furniture piece'} installed in ${location || 'an urban environment'}. Camera slowly pans across the scene. Pedestrians and passersby move naturally in the background, small in frame. Warm natural daylight, realistic outdoor setting, architectural visualization style, no close-up faces.`;
}

async function pollVeo(operationName) {
  const POLL_URL = `https://generativelanguage.googleapis.com/v1beta/${operationName}`;
  for (let i = 0; i < 40; i++) {
    await delay(10000);
    const res  = await fetch(POLL_URL, {
      headers: { 'x-goog-api-key': CONFIG.GEMINI_API_KEY },
    });
    const data = await res.json();
    setVgenHint(`Veo 生成中，已等待 ${(i + 1) * 10} 秒…`);
    if (data.done) {
      console.log('[Veo done]', JSON.stringify(data));
      const samples = data.response?.generateVideoResponse?.generatedSamples;
      const uri = samples?.[0]?.video?.uri;
      if (!uri) {
        // Safety filter: samples array exists but video is null/blocked
        if (Array.isArray(samples) && samples.length > 0 && !samples[0]?.video?.uri) {
          throw new Error('影片被 Veo 安全過濾器封鎖。請嘗試修改設計描述，或確認圖片中沒有人臉特寫。');
        }
        // Empty samples — generation failed silently
        throw new Error(`影片生成失敗（回應格式異常）。請開啟開發者工具查看 Console 中的 [Veo done] 訊息並回報。`);
      }
      return uri;
    }
    if (data.error) throw new Error(data.error.message || '影片生成失敗');
  }
  throw new Error('影片生成逾時（超過 6 分鐘），請稍後再試');
}

async function fetchVideoAsBlob(uri) {
  const sep = uri.includes('?') ? '&' : '?';
  const res = await fetch(`${uri}${sep}key=${CONFIG.GEMINI_API_KEY}`);
  if (!res.ok) throw new Error('無法下載影片');
  return URL.createObjectURL(await res.blob());
}

// ================================================================
// UPLOAD MODAL
// ================================================================
function setupUploadModal() {
  $('btn-upload-work').addEventListener('click', openUploadModal);
  $('btn-modal-cancel').addEventListener('click', closeUploadModal);
  $('upload-modal').addEventListener('click', e => {
    if (e.target === $('upload-modal')) closeUploadModal();
  });
  $('btn-modal-confirm').addEventListener('click', handleUpload);
  $('group-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleUpload();
  });
}

function openUploadModal() {
  $('modal-status').textContent = '';
  $('modal-upload-progress').classList.add('hidden');
  $('modal-progress-fill').style.width = '0%';
  $('btn-modal-confirm').disabled = false;
  $('btn-modal-cancel').textContent = '取消';
  $('upload-modal').classList.remove('hidden');
  setTimeout(() => $('group-name-input').focus(), 100);
}

function closeUploadModal() {
  $('upload-modal').classList.add('hidden');
}

async function handleUpload() {
  const rawName = $('group-name-input').value.trim();
  if (!rawName) {
    $('modal-status').textContent = '⚠️ 請輸入組別名稱';
    $('modal-status').style.color = 'var(--accent)';
    return;
  }
  if (!S.generatedImgUrl) {
    $('modal-status').textContent = '⚠️ 尚未生成圖片';
    $('modal-status').style.color = 'var(--accent)';
    return;
  }

  const groupName = rawName.replace(/[\/\\#?%&]/g, '_').substring(0, 30);
  const ts = Date.now();

  $('btn-modal-confirm').disabled = true;
  $('modal-upload-progress').classList.remove('hidden');
  $('modal-status').textContent = '正在上傳圖片…';
  $('modal-status').style.color = 'var(--text-sub)';
  setModalProgress(20);

  try {
    const imgBlob = base64ToBlob(S.generatedImgUrl, 'image/png');
    await uploadToStorage(`gallery/${groupName}/${ts}_image.png`, imgBlob, 'image/png');
    setModalProgress(60);

    if (S.generatedVidBlobUrl) {
      $('modal-status').textContent = '正在上傳影片（約 5–10 秒）…';
      const vidRes = await fetch(S.generatedVidBlobUrl);
      const vidBlob = await vidRes.blob();
      await uploadToStorage(`gallery/${groupName}/${ts}_video.mp4`, vidBlob, 'video/mp4');
    }

    setModalProgress(100);
    $('modal-status').textContent = '✅ 上傳成功！老師可以在展示牆看到你們的作品。';
    $('modal-status').style.color = 'var(--green)';
    $('btn-modal-cancel').textContent = '關閉';
    $('btn-modal-cancel').disabled = false;

  } catch (err) {
    console.error('[upload]', err);
    $('modal-status').textContent = `❌ 上傳失敗：${err.message}`;
    $('modal-status').style.color = 'var(--accent)';
    $('btn-modal-confirm').disabled = false;
    setModalProgress(0);
  }
}

function setModalProgress(pct) {
  $('modal-progress-fill').style.width = `${pct}%`;
}

async function uploadToStorage(path, blob, contentType) {
  const bucket = CONFIG.FIREBASE_BUCKET;
  const key    = CONFIG.FIREBASE_API_KEY;
  const encodedPath = encodeURIComponent(path);
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedPath}&key=${key}`;

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': contentType },
    body:    blob,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `上傳失敗 (${res.status})`);
  }
  return res.json();
}

// ================================================================
// RESET
// ================================================================
function resetApp() {
  S.imageBase64        = null;
  S.txtFurniture       = '';
  S.txtProblem         = '';
  S.txtLocation        = '';
  S.txtUsers           = '';
  S.txtOther           = '';
  S.generatedImgUrl    = null;
  S.generatedVidUrl    = null;
  if (S.generatedVidBlobUrl) {
    URL.revokeObjectURL(S.generatedVidBlobUrl);
    S.generatedVidBlobUrl = null;
  }

  $('preview-img').src = '';
  $('upload-placeholder').classList.remove('hidden');
  $('upload-preview').classList.add('hidden');
  $('upload-area').classList.remove('has-img');
  $('file-input').value = '';

  ['txt-furniture', 'txt-problem', 'txt-location', 'txt-users', 'txt-other']
    .forEach(id => { $(id).value = ''; });

  [1, 2, 3].forEach(n => setStep(n, 'waiting'));

  $('result-video-action').classList.remove('hidden');
  $('result-upload-row').classList.add('hidden');
  $('btn-dl-video').classList.add('hidden');

  showScreen('upload');
}

// ================================================================
// UTILITIES
// ================================================================
const delay = ms => new Promise(r => setTimeout(r, ms));

function friendlyError(err) {
  const msg = err.message || '';
  if (msg.includes('content_policy') || msg.includes('safety'))
    return '圖片內容不符合 AI 安全政策，請嘗試修改描述後重試';
  if (msg.includes('insufficient_quota') || msg.includes('exceeded'))
    return 'OpenAI API 額度不足，請確認帳號餘額';
  if (msg.includes('invalid_api_key'))
    return 'OpenAI API 金鑰無效，請確認 config.js 中的設定';
  if (msg.includes('rate_limit'))
    return '請求過於頻繁，請稍候 30 秒後再試';
  if (msg.includes('Failed to fetch') || msg.includes('network'))
    return '網路連線失敗，請確認裝置已連上網路';
  return `生成失敗：${msg}`;
}

// ================================================================
// INIT
// ================================================================
function init() {
  setupUpload();
  setupDetails();
  setupUploadModal();

  $('btn-download').addEventListener('click', downloadImage);

  $('btn-regen').addEventListener('click', async () => {
    [1, 2, 3].forEach(n => setStep(n, 'waiting'));
    showScreen('generating');
    try {
      await runGeneration();
    } catch (err) {
      showScreen('result');
      showError(friendlyError(err));
    }
  });

  $('btn-gen-video').addEventListener('click', handleVideo);

  $('btn-dl-video').addEventListener('click', async () => {
    if (!S.generatedVidBlobUrl) return;
    const a = Object.assign(document.createElement('a'), {
      href:     S.generatedVidBlobUrl,
      download: `街道家具影片_${Date.now()}.mp4`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  $('btn-new').addEventListener('click', resetApp);

  $('toast-close').addEventListener('click', () => $('toast').classList.add('hidden'));
}

document.addEventListener('DOMContentLoaded', init);
