// Radiator Studio, proxy CORS dla OpenAI Images API.
// api.openai.com nie wysyła nagłówków CORS, więc przeglądarka nie może go
// wołać bezpośrednio. Ten Worker tylko przekazuje ruch i dokleja CORS.
// Klucz OpenAI NIE jest tu przechowywany: leci w nagłówku Authorization
// z przeglądarki, przelotowo.
//
// Deploy:
//   cd worker
//   npx wrangler deploy --name radiator-openai --config wrangler-openai.toml
// (albo tymczasowo podmień main w wrangler.toml na worker-openai.js)

const UPSTREAM = 'https://api.openai.com'

function corsHeaders(env, request) {
  const origin = request.headers.get('Origin') || ''
  const allowed = env.ALLOWED_ORIGIN || '*'
  return {
    'Access-Control-Allow-Origin':
      allowed === '*' ? '*' : allowed === origin ? origin : allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env, request)
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    const url = new URL(request.url)
    if (request.method !== 'POST' || !url.pathname.startsWith('/v1/images/')) {
      return new Response(JSON.stringify({ error: { message: 'Użyj POST /v1/images/*' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...cors },
      })
    }

    const headers = new Headers()
    const auth = request.headers.get('Authorization')
    if (auth) headers.set('Authorization', auth)
    const ct = request.headers.get('Content-Type')
    if (ct) headers.set('Content-Type', ct)

    let upstream
    try {
      upstream = await fetch(`${UPSTREAM}${url.pathname}`, {
        method: 'POST',
        headers,
        body: request.body,
      })
    } catch (e) {
      return new Response(
        JSON.stringify({ error: { message: `Błąd połączenia z OpenAI: ${e.message}` } }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...cors } },
      )
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  },
}
