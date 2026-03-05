const { sessionStore, setCorsHeaders } = require('./_helpers');

module.exports = async function handler(req, res) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sessionId = req.cookies && req.cookies.bb_session;
  if (sessionId) sessionStore.delete(sessionId);
  res.setHeader('Set-Cookie', 'bb_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  return res.status(200).json({ success: true });
};
