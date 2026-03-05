const cheerio = require('cheerio');
const { createClient, normalizeUrl, sessionStore, setCorsHeaders, CookieJar } = require('./_helpers');

module.exports = async function handler(req, res) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { bbUrl, username, password } = req.body || {};
  if (!bbUrl || !username || !password) {
    return res.status(400).json({ error: 'Missing bbUrl, username or password' });
  }

  const baseUrl = normalizeUrl(bbUrl);
  const jar = new CookieJar();
  const client = createClient(jar, baseUrl);

  try {
    // Load login page
    let loginPageRes;
    try {
      loginPageRes = await client.get(`${baseUrl}/webapps/login/`);
    } catch (e) {
      return res.status(502).json({ error: `Cannot reach Blackboard at ${baseUrl}. Please check the URL.` });
    }

    const $ = cheerio.load(loginPageRes.data);
    const formAction = $('form[name="login"]').attr('action') || '/webapps/login/';
    const hiddenFields = {};
    $('form[name="login"] input[type="hidden"]').each((_, el) => {
      hiddenFields[$(el).attr('name')] = $(el).attr('value') || '';
    });

    const formData = new URLSearchParams({
      user_id: username,
      password,
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

    if (loginRes.data && loginRes.data.includes('loginErrorMessage')) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Store session
    const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStore.set(sessionId, { client, jar, baseUrl });

    // Clean up old sessions (keep max 100)
    if (sessionStore.size > 100) {
      const first = sessionStore.keys().next().value;
      sessionStore.delete(first);
    }

    res.setHeader('Set-Cookie', `bb_session=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure`);
    return res.status(200).json({ success: true, sessionId });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: err.message || 'Login failed' });
  }
};
