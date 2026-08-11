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
const MODEL = 'gemini-2.5-flash-image'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

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
  const key = getApiKey()
  if (!key) throw new Error('Brak klucza Gemini. Uzupełnij go w ustawieniach.')

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

  // Jedna automatyczna ponowna próba po 2 s przy błędach przejściowych.
  let lastError
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: payload,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = body?.error?.message || `Gemini odpowiedziało ${res.status}`
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      }
      const candidate = body?.candidates?.[0]
      const part = candidate?.content?.parts?.find((p) => p.inlineData || p.inline_data)
      const inline = part?.inlineData || part?.inline_data
      if (!inline?.data) {
        const reason =
          candidate?.finishReason || body?.promptFeedback?.blockReason || 'nieznany powód'
        throw new Error(`Model nie zwrócił obrazu (${reason}). Spróbuj ponownie.`)
      }
      return `data:${inline.mimeType || inline.mime_type || 'image/png'};base64,${inline.data}`
    } catch (e) {
      lastError = e
      const transient = /network|connection|fetch|502|timeout|overloaded|503/i.test(e.message)
      if (attempt === 1 && transient) {
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      throw lastError
    }
  }
  throw lastError
}
