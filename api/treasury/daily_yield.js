// api/treasury/daily_yield.js
// Proxy to Treasury Daily Treasury Yield Curve endpoint
const fetch = require('node-fetch');
const { URLSearchParams } = require('url');

const TREASURY_BASE = "https://api.fiscaldata.treasury.gov";
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
    console.error('Treasury forward error', err && err.message);
    return res.status(502).json({ error:'upstream_error', message: err.message });
  }
}

module.exports = async (req, res) => {
  try {
    const query = Object.assign({}, req.query || {});
    const body = await readJsonBody(req);
    const params = Object.assign({}, query, body);

    console.log('treasury/daily_yield incoming', { method: req.method, params });

    if (PROXY_SECRET) {
      const token = req.headers['x-proxy-auth'];
      if (!token || token !== PROXY_SECRET) return res.status(401).json({ error: 'missing_or_invalid_proxy_auth' });
    }

    const url = `${TREASURY_BASE}/services/api/fiscal_service/v1/accounting/od/daily_treasury_yield_curve?${buildQuery(params)}`;
    return forwardGET(res, url);
  } catch (err) {
    console.error('treasury/daily_yield internal error', err && err.stack);
    return res.status(500).json({ error: 'internal_error', message: err && err.message });
  }
};
