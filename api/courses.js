const cheerio = require('cheerio');
const { sessionStore, setCorsHeaders } = require('./_helpers');

async function scrapeCoursesFromPage(client, baseUrl) {
  const courses = [];
  const pages = [`${baseUrl}/webapps/portal/frameset.jsp`, `${baseUrl}/ultra/stream`];
  for (const pageUrl of pages) {
    try {
      const res = await client.get(pageUrl);
      const $ = cheerio.load(res.data);
      $('a[href*="courseId="], a[href*="/courses/"], a[href*="course_id="]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const name = $(el).text().trim();
        const m = href.match(/courseId=([^&]+)/) || href.match(/course_id=([^&]+)/);
        if (m && name && name.length > 1) {
          const id = m[1];
          if (!courses.find(c => c.id === id)) {
            courses.push({ id, name, courseId: id });
          }
        }
      });
      if (courses.length > 0) break;
    } catch (e) { /* continue */ }
  }
  return courses;
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sessionId = req.cookies && req.cookies.bb_session;
  if (!sessionId || !sessionStore.has(sessionId)) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { client, baseUrl } = sessionStore.get(sessionId);

  try {
    let courses = [];
    try {
      const r = await client.get(`${baseUrl}/learn/api/public/v1/users/me/courses`, {
        params: { limit: 200, fields: 'id,courseId,name,displayName,course.name,course.courseId,course.displayName' }
      });
      courses = (r.data.results || []).map(c => ({
        id: c.courseId || c.id,
        name: c.course?.name || c.course?.displayName || c.name || c.displayName || c.id,
        courseId: c.course?.courseId || c.courseId
      }));
    } catch (e) {
      courses = await scrapeCoursesFromPage(client, baseUrl);
    }
    return res.status(200).json({ courses });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
