// Radiator Studio, Cloudflare Worker
// Proxy do Gemini 2.5 Flash Image (Nano Banana). Klucz trzymany jako secret:
//   wrangler secret put GEMINI_API_KEY
// Opcjonalnie zawęź CORS przez var ALLOWED_ORIGIN w wrangler.toml.

const MODEL = 'gemini-2.5-flash-image'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

function corsHeaders(env, request) {
  const origin = request.headers.get('Origin') || ''
  const allowed = env.ALLOWED_ORIGIN || '*'
  return {
    'Access-Control-Allow-Origin':
      allowed === '*' ? '*' : allowed === origin ? origin : allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

const json = (data, status, headers) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env, request)

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    const url = new URL(request.url)
    if (request.method !== 'POST' || url.pathname !== '/generate') {
      return json({ error: 'Użyj POST /generate' }, 404, cors)
    }
    if (!env.GEMINI_API_KEY) {
      return json({ error: 'Brak GEMINI_API_KEY w secrets Workera.' }, 500, cors)
    }

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Nieprawidłowy JSON.' }, 400, cors)
    }

    const { prompt, images = [] } = body
    if (!prompt) return json({ error: 'Brak promptu.' }, 400, cors)
    if (images.length > 4) return json({ error: 'Maksymalnie 4 obrazy wejściowe.' }, 400, cors)

    // Kolejność ma znaczenie: obrazy jako [1], [2]..., potem tekst.
    const parts = [
      ...images.map((img) => ({
        inline_data: { mime_type: img.mimeType, data: img.data },
      })),
      { text: prompt },
    ]

    let upstream
    try {
      upstream = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      })
    } catch (e) {
      return json({ error: `Błąd połączenia z Gemini: ${e.message}` }, 502, cors)
    }

    const data = await upstream.json().catch(() => null)

    if (!upstream.ok) {
      const msg = data?.error?.message || `Gemini odpowiedziało ${upstream.status}`
      return json({ error: msg }, upstream.status, cors)
    }

    const candidate = data?.candidates?.[0]
    const imagePart = candidate?.content?.parts?.find((p) => p.inlineData || p.inline_data)
    const inline = imagePart?.inlineData || imagePart?.inline_data

    if (!inline?.data) {
      const reason =
        candidate?.finishReason || data?.promptFeedback?.blockReason || 'nieznany powód'
      return json({ error: `Model nie zwrócił obrazu (${reason}).` }, 502, cors)
    }

    return json(
      { image: inline.data, mimeType: inline.mimeType || inline.mime_type || 'image/png' },
      200,
      cors,
    )
  },
}
