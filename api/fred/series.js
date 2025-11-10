// api/fred/series.js
// Minimal handler for /api/fred/series to ensure Vercel routes exist.
// Accepts POST and GET, supports __test=1 for debug response.

module.exports = async (req, res) => {
  try {
    const method = req.method || 'GET';
    // parse body if present (Vercel may parse JSON to req.body)
    const body = (req.body && Object.keys(req.body||{}).length) ? req.body : null;
    const query = Object.assign({}, req.query || {});
    const params = Object.assign({}, query, body || {});

    console.log("FRED series handler incoming:", { method, params, headers: { xProxyAuth: !!req.headers['x-proxy-auth'] } });

    // debug test mode
    if (String(params['__test']) === '1') {
      return res.status(200).json({
        debug: true,
        msg: "dummy fredSeries response (test mode)",
        series_id_received: params.series_id || null
      });
    }

    // For now return a controlled placeholder so we see successful routing.
    return res.status(200).json({
      status: "ok",
      note: "fredSeries handler reached; replace with proxy logic to call FRED upstream",
      received: params
    });
  } catch (err) {
    console.error("fredSeries error:", err && err.stack);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
};
