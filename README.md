# 街道家具設計視覺化 (Street Furniture Design Visualizer)

A classroom web app for students to upload photos of their handmade street furniture models and use AI to generate photorealistic visualizations of the design placed in a real urban environment. Teachers can view all submissions on a shared gallery page.

---

## Features

### Student App (`/index.html`)

| Step | Description |
|------|-------------|
| 1 · Upload Photo | Take a photo or upload an image of the physical model (JPG, PNG, HEIC) |
| 2 · Fill In Details | Describe the furniture, design intent, target location, users, and any other notes |
| 3 · Generate Image | Uses **gpt-image-2** (`/v1/images/edits`) to produce a photorealistic context image that preserves the model's exact appearance |
| 4 · Generate Video | Uses **Google Veo 3.1** to animate the image into an 8-second scene video (~30 s – 6 min) |
| 5 · Upload to Gallery | Enter group name → image + video are uploaded to **Firebase Storage** |

- Works entirely in the browser — no backend required
- Tablet-optimised UI (touch-friendly, 18 px base font, 58 px+ buttons)
- Supports drag-and-drop photo upload
- Download image and video locally at any time

### Teacher Gallery (`/gallery.html`)

- Auto-loads all group submissions from Firebase Storage
- Cards grouped by group name, sorted newest-first
- Click any image or video to open full-screen lightbox (Escape / click to close)
- **Delete button** on each card to remove test data
- Refresh button to check for new submissions

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Hosting | Firebase Hosting |
| Storage | Firebase Storage (REST API, no SDK) |
| Image generation | OpenAI gpt-image-2 |
| Video generation | Google Veo 3.1 (via Gemini API) |
| Frontend | Vanilla JS + CSS (no build step) |

---

## Project Structure

```
public/
  index.html      # Student wizard app
  app.js          # All client-side logic
  styles.css      # Tablet-first stylesheet
  config.js       # API keys (fill in before use)
  gallery.html    # Teacher gallery page
firebase.json     # Firebase Hosting + Storage config
.firebaserc       # Firebase project alias
storage.rules     # Firebase Storage security rules
```

---

## Setup & Deployment

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`

### 2. API Keys

Edit `public/config.js` and fill in your keys:

```js
const CONFIG = {
  // Required — OpenAI (image generation)
  OPENAI_API_KEY: "sk-...",

  // Optional — Google Gemini (video generation)
  // Get from https://aistudio.google.com/apikey
  GEMINI_API_KEY: "AIza...",

  // Firebase (auto-filled if you use this repo's project)
  FIREBASE_API_KEY:  "AIza...",
  FIREBASE_BUCKET:   "your-project.firebasestorage.app",
};
```

### 3. Firebase Project

Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com), then update `.firebaserc`:

```json
{ "projects": { "default": "your-project-id" } }
```

Enable **Firebase Storage** in the console (Storage → Get started).

### 4. Deploy

```bash
firebase login
firebase deploy
```

This deploys:
- **Hosting** — serves the `public/` folder
- **Storage rules** — opens read/write on the `gallery/` prefix for unauthenticated users

After deployment you'll see:
```
Hosting URL: https://your-project.web.app
```

| URL | Audience |
|-----|----------|
| `https://your-project.web.app` | Students |
| `https://your-project.web.app/gallery.html` | Teacher |

---

## Firebase Storage Rules

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /gallery/{allPaths=**} {
      allow read:  if true;
      allow write: if true;
    }
  }
}
```

Only the `gallery/` prefix is open; all other paths remain locked.

---

## Notes for Classroom Use

- Students do **not** need accounts — everything is anonymous
- Each upload is stored as:  
  `gallery/{groupName}/{timestamp}_image.png`  
  `gallery/{groupName}/{timestamp}_video.mp4`
- Video generation is optional; students can upload image-only
- The gallery page auto-groups submissions by group name
