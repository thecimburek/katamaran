// Ukládá hlasy do Upstash Redis (Vercel Marketplace).
// Potřebné proměnné prostředí:
//   KV_REST_API_URL + KV_REST_API_TOKEN  (doplní Vercel sám po připojení Upstash Redis)
//   EDIT_PIN                             (tvůj PIN pro úpravy hlasů)

const KEY = 'katamaran:state';

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function redis(cfg, command) {
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error(`Redis ${r.status}`);
  return (await r.json()).result;
}

function valid(body) {
  return body && Array.isArray(body.people) && body.people.length > 0 && body.people.length <= 40 &&
    body.people.every(p => p && typeof p.name === 'string' && p.name.length <= 80 && typeof p.yes === 'boolean');
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const cfg = redisConfig();
  if (!cfg) return res.status(500).json({ error: 'Chybí připojení k Upstash Redis.' });

  try {
    if (req.method === 'GET') {
      const raw = await redis(cfg, ['GET', KEY]);
      return res.status(200).json(raw ? JSON.parse(raw) : { people: null });
    }

    if (req.method === 'POST') {
      const pin = process.env.EDIT_PIN;
      if (!pin) return res.status(500).json({ error: 'Není nastavený EDIT_PIN.' });
      if (req.headers['x-edit-pin'] !== pin) return res.status(401).json({ error: 'Špatný PIN.' });

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!valid(body)) return res.status(400).json({ error: 'Neplatná data.' });

      const clean = { people: body.people.map(p => ({ name: p.name, yes: p.yes })) };
      await redis(cfg, ['SET', KEY, JSON.stringify(clean)]);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Metoda není povolená.' });
  } catch (e) {
    return res.status(500).json({ error: 'Chyba serveru.' });
  }
};
