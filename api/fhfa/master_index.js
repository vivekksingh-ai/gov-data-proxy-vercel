// api/fhfa/master_index.js
const fetch = require('node-fetch');

const FHFA_BASE = "https://www.fhfa.gov";
const PROXY_SECRET = process.env.PROXY_SECRET || "";

async function forwardGET(res, url){
  try {
    const r = await fetch(url, { method: 'GET' });
    const contentType = r.headers.get('content-type') || 'application/xml';
    const body = await r.buffer();
    res.status(r.status).setHeader('content-type', contentType);
    return res.end(body);
  } catch (err) {
    console.error('FHFA forward error', err && err.message);
    return res.status(502).json({ error:'upstream_error', message: err.message });
  }
}

module.exports = async (req, res) => {
  try {
    if (process.env.PROXY_SECRET) {
      const token = req.headers['x-proxy-auth'];
      if (!token || token !== process.env.PROXY_SECRET) return res.status(401).json({ error: 'missing_or_invalid_proxy_auth' });
    }
    const url = `${FHFA_BASE}/hpi/download/monthly/hpi_master.xml`;
    return forwardGET(res, url);
  } catch (err) {
    console.error('fhfa/master internal error', err && err.stack);
    return res.status(500).json({ error: 'internal_error', message: err && err.message });
  }
};
