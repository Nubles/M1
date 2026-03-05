const cheerio = require('cheerio');
const { sessionStore, setCorsHeaders } = require('./_helpers');

async function getFilesViaRestApi(client, baseUrl, courseId) {
  const files = [];
  async function fetchContents(parentId) {
    const url = parentId
      ? `${baseUrl}/learn/api/public/v1/courses/${courseId}/contents/${parentId}/children`
      : `${baseUrl}/learn/api/public/v1/courses/${courseId}/contents`;
    const res = await client.get(url, { params: { limit: 200 } });
    for (const item of (res.data.results || [])) {
      if (['resource/x-bb-file','resource/x-bb-document'].includes(item.contentHandler?.id)) {
        try {
          const attRes = await client.get(`${baseUrl}/learn/api/public/v1/courses/${courseId}/contents/${item.id}/attachments`);
          for (const att of (attRes.data.results || [])) {
            files.push({
              id: att.id,
              name: att.fileName || att.displayName || item.title,
              title: item.title,
              folder: item.parentId || 'Root',
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
    if (visited.has(url) || visited.size > 50) return;
    visited.add(url);
    try {
      const res = await client.get(url);
      const $ = cheerio.load(res.data);

      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        if (href.match(/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|zip|mp4|mp3|txt|png|jpg|gif|csv)(\?|$)/i) ||
            href.includes('/bbcswebdav/') || href.includes('/xid-')) {
          const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
          const filename = text || href.split('/').pop().split('?')[0];
          if (filename && !files.find(f => f.downloadUrl === fullUrl)) {
            files.push({ id: fullUrl, name: filename, title: text || filename, folder: folderName, downloadUrl: fullUrl, mimeType: '', size: 0 });
          }
        }
      });

      const subLinks = [];
      $('a[href*="content_id="], a[href*="contentId="]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
        if (!visited.has(fullUrl) && text) subLinks.push({ url: fullUrl, folder: text });
      });

      for (const sub of subLinks.slice(0, 15)) await scrapePage(sub.url, sub.folder);
    } catch (e) { /* continue */ }
  }

  await scrapePage(`${baseUrl}/webapps/blackboard/content/listContent.jsp?course_id=${courseId}`, 'Root');
  return files;
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sessionId = req.cookies && req.cookies.bb_session;
  if (!sessionId || !sessionStore.has(sessionId)) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { client, baseUrl } = sessionStore.get(sessionId);
  // courseId comes from the query param since Vercel functions don't support path params natively
  const courseId = req.query.courseId;
  if (!courseId) return res.status(400).json({ error: 'Missing courseId' });

  try {
    let files = [];
    try { files = await getFilesViaRestApi(client, baseUrl, courseId); }
    catch (e) { files = await getFilesViaScraping(client, baseUrl, courseId); }
    return res.status(200).json({ files });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
