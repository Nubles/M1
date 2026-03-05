# Blackboard File Downloader

A web app that connects to your university's Blackboard LMS and lets you browse and bulk-download files from all your modules, with format filtering.

## Features

- **Authenticate** with any Blackboard instance using your university credentials
- **Browse all modules** you are enrolled in
- **Download all files** from a module as a single ZIP
- **Format filter** — choose exactly which file types to include (PDF, DOCX, PPTX, XLSX, MP4, ZIP, etc.)
- **Individual downloads** — download any single file directly
- **Search** — filter files by name within a module
- Supports both the **Blackboard REST API** and falls back to **web scraping** for older instances

## Quick Start

### Prerequisites
- Node.js 18 or higher
- Access to a Blackboard LMS instance

### Installation

```bash
git clone https://github.com/your-username/blackboard-file-downloader.git
cd blackboard-file-downloader

npm install

cp .env.example .env
# Edit .env and set SESSION_SECRET to a random string

npm start
```

Open http://localhost:3000 in your browser.

### Deploy to Railway / Render / Fly.io

1. Push this repo to GitHub
2. Connect your GitHub repo to Railway, Render, or Fly.io
3. Set the `SESSION_SECRET` environment variable
4. Deploy — the `npm start` command will be detected automatically

### Deploy to Heroku

```bash
heroku create
heroku config:set SESSION_SECRET=your-random-secret
git push heroku main
```

## Usage

1. Enter your university's Blackboard URL (e.g. `https://blackboard.university.ac.uk`)
2. Log in with your student credentials
3. Your modules will appear in the sidebar
4. Click a module to load its files
5. Use **Format Filter** to select which file types you want
6. Check the files you want and click **Download ZIP**

## How It Works

The app runs a Node.js/Express server that:
1. Authenticates with Blackboard on your behalf (your credentials stay on the server only for the duration of your session)
2. Tries the official **Blackboard REST API** (`/learn/api/public/v1/...`) to enumerate courses and attachments
3. Falls back to **HTML scraping** for Blackboard instances that don't expose the REST API
4. Streams files to your browser packaged in a ZIP archive

## Security Notes

- Credentials are used only to authenticate with Blackboard and are **not stored** after your session ends
- Use a strong, random `SESSION_SECRET` in production
- Run behind HTTPS in production (use a reverse proxy like nginx or a platform that provides TLS)
- This app is for personal use with your own account only

## Supported File Types

PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, ZIP, MP4, MP3, TXT, PNG, JPG, GIF, CSV, and any other files attached to Blackboard content items.

## License

MIT
