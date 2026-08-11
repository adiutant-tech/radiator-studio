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

  const payload = JSON.stringify({
    prompt,
    images: imageDataUrls.map(splitDataUrl),
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
        throw new Error(body.error || `Worker odpowiedział ${res.status}`)
      }
      if (!body.image) {
        throw new Error(body.error || 'Model nie zwrócił obrazu (możliwy filtr treści). Spróbuj ponownie.')
      }
      return `data:${body.mimeType || 'image/png'};base64,${body.image}`
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
