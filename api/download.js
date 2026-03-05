const archiver = require('archiver');
const { sessionStore, setCorsHeaders } = require('./_helpers');

function getExt(filename, mimeType) {
  if (filename && filename.includes('.')) return filename.split('.').pop().toLowerCase();
  const m = { 'application/pdf':'pdf','application/msword':'doc','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx','application/vnd.ms-powerpoint':'ppt','application/vnd.openxmlformats-officedocument.presentationml.presentation':'pptx','application/vnd.ms-excel':'xls','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx','text/plain':'txt','application/zip':'zip','video/mp4':'mp4','audio/mpeg':'mp3' };
  return m[mimeType] || 'bin';
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sessionId = req.cookies && req.cookies.bb_session;
  if (!sessionId || !sessionStore.has(sessionId)) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { client } = sessionStore.get(sessionId);

  // Single file download
  if (req.method === 'GET') {
    const { url, filename } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url' });
    try {
      const fileRes = await client.get(url, { responseType: 'stream' });
      const ct = fileRes.headers['content-type'] || 'application/octet-stream';
      const cd = fileRes.headers['content-disposition'] || '';
      let name = filename || 'download';
      const m = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (m) name = m[1].replace(/['"]/g, '');
      res.setHeader('Content-Type', ct);
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      fileRes.data.pipe(res);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
    return;
  }

  // ZIP download
  if (req.method === 'POST') {
    const { files, formats, zipName } = req.body || {};
    if (!files || !Array.isArray(files) || !files.length) {
      return res.status(400).json({ error: 'No files provided' });
    }

    let filtered = files;
    if (formats && formats.length > 0) {
      filtered = files.filter(f => formats.map(x => x.toLowerCase()).includes(getExt(f.name, f.mimeType)));
    }
    if (!filtered.length) return res.status(400).json({ error: 'No files match selected formats' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${(zipName||'blackboard_files').replace(/[^a-z0-9_]/gi,'_')}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => console.error('Archive error:', err));
    archive.pipe(res);

    for (const file of filtered) {
      try {
        const r = await client.get(file.downloadUrl, { responseType: 'stream', timeout: 60000 });
        const cd = r.headers['content-disposition'] || '';
        let name = file.name || 'file';
        const m = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (m) name = m[1].replace(/['"]/g, '');
        const folder = (file.folder||'files').replace(/[/\\?%*:|"<>]/g,'_');
        archive.append(r.data, { name: `${folder}/${name}` });
      } catch (e) {
        console.error(`Skip ${file.name}:`, e.message);
      }
    }

    await archive.finalize();
    return;
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
