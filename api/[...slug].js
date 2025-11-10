// api/[...slug].js  (debug build)
// This version logs the incoming path, query and headers to Vercel runtime logs for debugging.

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
    console.log("Forwarding to:", url);
    const r = await fetch(url, { headers, method: 'GET' });
    const contentType = r.headers.get('content-type') || 'application/json';
    const body = await r.buffer();
    res.status(r.status).setHeader('content-type', contentType);
    return res.end(body);
  } catch (err) {
    console.error("Upstream fetch error:", err && err.message);
    return res.status(502).json({ error: 'upstream_error', message: err.message });
  }
}

module.exports = async (req, res) => {
  try {
    // LOG incoming request details
    console.log("Incoming request path:", req.url);
    console.log("Method:", req.method);
    console.log("Headers (X-Proxy-Auth):", req.headers['x-proxy-auth']);
    console.log("Query:", req.query);

    // AUTH check
    if (PROXY_SECRET) {
      const token = req.headers['x-proxy-auth'];
      if (!token || token !== PROXY_SECRET) {
        console.warn("Invalid or missing proxy auth header");
        return res.status(401).json({ error: 'missing_or_invalid_proxy_auth' });
      }
    }

    const fullPath = req.url.split('?')[0];
    const query = Object.assign({}, req.query);

    // Health check (explicit)
    if (fullPath === '/api/health' || fullPath === '/_health') {
      console.log("Returning health OK");
      return res.status(200).json({ status: 'ok', ts: Date.now() });
    }

    // FRED
    if (fullPath.startsWith('/api/fred/')) {
      const sub = fullPath.replace('/api/fred', '');
      if (!FRED_KEY) {
        console.error("FRED_KEY not set");
        return res.status(500).json({ error: 'FRED_KEY_not_set' });
      }
      query['api_key'] = FRED_KEY;
      query['file_type'] = query['file_type'] || 'json';
      const url = `${FRED_BASE}${sub}?${buildQuery(query)}`;
      return forward(res, url);
    }

    // Census timeseries
    if (fullPath.startsWith('/api/census/timeseries/eits/')) {
      const dataset = fullPath.replace('/api/census/timeseries/eits/', '');
      if (!CENSUS_KEY) return res.status(500).json({ error: 'CENSUS_KEY_not_set' });
      query['key'] = CENSUS_KEY;
      const url = `${CENSUS_BASE}/data/timeseries/eits/${dataset}?${buildQuery(query)}`;
      return forward(res, url);
    }

    // Generic census
    if (fullPath.startsWith('/api/census/')) {
      if (!CENSUS_KEY) return res.status(500).json({ error: 'CENSUS_KEY_not_set' });
      query['key'] = CENSUS_KEY;
      const url = `${CENSUS_BASE}/data${fullPath.replace('/api/census', '')}?${buildQuery(query)}`;
      return forward(res, url);
    }

    // Treasury
    if (fullPath === '/api/treasury/daily_yield') {
      const url = `${TREASURY_BASE}/services/api/fiscal_service/v1/accounting/od/daily_treasury_yield_curve?${buildQuery(query)}`;
      return forward(res, url);
    }
    if (fullPath === '/api/treasury/debt_to_penny') {
      const url = `${TREASURY_BASE}/services/api/fiscal_service/v1/accounting/od/debt_to_penny?${buildQuery(query)}`;
      return forward(res, url);
    }

    // FHFA
    if (fullPath === '/api/fhfa/master_index') {
      const url = `${FHFA_BASE}/hpi/download/monthly/hpi_master.xml`;
      return forward(res, url);
    }
    if (fullPath === '/api/fhfa/download') {
      const file = query.file;
      if (!file) return res.status(400).json({ error: 'file_param_required' });
      const url = `${FHFA_BASE}/hpi/download/${file}`;
      return forward(res, url);
    }

    // EIA
    if (fullPath.startsWith('/api/eia/')) {
      if (!EIA_KEY) return res.status(500).json({ error: 'EIA_KEY_not_set' });
      const sub = fullPath.replace('/api/eia', '');
      query['api_key'] = EIA_KEY;
      const url = `${EIA_BASE}${sub}?${buildQuery(query)}`;
      return forward(res, url);
    }

    console.warn("No route matched for path:", fullPath);
    return res.status(404).json({ error: 'not_found', path: fullPath });
  } catch (err) {
    console.error("Internal error:", err && err.stack);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
};
