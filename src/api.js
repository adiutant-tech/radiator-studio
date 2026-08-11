// Klient Workera. Worker trzyma GEMINI_API_KEY i woła
// gemini-2.5-flash-image:generateContent.

const LS_KEY = 'radiator-studio-worker-url'

export function getWorkerUrl() {
  return localStorage.getItem(LS_KEY) || ''
}

export function setWorkerUrl(url) {
  localStorage.setItem(LS_KEY, url.trim().replace(/\/$/, ''))
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
  const base = getWorkerUrl()
  if (!base) throw new Error('Brak adresu Workera. Uzupełnij go w ustawieniach.')

  // Payload w natywnym formacie Gemini generateContent, Worker tylko
  // dokleja klucz i przepuszcza bajty (proxy strumieniowe).
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

  // Zerwania połączenia z Gemini bywają przejściowe: jedna automatyczna
  // ponowna próba po 2 s, dopiero potem błąd do UI.
  let lastError
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${base}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = body?.error?.message || body?.error || `Worker odpowiedział ${res.status}`
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      }
      // Surowa odpowiedź Gemini: wyciągnij część z obrazem.
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
      const transient = /network|connection|fetch|502|timeout/i.test(e.message)
      if (attempt === 1 && transient) {
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      throw lastError
    }
  }
  throw lastError
}
