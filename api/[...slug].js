// api/[...slug].js (DEBUG version)
// Purpose: confirm routing from OpenAI Actions to Vercel and show what the request looks like.
// Temporary: safe to run publicly; does NOT reveal env vars.

module.exports = async (req, res) => {
  try {
    // Basic info
    const fullPath = req.url.split('?')[0];
    const query = Object.assign({}, req.query);
    const xAuth = req.headers['x-proxy-auth'] || null;

    console.log("DEBUG incoming path:", fullPath);
    console.log("DEBUG query:", query);
    console.log("DEBUG X-Proxy-Auth header:", xAuth);

    // If the client requested __test=1 and path is /api/fred/series -> return dummy success
    if (query['__test'] === '1' && fullPath === '/api/fred/series') {
      return res.status(200).json({
        debug: true,
        msg: "dummy fredSeries response (test mode)",
        series_id_received: query.series_id || null,
        note: "routing to /api/fred/series works"
      });
    }

    // Generic echo for debugging: show what OpenAI / Actions sent
    return res.status(200).json({
      debug: true,
      fullPath,
      query,
      headers: {
        'x-proxy-auth': xAuth ? "[present]" : "[missing]"
      }
    });
  } catch (err) {
    console.error("DEBUG internal error:", err && err.stack);
    return res.status(500).json({ error: 'debug_internal_error', message: err.message });
  }
};

