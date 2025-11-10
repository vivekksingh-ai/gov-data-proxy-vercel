// api/fhfa/download.js
// Proxy to download a specific FHFA file: /api/fhfa/download?file=<path>
const fetch = require('node-fetch');
const { URLSearchParams } = require('url');

const FHFA_BASE = "https://www.fhfa.gov";
const PROXY_SECRET = process.env.PROXY_SECRET || "";

async function readJsonBody(req) {
  if (req.body && Object.keys(req.body||{}).length) return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch(e) {
    const sp = new URLSearchParams(raw);
    const out = {};
    for (const [k,v] of sp.entries()) out[k]=v;
    return out;
  }
}
async function forwardGET(res, url){
  try {
    const r = await fetch(url, { method: 'GET' });
    const contentType = r.headers.get('content-type') || 'application/octet-stream';
    const body = await r.buffer();
    res.status(r.status).setHeader('content-type', contentType);
    return res.end(body);
  } catch (err) {
    console.error('FHFA download forward error', err && err.message);
    return res.status(502).json({ error:'upstream_error', message: err.message });
  }
}
module.exports = async (req, res) => {
  try {
    const query = Object.assign({}, req.query || {});
    const body = await readJsonBody(req);
    const params = Object.assign({}, query, body);

    if (PROXY_SECRET) {
      const token = req.headers['x-proxy-auth'];
      if (!token || token !== PROXY_SECRET) return res.status(401).json({ error: 'missing_or_invalid_proxy_auth' });
    }

    const file = params.file;
    if (!file) return res.status(400).json({ error: 'file_param_required' });

    const url = `${FHFA_BASE}/hpi/download/${encodeURIComponent(file)}`;
    return forwardGET(res, url);
  } catch (err) {
    console.error('fhfa/download internal error', err && err.stack);
    return res.status(500).json({ error: 'internal_error', message: err && err.message });
  }
};
