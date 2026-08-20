// Klient Gemini: przeglądarka woła API Google BEZPOŚREDNIO, bez Workera.
// Tor Cloudflare Workers -> Google zrywał połączenia przy żądaniach z
// obrazami niezależnie od rozmiaru, więc został wycięty z architektury.
//
// Klucz jest wpisywany w Ustawieniach appki i trzymany wyłącznie w
// localStorage tej przeglądarki. NIGDY nie wpisuj klucza do kodu ani repo.
// W Google Cloud Console ogranicz klucz:
//  - Application restrictions -> Websites -> https://adiutant-tech.github.io/*
//  - API restrictions -> Generative Language API

const LS_KEY = 'radiator-studio-gemini-key'
const MODEL_LS_KEY = 'radiator-studio-model'
export const DEFAULT_MODEL = 'gemini-2.5-flash-image'

// --- silnik: 'gemini' (domyślny) albo 'openai' -------------------------------
const ENGINE_LS_KEY = 'radiator-studio-engine'
const OPENAI_KEY_LS = 'radiator-studio-openai-key'
const OPENAI_MODEL_LS = 'radiator-studio-openai-model'
const OPENAI_PROXY_LS = 'radiator-studio-openai-proxy'
export const DEFAULT_OPENAI_MODEL = 'gpt-image-1'

export const getEngine = () => localStorage.getItem(ENGINE_LS_KEY) || 'gemini'
export const setEngine = (e) => localStorage.setItem(ENGINE_LS_KEY, e)
export const getOpenaiKey = () => localStorage.getItem(OPENAI_KEY_LS) || ''
export const setOpenaiKey = (k) => localStorage.setItem(OPENAI_KEY_LS, k.trim())
export const getOpenaiModel = () =>
  localStorage.getItem(OPENAI_MODEL_LS) || DEFAULT_OPENAI_MODEL
export const setOpenaiModel = (m) =>
  localStorage.setItem(OPENAI_MODEL_LS, m.trim() || DEFAULT_OPENAI_MODEL)
export const getOpenaiProxy = () =>
  (localStorage.getItem(OPENAI_PROXY_LS) || '').replace(/\/$/, '')
export const setOpenaiProxy = (u) =>
  localStorage.setItem(OPENAI_PROXY_LS, u.trim().replace(/\/$/, ''))

export function getModel() {
  return localStorage.getItem(MODEL_LS_KEY) || DEFAULT_MODEL
}

export function setModel(m) {
  localStorage.setItem(MODEL_LS_KEY, m.trim() || DEFAULT_MODEL)
}

function dataUrlToBlob(dataUrl) {
  const { mimeType, data } = splitDataUrl(dataUrl)
  const bin = atob(data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

// --- OpenAI Images API --------------------------------------------------------
// Generations (bez obrazów) i Edits (z obrazami, multi-image + input_fidelity).
// UWAGA: api.openai.com nie wysyła nagłówków CORS, wywołanie prosto z
// przeglądarki zablokuje się. Ustaw proxy (Cloudflare Worker z worker/
// worker-openai.js) w polu "Proxy OpenAI" w Ustawieniach.
async function openaiGenerate(prompt, imageDataUrls) {
  const key = getOpenaiKey()
  if (!key) throw new Error('Missing OpenAI API key. Add it in Settings.')
  const base = getOpenaiProxy() || 'https://api.openai.com'
  const model = getOpenaiModel()

  let res
  if (imageDataUrls.length === 0) {
    res = await fetch(`${base}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model, prompt, size: '1536x1024', quality: 'high' }),
    })
  } else {
    const form = new FormData()
    form.append('model', model)
    form.append('prompt', prompt)
    form.append('size', '1536x1024')
    form.append('quality', 'high')
    form.append('input_fidelity', 'high')
    imageDataUrls.forEach((d, i) =>
      form.append('image[]', dataUrlToBlob(d), `input_${i + 1}.jpg`),
    )
    res = await fetch(`${base}/v1/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    })
  }

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.error?.message || `OpenAI responded with ${res.status}`)
  }
  const b64 = body?.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI returned no image. Please try again.')
  return `data:image/png;base64,${b64}`
}

