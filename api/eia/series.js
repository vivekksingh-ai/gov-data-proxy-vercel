// api/eia/series.js
// Proxy to EIA series endpoint: /api/eia/series
const fetch = require('node-fetch');
const { URLSearchParams } = require('url');

const EIA_BASE = "https://api.eia.gov";
const EIA_KEY = process.env.EIA_KEY || "";
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
function buildQuery(params){
  const sp = new URLSearchParams();
  Object.keys(params||{}).forEach(k=>{
    if (params[k] !== undefined && params[k] !== null && params[k] !== "") sp.append(k, String(params[k]));
  });
  return sp.toString();
}
async function forwardGET(res, url){
  try {
    const r = await fetch(url, { method: 'GET' });
    const contentType = r.headers.get('content-type') || 'application/json';
    const body = await r.buffer();
    res.status(r.status).setHeader('content-type', contentType);
    return res.end(body);
  } catch (err) {
    console.error('EIA forward error', err && err.message);
    return res.status(502).json({ error:'upstream_error', message: err.message });
  }
}

module.exports = async (req, res) => {
  try {
    const query = Object.assign({}, req.query || {});
    const body = await readJsonBody(req);
    const params = Object.assign({}, query, body);

    console.log('eia/series incoming', { method: req.method, params });

    if (PROXY_SECRET) {
      const token = req.headers['x-proxy-auth'];
      if (!token || token !== PROXY_SECRET) return res.status(401).json({ error: 'missing_or_invalid_proxy_auth' });
    }

    if (!EIA_KEY) return res.status(500).json({ error: 'EIA_KEY_not_set' });
    params['api_key'] = EIA_KEY;

    // if user supplied series_id in body or query, forward to /series or other EIA paths by appending /series
    const url = `${EIA_BASE}/series?${buildQuery(params)}`;
    return forwardGET(res, url);
  } catch (err) {
    console.error('eia/series internal error', err && err.stack);
    return res.status(500).json({ error: 'internal_error', message: err && err.message });
  }
};
