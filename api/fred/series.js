// api/fred/series.js
// Proxy to FRED: /fred/series -> https://api.stlouisfed.org/fred/series
const fetch = require('node-fetch');
const { URLSearchParams } = require('url');

const FRED_BASE = "https://api.stlouisfed.org";
const FRED_KEY = process.env.FRED_KEY || "";
const PROXY_SECRET = process.env.PROXY_SECRET || "";

async function readJsonBody(req) {
  if (req.body && Object.keys(req.body||{}).length) return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch(e) {
    // fall back to urlencoded parse
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
    console.error('Forward error', err && err.message);
    return res.status(502).json({ error:'upstream_error', message: err.message });
  }
}

module.exports = async (req, res) => {
  try {
    const fullPath = req.url.split('?')[0];
    const query = Object.assign({}, req.query || {});
    const body = await readJsonBody(req);
    const params = Object.assign({}, query, body);

    console.log('fred/series incoming', { method: req.method, params });

    if (PROXY_SECRET) {
      const token = req.headers['x-proxy-auth'];
      if (!token || token !== PROXY_SECRET) {
        return res.status(401).json({ error: 'missing_or_invalid_proxy_auth' });
      }
    }

    // debug shortcut (optional)
    if (String(params['__test']) === '1') {
      return res.status(200).json({ debug:true, msg:'dummy fredSeries response (test mode)', series_id_received: params.series_id || null });
    }

    if (!FRED_KEY) return res.status(500).json({ error: 'FRED_KEY_not_set' });
    params['api_key'] = FRED_KEY;
    params['file_type'] = params['file_type'] || 'json';

    const url = `${FRED_BASE}${'/fred/series'}?${buildQuery(params)}`;
    return forwardGET(res, url);
  } catch (err) {
    console.error('fred/series internal error', err && err.stack);
    return res.status(500).json({ error: 'internal_error', message: err && err.message });
  }
};
