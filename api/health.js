const { setCorsHeaders } = require('./_helpers');
module.exports = (req, res) => { setCorsHeaders(res, req); res.status(200).json({ status: 'ok' }); };
