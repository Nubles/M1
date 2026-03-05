// Shared helpers for Vercel serverless functions
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const https = require('https');

// In-memory session store (per Vercel function instance)
// For production with multiple instances, swap for Redis/KV
const sessionStore = new Map();

function createClient(cookieJar, baseUrl) {
  const agent = new https.Agent({ rejectUnauthorized: false });
  return wrapper(axios.create({
    jar: cookieJar,
    withCredentials: true,
    httpsAgent: agent,
    baseURL: baseUrl,
    timeout: 30000,
    maxRedirects: 10,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    }
  }));
}

function normalizeUrl(url) {
  if (!url) return '';
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  return url.replace(/\/$/, '');
}

function getSessionId(req) {
  return req.cookies && req.cookies.bb_session;
}

function setCorsHeaders(res, req) {
  const origin = (req.headers.origin || '').replace(/\/$/, '');
  // Allow any GitHub Pages origin or localhost
  if (origin.includes('github.io') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');
}

module.exports = { createClient, normalizeUrl, sessionStore, getSessionId, setCorsHeaders, CookieJar };
