# Blackboard File Downloader

Download all files from your university Blackboard modules — bulk ZIP downloads with format filtering. Hosted entirely on GitHub Pages + Vercel (both free).

## Architecture

```
GitHub Pages (free)          Vercel (free)
────────────────────         ──────────────────────
docs/index.html   ←──────── api/login.js
docs/style.css    fetch()    api/courses.js
docs/app.js                  api/contents.js
                             api/download.js
                             api/logout.js
```

- **Frontend**: Pure HTML/CSS/JS — deployed to GitHub Pages automatically via GitHub Actions on every push to `main`
- **Backend proxy**: Node.js serverless functions on Vercel — handles Blackboard authentication and file proxying (needed because Blackboard blocks cross-origin browser requests)

---

## Deploy in 3 steps

### Step 1 — Fork & enable GitHub Pages

1. **Fork this repo** to your GitHub account
2. Go to your fork → **Settings → Pages**
3. Set Source to **GitHub Actions**
4. On the next push to `main`, GitHub Actions will deploy `docs/` to `https://YOUR_USERNAME.github.io/M1/`

### Step 2 — Deploy the backend to Vercel

Click the button below to deploy the backend proxy with one click (free Vercel account required):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FNubles%2FM1&env=SESSION_SECRET&envDescription=A+random+secret+string+for+session+security&project-name=blackboard-downloader&repository-name=blackboard-downloader)

- When prompted, set `SESSION_SECRET` to any random string (e.g. `my-super-secret-123`)
- After deployment, copy your Vercel URL (e.g. `https://blackboard-downloader.vercel.app`)

### Step 3 — Connect them

1. Open your GitHub Pages URL
2. Click the **⚙ gear icon** in the top-right corner
3. Paste your Vercel URL and click **Save**
4. Log in with your Blackboard credentials

---

## Local development

```bash
git clone https://github.com/YOUR_USERNAME/M1.git
cd M1
npm install
cp .env.example .env   # set SESSION_SECRET
npm start              # starts Express at http://localhost:3000
```

Then open `http://localhost:3000` (uses the `public/` folder).
Or open `docs/index.html` in your browser and set backend URL to `http://localhost:3000` via the ⚙ settings.

---

## Features

- Browse all enrolled modules
- View all attached files per module
- **Format filter** — choose which file types to include: PDF, DOCX, PPTX, XLSX, MP4, ZIP, etc.
- **Bulk ZIP download** of any selection of files
- **Individual download** button on each file
- Search/filter by filename within a module
- Works with Blackboard REST API (modern instances) and HTML scraping fallback (legacy instances)

---

## File structure

```
├── .github/workflows/deploy.yml   GitHub Actions → GitHub Pages
├── api/                           Vercel serverless functions (backend proxy)
│   ├── _helpers.js
│   ├── login.js
│   ├── courses.js
│   ├── contents.js
│   ├── download.js
│   ├── logout.js
│   └── health.js
├── docs/                          GitHub Pages static frontend
│   ├── index.html
│   ├── style.css
│   └── app.js
├── public/                        Local dev frontend (Express serves this)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── server.js                      Express server (local dev / self-hosting)
├── vercel.json                    Vercel routing config
└── package.json
```

---

## Security notes

- Credentials are used only to authenticate with Blackboard — never stored permanently
- Sessions are in-memory and expire on Vercel function restarts (cold starts)
- Use a strong random value for `SESSION_SECRET`
- Vercel provides HTTPS automatically

---

## License

MIT