// --- Gemini ---------------------------------------------------------------------
async function geminiGenerate(prompt, imageDataUrls) {
  const key = getApiKey()
  if (!key) throw new Error('Missing Gemini API key. Add it in Settings.')

  const payload = JSON.stringify({
    contents: [
      {
        parts: [
          ...imageDataUrls.map((d) => {
            const { mimeType, data } = splitDataUrl(d)
            return { inline_data: { mime_type: mimeType, data } }
          }),
          { text: prompt },
        ],
      },
    ],
    generationConfig: { responseModalities: ['IMAGE'] },
  })

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${getModel()}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: payload,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = body?.error?.message || `Gemini responded with ${res.status}`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  const candidate = body?.candidates?.[0]
  const part = candidate?.content?.parts?.find((p) => p.inlineData || p.inline_data)
  const inline = part?.inlineData || part?.inline_data
  if (!inline?.data) {
    const reason =
      candidate?.finishReason || body?.promptFeedback?.blockReason || 'nieznany powód'
    throw new Error(`The model returned no image (${reason}). Please try again.`)
  }
  return `data:${inline.mimeType || inline.mime_type || 'image/png'};base64,${inline.data}`
}

// --- Auto-QA: tekstowa weryfikacja kadru przez tani model Gemini --------------
// Zwraca sparsowany obiekt JSON albo null, gdy weryfikacja jest niemożliwa
// (brak klucza Gemini, błąd sieci, niesparsowalna odpowiedź). null NIGDY nie
// blokuje generacji - kadr jest wtedy przyjmowany bez weryfikacji.
// QA zawsze idzie przez Gemini, także przy silniku OpenAI (proxy przepuszcza
// tylko /v1/images/*, a klucz Gemini i tak jest w Ustawieniach).
export const VERIFY_MODEL = 'gemini-2.5-flash'

export async function verifyJson(prompt, imageDataUrls = []) {
  const key = getApiKey()
  if (!key) return null
  try {
    const payload = JSON.stringify({
      contents: [
        {
          parts: [
            ...imageDataUrls.map((d) => {
              const { mimeType, data } = splitDataUrl(d)
              return { inline_data: { mime_type: mimeType, data } }
            }),
            { text: prompt },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json' },
    })
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${VERIFY_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: payload,
      },
    )
    const body = await res.json().catch(() => null)
    if (!res.ok || !body) return null
    const text = (body?.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || '')
      .join('')
    const m = text.match(/\{[\s\S]*\}/)
    return m ? JSON.parse(m[0]) : null
  } catch {
    return null
  }
}

export function getApiKey() {
  return localStorage.getItem(LS_KEY) || ''
}

export function setApiKey(key) {
  localStorage.setItem(LS_KEY, key.trim())
}

// dataURL -> {mimeType, data}
export function splitDataUrl(dataUrl) {
  const [head, data] = dataUrl.split(',')
  const mimeType = head.match(/data:(.*?);/)[1]
  return { mimeType, data }
}

/**
 * @param {string} prompt
 * @param {string[]} imageDataUrls - obrazy wejściowe w kolejności [1], [2], ...
 * @returns {Promise<string>} dataURL wygenerowanego obrazu
 */
export async function generateImage(prompt, imageDataUrls = []) {
  const engine = getEngine()
  // Jedna automatyczna ponowna próba po 2 s przy błędach przejściowych.
  let lastError
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return engine === 'openai'
        ? await openaiGenerate(prompt, imageDataUrls)
        : await geminiGenerate(prompt, imageDataUrls)
    } catch (e) {
      lastError = e
      const transient = /network|connection|fetch|502|timeout|overloaded|503|rate limit|429/i.test(
        e.message,
      )
      if (attempt === 1 && transient) {
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      throw lastError
    }
  }
  throw lastError
}
