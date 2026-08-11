// Radiator Studio, Cloudflare Worker v2 (proxy strumieniowe)
// Klient wysyła gotowy payload w formacie Gemini generateContent,
// Worker dokleja klucz i przepuszcza bajty bez parsowania w obie strony.
// Zero JSON.parse/stringify na megabajtowych ciałach = zero problemów
// z limitem CPU i zrywaniem transferu.
//
// Klucz: wrangler secret put GEMINI_API_KEY
// CORS: var ALLOWED_ORIGIN w wrangler.toml (po deployu frontu ustaw
// na https://adiutant-tech.github.io)

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

const jsonError = (message, status, cors) =>
  new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env, request)

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    const url = new URL(request.url)
    if (request.method !== 'POST' || url.pathname !== '/generate') {
      return jsonError('Użyj POST /generate', 404, cors)
    }
    if (!env.GEMINI_API_KEY) {
      return jsonError('Brak GEMINI_API_KEY w secrets Workera.', 500, cors)
    }

    console.log(
      `[gen] pass-through, content-length=${request.headers.get('Content-Length') || '?'}`,
    )

    let upstream
    try {
      upstream = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: request.body,
      })
    } catch (e) {
      console.log(`[gen] FETCH FAIL: ${e.name}: ${e.message}`)
      return jsonError(`Błąd połączenia z Gemini: ${e.message}`, 502, cors)
    }

    console.log(`[gen] upstream status=${upstream.status}`)

    // Odpowiedź też leci strumieniem, bez parsowania w Workerze.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  },
}
