require('dotenv').config();
const express = require('express');
const axios = require('axios');
const archiver = require('archiver');
const cheerio = require('cheerio');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const https = require('https');
const path = require('path');
const stream = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow requests from GitHub Pages and localhost
app.use((req, res, next) => {
  const origin = (req.headers.origin || '').replace(/\/$/, '');
  if (origin.includes('github.io') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'blackboard-downloader-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createClient(cookieJar, bbUrl) {
  const httpsAgent = new https.Agent({ rejectUnauthorized: false });
  const client = wrapper(axios.create({
    jar: cookieJar,
    withCredentials: true,
    httpsAgent,
    baseURL: bbUrl,
    timeout: 30000,
    maxRedirects: 10,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    }
  }));
  return client;
}

function normalizeUrl(url) {
  if (!url) return '';
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  return url.replace(/\/$/, '');
}

function getFileExtension(filename, contentType) {
  if (filename && filename.includes('.')) {
    return filename.split('.').pop().toLowerCase();
  }
  const mimeMap = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'application/zip': 'zip',
    'text/html': 'html',
  };
  return mimeMap[contentType] || 'bin';
}

// ─── Session store for BB clients ───────────────────────────────────────────
const clientStore = new Map();

// ─── Routes ─────────────────────────────────────────────────────────────────

