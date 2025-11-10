// api/[...slug].js
// Catch-all proxy that supports GET (query) and POST (JSON body).
// Temporary debug: supports __test=1 to return a dummy response for /api/fred/series.
// Env vars used: FRED_KEY, CENSUS_KEY, EIA_KEY, PROXY_SECRET (do NOT hardcode secrets here).

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

// Helper to read JSON body for POST requests
async function readJsonBody(req) {
  // If middleware (Vercel) already parsed body, use it
  if (req.body && Object.keys(req.body).length) return req.body;

  // Otherwise, stream raw body and parse
  try {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    if (!raw) return {};
    // Some clients may send application/x-www-form-urlencoded; try JSON parse first
    try {
      return JSON.parse(raw);
    } catch (e) {
      // fallback: parse urlencoded
      const params = new URLSearchParams(raw);
      const out = {};
      for (const [k, v] of params.entries()) out[k] = v;
      return out;
    }
  } catch (err) {
    console.error('Error reading request body:', err && err.message);
    return {};
  }
}

function buildQuery(params) {
  const sp = new URLSearchParams();
  Object.keys(params || {}).forEach(k => {
    const v = params[k];
    if (v !== undefined && v !== null && v !== "") {
      sp.append(k, String(v));
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
    // parse incoming path and query
    const fullPath = req.url.split('?')[0];      // e.g. /api/fred/series
    const queryFromUrl = Object.assign({}, req.query || {}); // parsed query (GET)
    const body = await readJsonBody(req);        // parsed body (POST)

    // Merge: body overrides query if same key
    const params = Object.assign({}, queryFromUrl, body);

    console.log("Incoming:", { method: req.method, fullPath, params });
    console.log("Header X-Proxy-Auth present:", !!req.headers['x-proxy-auth']);

    // AUTH check: if PROXY_SECRET set on server, require header match
    if (PROXY_SECRET) {
      const token = req.headers['x-proxy-auth'];
      if (!token || token !== PROXY_SECRET) {
        console.warn("Invalid or missing proxy auth header");
        return res.status(401).json({ error: 'missing_or_invalid_proxy_auth' });
      }
    }

    // DEBUG test route: if __test==1 and target is /api/fred/series -> return dummy
    if (String(params['__test']) === '1' && fullPath === '/api/fred/series') {
      return res.status(200).json({
        debug: true,
        msg: "dummy fredSeries response (test mode)",
        series_id_received: params.series_id || null,
        note: "routing to /api/fred/series works"
      });
    }

    // Health
    if (fullPath === '/api/health' || fullPath === '/_health') {
      return res.status(200).json({ status: 'ok', ts: Date.now() });
    }

    // ===== Route to upstreams using params (query/body combined) =====

    // FRED
    if (fullPath.startsWith('/api/fred/')) {
      const sub = fullPath.replace('/api/fred', ''); // e.g. /series or /series/observations
      if (!FRED_KEY) return res.status(500).json({ error: 'FRED_KEY_not_set' });
      params['api_key'] = FRED_KEY;
      params['file_type'] = params['file_type'] || 'json';
      const url = `${FRED_BASE}${sub}?${buildQuery(params)}`;
      return forward(res, url);
    }

    // Census timeseries eits
    if (fullPath.startsWith('/api/census/timeseries/eits/')) {
      const dataset = fullPath.replace('/api/census/timeseries/eits/', '');
      if (!CENSUS_KEY) return res.status(500).json({ error: 'CENSUS_KEY_not_set' });
      params['key'] = CENSUS_KEY;
      const url = `${CENSUS_BASE}/data/timeseries/eits/${dataset}?${buildQuery(params)}`;
      return forward(res, url);
    }

    // Generic census
    if (fullPath.startsWith('/api/census/')) {
      const sub = fullPath.replace('/api/census', ''); // /2019/acs/...
      if (!CENSUS_KEY) return res.status(500).json({ error: 'CENSUS_KEY_not_set' });
      params['key'] = CENSUS_KEY;
      const url = `${CENSUS_BASE}/data${sub}?${buildQuery(params)}`;
      return forward(res, url);
    }

    // Treasury friendly endpoints
    if (fullPath === '/api/treasury/daily_yield') {
      const url = `${TREASURY_BASE}/services/api/fiscal_service/v1/accounting/od/daily_treasury_yield_curve?${buildQuery(params)}`;
      return forward(res, url);
    }
    if (fullPath === '/api/treasury/debt_to_penny') {
      const url = `${TREASURY_BASE}/services/api/fiscal_service/v1/accounting/od/debt_to_penny?${buildQuery(params)}`;
      return forward(res, url);
    }

    // FHFA
    if (fullPath === '/api/fhfa/master_index') {
      const url = `${FHFA_BASE}/hpi/download/monthly/hpi_master.xml`;
      return forward(res, url);
    }
    if (fullPath === '/api/fhfa/download') {
      const file = params.file;
      if (!file) return res.status(400).json({ error: 'file_param_required' });
      const url = `${FHFA_BASE}/hpi/download/${file}`;
      return forward(res, url);
    }

    // EIA
    if (fullPath.startsWith('/api/eia/')) {
      if (!EIA_KEY) return res.status(500).json({ error: 'EIA_KEY_not_set' });
      const sub = fullPath.replace('/api/eia', ''); // e.g. /series
      params['api_key'] = EIA_KEY;
      const url = `${EIA_BASE}${sub}?${buildQuery(params)}`;
      return forward(res, url);
    }

    // no match
    console.warn("No route matched for:", fullPath);
    return res.status(404).json({ error: 'not_found', path: fullPath });
  } catch (err) {
    console.error("Internal error:", err && err.stack);
    return res.status(500).json({ error: 'internal_error', message: err && err.message });
  }
};
