// api/census/eits.js
// Compatibility endpoint: accepts body.dataset and forwards to /timeseries/eits/{dataset}
const fetch = require('node-fetch');
const { URLSearchParams } = require('url');

const CENSUS_BASE = "https://api.census.gov";
const CENSUS_KEY = process.env.CENSUS_KEY || "";
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

module.exports = async (req, res) => {
  try {
    const body = await readJsonBody(req);
    const dataset = body.dataset;
    if (!dataset) return res.status(400).json({ error: 'dataset_required_in_body' });

    // remove dataset from params (we'll put it in path)
    delete body.dataset;

    if (PROXY_SECRET) {
      const token = req.headers['x-proxy-auth'];
      if (!token || token !== PROXY_SECRET) return res.status(401).json({ error: 'missing_or_invalid_proxy_auth' });
    }
    if (!CENSUS_KEY) return res.status(500).json({ error: 'CENSUS_KEY_not_set' });
    body.key = CENSUS_KEY;

    const queryString = buildQuery(body);
    const url = `${CENSUS_BASE}/data/timeseries/eits/${encodeURIComponent(dataset)}?${queryString}`;

    const upstream = await fetch(url, { method: 'GET' });
    const contentType = upstream.headers.get('content-type') || 'application/json';
    const buf = await upstream.buffer();
    res.status(upstream.status).setHeader('content-type', contentType);
    return res.end(buf);
  } catch (err) {
    console.error('census/eits compatibility error', err && err.stack);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
};
