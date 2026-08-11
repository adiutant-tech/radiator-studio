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

  const res = await fetch(`${base}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      images: imageDataUrls.map(splitDataUrl),
    }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `Worker odpowiedział ${res.status}`)
  }
  if (!body.image) {
    throw new Error(body.error || 'Model nie zwrócił obrazu (możliwy filtr treści). Spróbuj ponownie.')
  }
  return `data:${body.mimeType || 'image/png'};base64,${body.image}`
}
