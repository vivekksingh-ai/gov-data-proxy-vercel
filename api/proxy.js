// api/proxy.js
// Vercel serverless function that proxies requests to Census, FRED, Treasury, FHFA, and EIA.
// Set env vars in Vercel Dashboard: FRED_KEY, CENSUS_KEY, EIA_KEY, PROXY_SECRET (optional)

const fetch = require('node-fetch');
const { URLSearchParams } = require('url');

const CENSUS_BASE = "https://api.census.gov";
const FRED_BASE = "https://api.stlouisfed.org";
const TREASURY_BASE = "https://api.fiscaldata.treasury.gov";
const FHFA_BASE = "https://www.fhfa.gov";
const EIA_BASE = "https://api.eia.gov";

const FRED_KEY = process.env.FRED_KEY || "";
const CENSUS_KEY = process.env.CENSUS_KEY || "";
const EIA_KEY = process.env.EIA_KEY || "";
const PROXY_SECRET = process.env.PROXY_SECRET || "";

function buildQuery(params) {
  const sp = new URLSearchParams();
  Object.keys(params || {}).forEach(k => {
    if (params[k] !== undefined && params[k] !== null && params[k] !== "") {
      sp.append(k, params[k]);
    }
  });
  return sp.toString();
}

async function forward(res, url, headers = {}) {
  try {
    const r = await fetch(url, { headers, method: 'GET' });
    const contentType = r.headers.get('content-type') || 'application/json';
    const body = await r.buffer();
    res.status(r.status).setHeader('content-type', contentType);
    return res.end(body);
  } catch (err) {
    res.status(502).json({ error: 'upstream_error', message: err.message });
  }
}

module.exports = async (req, res) => {
  // simple auth to protect your proxy
  if (PROXY_SECRET) {
    const token = req.headers['x-proxy-auth'];
    if (!token || token !== PROXY_SECRET) {
      return res.status(401).json({ error: 'missing_or_invalid_proxy_auth' });
    }
  }

  // route by path prefix
  // incoming path example: /api/fred/series
  const path = req.url.split('?')[0]; // e.g. /api/fred/series
  const query = Object.assign({}, req.query);

  if (path.startsWith('/api/fred/')) {
    // Map: /api/fred/series -> FRED /fred/series, add api_key
    const sub = path.replace('/api/fred', '');
    if (!FRED_KEY) return res.status(500).json({ error: 'FRED_KEY_not_set' });
    query['api_key'] = FRED_KEY;
    query['file_type'] = query['file_type'] || 'json';
    const url = `${FRED_BASE}${sub}?${buildQuery(query)}`;
    return forward(res, url);
  }

  if (path.startsWith('/api/census/timeseries/eits/')) {
    const dataset = path.replace('/api/census/timeseries/eits/', '');
    if (!CENSUS_KEY) return res.status(500).json({ error: 'CENSUS_KEY_not_set' });
    query['key'] = CENSUS_KEY;
    const url = `${CENSUS_BASE}/data/timeseries/eits/${dataset}?${buildQuery(query)}`;
    return forward(res, url);
  }

  if (path.startsWith('/api/census/')) {
    // pattern: /api/census/{year}/{source}/{dataset...}
    const sub = path.replace('/api/census', ''); // /2019/acs/acs1/pums
    if (!CENSUS_KEY) return res.status(500).json({ error: 'CENSUS_KEY_not_set' });
    query['key'] = CENSUS_KEY;
    const url = `${CENSUS_BASE}/data${sub}?${buildQuery(query)}`;
    return forward(res, url);
  }

  if (path.startsWith('/api/treasury/')) {
    // map a couple friendly endpoints:
    if (path === '/api/treasury/daily_yield') {
      const url = `${TREASURY_BASE}/services/api/fiscal_service/v1/accounting/od/daily_treasury_yield_curve?${buildQuery(query)}`;
      return forward(res, url);
    }
    if (path === '/api/treasury/debt_to_penny') {
      const url = `${TREASURY_BASE}/services/api/fiscal_service/v1/accounting/od/debt_to_penny?${buildQuery(query)}`;
      return forward(res, url);
    }
    return res.status(404).json({ error: 'treasury_endpoint_not_found' });
  }

  if (path.startsWith('/api/fhfa/master_index')) {
    const url = `${FHFA_BASE}/hpi/download/monthly/hpi_master.xml`;
    return forward(res, url);
  }
  if (path.startsWith('/api/fhfa/download')) {
    const file = query.file;
    if (!file) return res.status(400).json({ error: 'file_param_required' });
    const url = `${FHFA_BASE}/hpi/download/${file}`;
    return forward(res, url);
  }

  if (path.startsWith('/api/eia/series')) {
    if (!EIA_KEY) return res.status(500).json({ error: 'EIA_KEY_not_set' });
    query['api_key'] = EIA_KEY;
    const url = `${EIA_BASE}/series/?${buildQuery(query)}`;
    return forward(res, url);
  }

  // health
  if (path === '/api/health' || path === '/_health') {
    return res.status(200).json({ status: 'ok', ts: Date.now() });
  }

  return res.status(404).json({ error: 'not_found', path });
};