// Login to Blackboard
app.post('/api/login', async (req, res) => {
  const { bbUrl, username, password } = req.body;
  if (!bbUrl || !username || !password) {
    return res.status(400).json({ error: 'Missing bbUrl, username or password' });
  }

  const baseUrl = normalizeUrl(bbUrl);
  const jar = new CookieJar();
  const client = createClient(jar, baseUrl);

  try {
    // Step 1: Load login page to get tokens/cookies
    const loginPageUrl = `${baseUrl}/webapps/login/`;
    let loginPageRes;
    try {
      loginPageRes = await client.get(loginPageUrl);
    } catch (e) {
      const reason = e.code || (e.response ? `HTTP ${e.response.status}` : e.message);
      return res.status(502).json({ error: `Cannot reach Blackboard at ${baseUrl} (${reason}). Check the URL or try again.` });
    }

    const $ = cheerio.load(loginPageRes.data);
    const formAction = $('form[name="login"]').attr('action') || '/webapps/login/';
    const hiddenFields = {};
    $('form[name="login"] input[type="hidden"]').each((_, el) => {
      hiddenFields[$(el).attr('name')] = $(el).attr('value') || '';
    });

    // Step 2: POST credentials
    const formData = new URLSearchParams({
      user_id: username,
      password: password,
      login: 'Login',
      action: 'login',
      new_loc: '',
      ...hiddenFields
    });

    const loginRes = await client.post(
      formAction.startsWith('http') ? formAction : `${baseUrl}${formAction}`,
      formData.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    // Verify login success by checking final URL or page content
    const finalUrl = loginRes.request?.res?.responseUrl || loginRes.config?.url || '';
    const pageContent = loginPageRes.data || '';

    if (finalUrl.includes('/webapps/login/') && loginRes.data.includes('loginErrorMessage')) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Store client for session
    const sessionId = `${username}_${Date.now()}`;
    clientStore.set(sessionId, { client, jar, baseUrl });
    req.session.bbSession = sessionId;
    req.session.bbUrl = baseUrl;

    res.json({ success: true, message: 'Logged in successfully' });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});

// Get all courses/modules
app.get('/api/courses', async (req, res) => {
  const sessionId = req.session.bbSession;
  if (!sessionId || !clientStore.has(sessionId)) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { client, baseUrl } = clientStore.get(sessionId);

  try {
    // Try REST API first
    let courses = [];
    try {
      const restRes = await client.get(`${baseUrl}/learn/api/public/v1/users/me/courses`, {
        params: { limit: 200, fields: 'id,courseId,name,displayName,course.name,course.courseId,course.displayName' }
      });
      courses = (restRes.data.results || []).map(c => ({
        id: c.courseId || c.id,
        name: c.course?.name || c.course?.displayName || c.name || c.displayName || c.id,
        courseId: c.course?.courseId || c.courseId
      }));
    } catch (e) {
      // Fallback: scrape the my courses page
      courses = await scrapeCoursesFromPage(client, baseUrl);
    }

    res.json({ courses });
  } catch (err) {
    console.error('Courses error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function scrapeCoursesFromPage(client, baseUrl) {
  const courses = [];
  try {
    // Try the main portal page
    const pages = [
      `${baseUrl}/webapps/portal/frameset.jsp`,
      `${baseUrl}/ultra/stream`,
      `${baseUrl}/webapps/blackboard/execute/editUser?operation=load`
    ];

    for (const pageUrl of pages) {
      try {
        const res = await client.get(pageUrl);
        const $ = cheerio.load(res.data);
        // Look for course links
        $('a[href*="courseId="], a[href*="/courses/"], a[href*="course_id="]').each((_, el) => {
          const href = $(el).attr('href') || '';
          const name = $(el).text().trim();
          const idMatch = href.match(/courseId=([^&]+)/) || href.match(/course_id=([^&]+)/);
          if (idMatch && name && name.length > 1) {
            const courseId = idMatch[1];
            if (!courses.find(c => c.id === courseId)) {
              courses.push({ id: courseId, name, courseId, url: href.startsWith('http') ? href : `${baseUrl}${href}` });
            }
          }
        });
        if (courses.length > 0) break;
      } catch (e) { /* continue */ }
    }
  } catch (e) {
    console.error('Scrape courses error:', e.message);
  }
  return courses;
}

// Get content tree for a course
app.get('/api/courses/:courseId/contents', async (req, res) => {
  const sessionId = req.session.bbSession;
  if (!sessionId || !clientStore.has(sessionId)) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { client, baseUrl } = clientStore.get(sessionId);
  const { courseId } = req.params;

  try {
    let files = [];

    // Try REST API
    try {
      files = await getFilesViaRestApi(client, baseUrl, courseId);
    } catch (e) {
      // Fallback to scraping
      files = await getFilesViaScraping(client, baseUrl, courseId);
    }

    res.json({ files });
  } catch (err) {
    console.error('Contents error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function getFilesViaRestApi(client, baseUrl, courseId) {
  const files = [];

  async function fetchContents(contentId) {
    const url = contentId
      ? `${baseUrl}/learn/api/public/v1/courses/${courseId}/contents/${contentId}/children`
      : `${baseUrl}/learn/api/public/v1/courses/${courseId}/contents`;

    const res = await client.get(url, { params: { limit: 200 } });
    const items = res.data.results || [];

    for (const item of items) {
      if (item.contentHandler?.id === 'resource/x-bb-file' || item.contentHandler?.id === 'resource/x-bb-document') {
        // Get attachments
        try {
          const attRes = await client.get(`${baseUrl}/learn/api/public/v1/courses/${courseId}/contents/${item.id}/attachments`);
          for (const att of (attRes.data.results || [])) {
            files.push({
              id: att.id,
              name: att.fileName || att.displayName || item.title,
              title: item.title,
              folder: item.parentId || 'root',
              downloadUrl: `${baseUrl}/learn/api/public/v1/courses/${courseId}/contents/${item.id}/attachments/${att.id}/download`,
              mimeType: att.mimeType || '',
              size: att.size || 0
            });
          }
        } catch (e) { /* no attachments */ }
      } else if (item.hasChildren) {
        await fetchContents(item.id);
      }
    }
  }

  await fetchContents(null);
  return files;
}

async function getFilesViaScraping(client, baseUrl, courseId) {
  const files = [];
  const visited = new Set();

  async function scrapePage(url, folderName) {
    if (visited.has(url)) return;
    visited.add(url);

    try {
      const res = await client.get(url);
      const $ = cheerio.load(res.data);

      // Find downloadable file links
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();

        // Direct file links
        if (href.match(/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|zip|mp4|mp3|txt|png|jpg|gif|csv)(\?|$)/i)) {
          const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
          const filename = text || href.split('/').pop().split('?')[0];
          if (!files.find(f => f.downloadUrl === fullUrl)) {
            files.push({
              id: fullUrl,
              name: filename,
              title: text || filename,
              folder: folderName,
              downloadUrl: fullUrl,
              mimeType: '',
              size: 0
            });
          }
        }

        // Blackboard content viewer links
        if (href.includes('/bbcswebdav/') || href.includes('/xid-')) {
          const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
          const filename = text || href.split('/').pop().split('?')[0];
          if (filename && !files.find(f => f.downloadUrl === fullUrl)) {
            files.push({
              id: fullUrl,
              name: filename,
              title: text || filename,
              folder: folderName,
              downloadUrl: fullUrl,
              mimeType: '',
              size: 0
            });
          }
        }
      });

      // Find sub-folders/content areas
      const subLinks = [];
      $('a[href*="content_id="], a[href*="contentId="]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
        if (!visited.has(fullUrl) && text) {
          subLinks.push({ url: fullUrl, folder: text });
        }
      });

      for (const sub of subLinks.slice(0, 20)) {
        await scrapePage(sub.url, sub.folder);
      }
    } catch (e) {
      console.error('Scrape page error:', e.message);
    }
  }

  const startUrl = `${baseUrl}/webapps/blackboard/content/listContent.jsp?course_id=${courseId}`;
  await scrapePage(startUrl, 'Root');

  return files;
}

// Download a single file
app.get('/api/download/file', async (req, res) => {
  const sessionId = req.session.bbSession;
  if (!sessionId || !clientStore.has(sessionId)) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { client } = clientStore.get(sessionId);
  const { url, filename } = req.query;

  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    const fileRes = await client.get(url, { responseType: 'stream' });
    const contentType = fileRes.headers['content-type'] || 'application/octet-stream';
    const contentDisposition = fileRes.headers['content-disposition'] || '';

    let finalName = filename || 'download';
    const cdMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (cdMatch) finalName = cdMatch[1].replace(/['"]/g, '');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${finalName}"`);
    fileRes.data.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download multiple files as ZIP
app.post('/api/download/zip', async (req, res) => {
  const sessionId = req.session.bbSession;
  if (!sessionId || !clientStore.has(sessionId)) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { client } = clientStore.get(sessionId);
  const { files, formats, zipName } = req.body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }

  // Filter by formats if specified
  let filteredFiles = files;
  if (formats && formats.length > 0) {
    filteredFiles = files.filter(f => {
      const ext = getFileExtension(f.name, f.mimeType);
      return formats.map(x => x.toLowerCase()).includes(ext.toLowerCase());
    });
  }

  if (filteredFiles.length === 0) {
    return res.status(400).json({ error: 'No files match the selected formats' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName || 'blackboard_files'}.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', err => { console.error('Archive error:', err); });
  archive.pipe(res);

  for (const file of filteredFiles) {
    try {
      const fileRes = await client.get(file.downloadUrl, { responseType: 'stream', timeout: 60000 });
      const contentDisposition = fileRes.headers['content-disposition'] || '';
      let fileName = file.name || 'file';
      const cdMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (cdMatch) fileName = cdMatch[1].replace(/['"]/g, '');

      const folder = (file.folder || 'files').replace(/[/\\?%*:|"<>]/g, '_');
      archive.append(fileRes.data, { name: `${folder}/${fileName}` });
    } catch (e) {
      console.error(`Failed to add ${file.name}:`, e.message);
    }
  }

  await archive.finalize();
});

// Logout
app.post('/api/logout', (req, res) => {
  const sessionId = req.session.bbSession;
  if (sessionId) clientStore.delete(sessionId);
  req.session.destroy();
  res.json({ success: true });
});

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Blackboard Downloader running on http://localhost:${PORT}`));
