import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import {
  PLATE_SCAFFOLD_PRODUCT,
  PLATE_SCAFFOLD_WIDE,
  FRAMING,
  STYLES,
  FINISHES,
  VALVES,
  SECTION_VARIANTS,
  COMPOSE_STYLED,
  COMPOSE_OWN,
  FINISH_SWAP_TEMPLATE,
  VALVE_SWAP_TEMPLATE,
} from './prompts.js'
import {
  generateImage,
  getApiKey,
  setApiKey,
  getModel,
  setModel,
  DEFAULT_MODEL,
  getEngine,
  setEngine,
  getOpenaiKey,
  setOpenaiKey,
  getOpenaiModel,
  setOpenaiModel,
  getOpenaiProxy,
  setOpenaiProxy,
  DEFAULT_OPENAI_MODEL,
} from './api.js'

// ---------------------------------------------------------------------------

// Wczytuje plik i skaluje w dół do maxDim po dłuższym boku.
// Duże packshoty (5-20 MB) potrafią zrywać połączenie Workera z Gemini,
// a do kompozycji i tak wystarczy ~1600 px.
async function fileToDataUrl(file, maxDim = 1600) {
  const raw = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
  const img = await new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = raw
  })
  // Zawsze przekodowuj do JPEG: o wadze decydują bajty, nie wymiary.
  // Mały wymiarowo PNG potrafi ważyć 3 MB i zrywać połączenie z Gemini.
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.92)
}

// Budżet bajtowy na CAŁE wejście żądania. Przy bezpośrednim wołaniu API
// Google limit żądania to ~20 MB, budżet 6 MB zostawia zapas i w praktyce
// nie wymusza dodatkowej kompresji ponad standardowe 1600 px.
async function fitBudget(images, budget = 6_000_000) {
  const steps = [
    [1400, 0.85],
    [1280, 0.78],
    [1024, 0.7],
    [896, 0.6],
  ]
  let out = [...images]
  let s = 0
  const total = () => out.reduce((n, d) => n + (d?.length || 0), 0)
  while (total() > budget && s < steps.length) {
    const [dim, q] = steps[s++]
    out = await Promise.all(out.map((d) => recompress(d, dim, q)))
  }
  return out
}

// Przekodowuje dataURL (np. ciężki PNG z Gemini) do JPEG i skaluje do maxDim.
// Obrazy wracające z modelu jako PNG ważą w base64 2-3 MB i przy ponownym
// wysłaniu jako wejście potrafią zrywać połączenie Workera z Gemini.
async function recompress(dataUrl, maxDim = 1600, quality = 0.9) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

function download(dataUrl, name) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = name
  a.click()
}

// Konwersja do JPEG w NATYWNEJ rozdzielczości (bez skalowania):
// zmienia format zapisu, nie jakość obrazu.
async function toJpeg(dataUrl, quality = 0.95) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/jpeg', quality)
}

const cellId = (finishKey, valveKey) => `${finishKey}__${valveKey}`

// Podbijaj przy każdej zmianie, widoczne w nagłówku appki:
const APP_VERSION = 'v4.5'

// Miniatura stylu: public/styles/{key}.jpg (brak pliku = kafelek bez zdjęcia)
const styleThumb = (key) => `${import.meta.env.BASE_URL}styles/${key}.jpg`

// --- Edytowalne prompty: domyślne wartości + zapis w localStorage -----------

// Klucz jest wersjonowany: podbicie celowo porzuca edycje z localStorage,
// żeby po zmianie domyślnych w repo wszyscy wystartowali od aktualnych.
// v7: packshot jest źródłem prawdy także o PROPORCJACH (usunięte "low,
// knee height" z czasów Short Ascota; wysokość produktu z referencji).
const PROMPTS_LS_KEY = 'radiator-studio-prompts-v12'
const SECTIONS_LS_KEY = 'radiator-studio-sections'
const STYLE_LS_KEY = 'radiator-studio-style'
const FRAME_LS_KEY = 'radiator-studio-frame'

function defaultPrompts() {
  return {
    plateScaffoldProduct: PLATE_SCAFFOLD_PRODUCT,
    plateScaffoldWide: PLATE_SCAFFOLD_WIDE,
    framingProduct: FRAMING.product,
    framingWide: FRAMING.wide,
    styles: Object.fromEntries(STYLES.map((s) => [s.key, s.prompt])),
    composeStyled: COMPOSE_STYLED,
    composeOwn: COMPOSE_OWN,
    finishSwap: FINISH_SWAP_TEMPLATE,
    swap: VALVE_SWAP_TEMPLATE,
    finishes: Object.fromEntries(FINISHES.map((f) => [f.key, f.block])),
    valves: { silver: VALVES.silver.material, gold: VALVES.gold.material },
  }
}

function loadPrompts() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROMPTS_LS_KEY))
    if (!saved) return defaultPrompts()
    const d = defaultPrompts()
    return {
      plateScaffoldProduct: saved.plateScaffoldProduct ?? d.plateScaffoldProduct,
      plateScaffoldWide: saved.plateScaffoldWide ?? d.plateScaffoldWide,
      framingProduct: saved.framingProduct ?? d.framingProduct,
      framingWide: saved.framingWide ?? d.framingWide,
      styles: { ...d.styles, ...(saved.styles || {}) },
      composeStyled: saved.composeStyled ?? d.composeStyled,
      composeOwn: saved.composeOwn ?? d.composeOwn,
      finishSwap: saved.finishSwap ?? d.finishSwap,
      swap: saved.swap ?? d.swap,
      finishes: { ...d.finishes, ...(saved.finishes || {}) },
      valves: { ...d.valves, ...(saved.valves || {}) },
    }
  } catch {
    return defaultPrompts()
  }
}

// ---------------------------------------------------------------------------

export default function App() {
  const [apiKey, setApiKeyState] = useState(getApiKey())
  const [modelId, setModelIdState] = useState(getModel())
  const [engine, setEngineState] = useState(getEngine())
  const [openaiKey, setOpenaiKeyState] = useState(getOpenaiKey())
  const [openaiModel, setOpenaiModelState] = useState(getOpenaiModel())
  const [openaiProxy, setOpenaiProxyState] = useState(getOpenaiProxy())
  const [packshot, setPackshot] = useState(null)
  const [plate, setPlate] = useState(null)
  const [plateBusy, setPlateBusy] = useState(false)

  // Tor wnętrza: 'style' (generowane z listingu) albo 'own' (własne zdjęcie).
  // plateOrigin zapamiętuje, jak powstał AKTUALNY plate, bo od tego zależy,
  // który szablon kompozycji zostanie użyty.
  const [plateMode, setPlateMode] = useState('style')
  const [plateOrigin, setPlateOrigin] = useState('style')
  // Kadr wybierany przy generowaniu; plateFrame = kadr AKTUALNEGO plate'a,
  // od niego zależy dopisek {FRAMING} w szablonie kompozycji.
  const [frameMode, setFrameMode] = useState(
    () => localStorage.getItem(FRAME_LS_KEY) || 'product',
  )
  const [plateFrame, setPlateFrame] = useState('product')
  const saveFrameMode = (v) => {
    setFrameMode(v)
    localStorage.setItem(FRAME_LS_KEY, v)
  }
  const [styleKey, setStyleKey] = useState(() => {
    const saved = localStorage.getItem(STYLE_LS_KEY)
    return STYLES.some((s) => s.key === saved) ? saved : 'classic-georgian'
  })
  const selectedStyle = STYLES.find((s) => s.key === styleKey)

  const [prompts, setPrompts] = useState(loadPrompts)

  const [sections, setSections] = useState(() => {
    const saved = Number(localStorage.getItem(SECTIONS_LS_KEY))
    return SECTION_VARIANTS.some((v) => v.sections === saved) ? saved : 10
  })
  const sectionVariant = SECTION_VARIANTS.find((v) => v.sections === sections)

  const [selFinishes, setSelFinishes] = useState(FINISHES.map((f) => f.key))
  const [selValves, setSelValves] = useState(['silver', 'gold'])

  // cells: { [id]: {status, img, error, prompt} }
  const [cells, setCells] = useState({})
  const [running, setRunning] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const cancelRef = useRef(false)

  // Esc zamyka podgląd
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e) => e.key === 'Escape' && setLightbox(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  useEffect(() => {
    localStorage.setItem(PROMPTS_LS_KEY, JSON.stringify(prompts))
  }, [prompts])

  const patchCell = (id, patch) =>
    setCells((c) => ({ ...c, [id]: { ...(c[id] || {}), ...patch } }))

  const setPrompt = (patch) => setPrompts((p) => ({ ...p, ...patch }))
  const setFinishBlock = (key, text) =>
    setPrompts((p) => ({ ...p, finishes: { ...p.finishes, [key]: text } }))
  const setValveMaterial = (key, text) =>
    setPrompts((p) => ({ ...p, valves: { ...p.valves, [key]: text } }))
  const setStylePrompt = (key, text) =>
    setPrompts((p) => ({ ...p, styles: { ...p.styles, [key]: text } }))

  const saveStyleKey = (k) => {
    setStyleKey(k)
    localStorage.setItem(STYLE_LS_KEY, k)
  }

  const resetPrompts = () => {
    if (confirm('Restore all prompts to their default values?')) {
      setPrompts(defaultPrompts())
    }
  }

  const saveSections = (n) => {
    setSections(n)
    localStorage.setItem(SECTIONS_LS_KEY, String(n))
  }

  // Finalne prompty składane z szablonów. To dokładnie ten tekst idzie do modelu.
  // Szablon kompozycji zależy od pochodzenia AKTUALNEGO plate'a.
  const buildComposePrompt = (finishKey, valveKey) =>
    (plateOrigin === 'own' ? prompts.composeOwn : prompts.composeStyled)
      .replaceAll('{FINISH}', prompts.finishes[finishKey])
      .replaceAll('{VALVE}', prompts.valves[valveKey])
      .replaceAll('{SECTIONS}', String(sectionVariant.sections))
      .replaceAll('{WIDTH_MM}', String(sectionVariant.width))
      .replaceAll(
        '{FRAMING}',
        plateFrame === 'wide' ? prompts.framingWide : prompts.framingProduct,
      )

  const buildSwapPrompt = (valveKey) =>
    prompts.swap.replaceAll('{VALVE}', prompts.valves[valveKey])

  const buildFinishSwapPrompt = (finishKey) =>
    prompts.finishSwap.replaceAll('{FINISH}', prompts.finishes[finishKey])

  // --- ustawienia ----------------------------------------------------------

  const saveApiKey = (v) => {
    setApiKeyState(v)
    setApiKey(v)
  }

  const saveModelId = (v) => {
    setModelIdState(v)
    setModel(v)
  }

  const saveEngine = (v) => {
    setEngineState(v)
    setEngine(v)
  }
  const saveOpenaiKey = (v) => {
    setOpenaiKeyState(v)
    setOpenaiKey(v)
  }
  const saveOpenaiModel = (v) => {
    setOpenaiModelState(v)
    setOpenaiModel(v)
  }
  const saveOpenaiProxy = (v) => {
    setOpenaiProxyState(v)
    setOpenaiProxy(v)
  }

  // --- plate ---------------------------------------------------------------

  const generatePlate = async () => {
    setPlateBusy(true)
    try {
      const scaffold =
        frameMode === 'wide' ? prompts.plateScaffoldWide : prompts.plateScaffoldProduct
      const stylePrompt = `${prompts.styles[styleKey]}\n\n${scaffold}`
      const raw = await generateImage(stylePrompt, [])
      setPlate(await recompress(raw))
      setPlateOrigin('style')
      setPlateFrame(frameMode)
    } catch (e) {
      alert(`Interior generation failed: ${e.message}`)
    } finally {
      setPlateBusy(false)
    }
  }

  // --- seria ---------------------------------------------------------------

  const plan = useMemo(() => {
    // Na każdy finisz: pełna kompozycja z pierwszym wybranym wariantem
    // przyłączy, drugi wariant jako edycja (swap zaworów) z gotowego kadru.
    const order = ['silver', 'gold'].filter((v) => selValves.includes(v))
    return selFinishes.map((fk) => ({ finishKey: fk, valveOrder: order }))
  }, [selFinishes, selValves])

  const totalCells = plan.reduce((n, p) => n + p.valveOrder.length, 0)

  const runSeries = async () => {
    if (!packshot || !plate) {
      alert('A packshot and a reference interior are required.')
      return
    }
    cancelRef.current = false
    setRunning(true)

    // budżet bajtowy na oba wejścia łącznie
    // KOLEJNOŚĆ MA ZNACZENIE: obraz [1] = pokój (baza edycji), [2] = packshot
    const [plateSmall, packshotSmall] = await fitBudget([plate, packshot])

    const init = {}
    for (const p of plan)
      for (const v of p.valveOrder)
        init[cellId(p.finishKey, v)] = { status: 'pending' }
    setCells(init)

    // KADR MASTER: pierwszy finisz to jedyna pełna kompozycja w serii.
    // Każdy kolejny finisz powstaje jako edycja mastera (zmiana samego
    // lakieru), dzięki czemu cała seria dzieli identyczny kadr, kąt i światło.
    let masterFrame = null

    for (const p of plan) {
      if (cancelRef.current) break
      const [firstValve, secondValve] = p.valveOrder
      let frameImg = null

      const firstId = cellId(p.finishKey, firstValve)
      const isMaster = !masterFrame
      const firstPrompt = isMaster
        ? buildComposePrompt(p.finishKey, firstValve)
        : buildFinishSwapPrompt(p.finishKey)
      const inputs = isMaster ? [plateSmall, packshotSmall] : [masterFrame]

      patchCell(firstId, { status: 'running', prompt: firstPrompt, sections })
      try {
        frameImg = await generateImage(firstPrompt, inputs)
        patchCell(firstId, { status: 'done', img: frameImg })
        // kadr posłuży jako wejście kolejnych edycji: zmieść w budżecie
        ;[frameImg] = await fitBudget([frameImg])
        if (isMaster) masterFrame = frameImg
      } catch (e) {
        patchCell(firstId, { status: 'error', error: e.message })
        if (secondValve)
          patchCell(cellId(p.finishKey, secondValve), {
            status: 'error',
            error: 'Skipped: no base frame for this finish.',
          })
        continue
      }

      // swap przyłączy z kadru tego finiszu
      if (secondValve && !cancelRef.current) {
        const secondId = cellId(p.finishKey, secondValve)
        const swapPrompt = buildSwapPrompt(secondValve)
        patchCell(secondId, { status: 'running', prompt: swapPrompt, sections })
        try {
          const img = await generateImage(swapPrompt, [frameImg])
          patchCell(secondId, { status: 'done', img })
        } catch (e) {
          patchCell(secondId, { status: 'error', error: e.message })
        }
      }
    }
    setRunning(false)
  }

  // Pojedyncza generacja jednego kadru (zawsze pełna kompozycja packshot+plate).
  // Używana i przez "Generate this frame", i przez "Ponów".
  const retryCell = async (finishKey, valveKey) => {
    if (!packshot || !plate) {
      alert('A packshot and a reference interior are required.')
      return
    }
    const id = cellId(finishKey, valveKey)
    const prompt = buildComposePrompt(finishKey, valveKey)
    patchCell(id, { status: 'running', error: null, prompt, sections })
    try {
      // [1] = pokój (baza edycji), [2] = packshot
      const img = await generateImage(prompt, await fitBudget([plate, packshot]))
      patchCell(id, { status: 'done', img })
    } catch (e) {
      patchCell(id, { status: 'error', error: e.message })
    }
  }

  const downloadAll = async () => {
    const zip = new JSZip()
    for (const [id, cell] of Object.entries(cells)) {
      if (cell.status !== 'done') continue
      const jpeg = await toJpeg(cell.img)
      zip.file(`radiator_${cell.sections || sections}sections_${id}.jpg`, jpeg.split(',')[1], {
        base64: true,
      })
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    download(url, 'radiator-studio-seria.zip')
    URL.revokeObjectURL(url)
  }

  const doneCount = Object.values(cells).filter((c) => c.status === 'done').length

  // -------------------------------------------------------------------------

  return (
    <div className="app">
      <header>
        <h1>
          Radiator Studio <span className="version">{APP_VERSION}</span>
        </h1>
        <p className="sub">
          One reference interior, six finishes, silver or gold valves.
        </p>
      </header>

      <section className="card">
        <h2>Settings</h2>

        <div className="row">
          <label className="check">
            <input
              type="radio"
              name="engine"
              checked={engine === 'gemini'}
              onChange={() => saveEngine('gemini')}
            />
            Gemini (Nano Banana), recommended
          </label>
          <label className="check">
            <input
              type="radio"
              name="engine"
              checked={engine === 'openai'}
              onChange={() => saveEngine('openai')}
            />
            OpenAI (GPT Image), experimental
          </label>
        </div>
        <p className="hint">
          Gemini preserves the casting and the room best (identity-preserving editing). OpenAI re-renders the scene; even with input_fidelity=high expect detail drift. Use it for moods and comparisons, not for form-guaranteed series. Keys stay in this browser only.
        </p>

        {engine === 'gemini' && (
          <>
            <label>
              Gemini API key (Google AI Studio)
              <input
                type="password"
                placeholder="AIza..."
                value={apiKey}
                onChange={(e) => saveApiKey(e.target.value)}
              />
            </label>
            <label>
              Image model
              <input
                type="text"
                placeholder={DEFAULT_MODEL}
                value={modelId}
                onChange={(e) => saveModelId(e.target.value)}
              />
            </label>
            <p className="hint">
              The default {DEFAULT_MODEL} outputs ~1 MP. If you have access to a Pro variant (2K/4K), enter its model ID here.
            </p>
          </>
        )}

        {engine === 'openai' && (
          <>
            <label>
              OpenAI API key
              <input
                type="password"
                placeholder="sk-..."
                value={openaiKey}
                onChange={(e) => saveOpenaiKey(e.target.value)}
              />
            </label>
            <label>
              Image model
              <input
                type="text"
                placeholder={DEFAULT_OPENAI_MODEL}
                value={openaiModel}
                onChange={(e) => saveOpenaiModel(e.target.value)}
              />
            </label>
            <label>
              OpenAI proxy (Cloudflare Worker URL)
              <input
                type="url"
                placeholder="https://radiator-openai.twoj-worker.workers.dev"
                value={openaiProxy}
                onChange={(e) => saveOpenaiProxy(e.target.value)}
              />
            </label>
            <p className="hint">
              api.openai.com does not allow browser calls (no CORS), so a proxy is effectively required: deploy worker/worker-openai.js (see README) and paste its URL here. The key still stays in the browser; the proxy only relays traffic.
            </p>
          </>
        )}
      </section>

      <section className="card">
        <h2>Step 1: Product packshot</h2>
        <p className="hint">
          A product photo from the shop, ideally cut out on white. This is the source of truth for the casting geometry; the model is forbidden to change it. The image is automatically scaled to 1600 px before sending.
        </p>
        <input
          type="file"
          accept="image/*"
          onChange={async (e) =>
            e.target.files[0] && setPackshot(await fileToDataUrl(e.target.files[0]))
          }
        />
        {packshot && (
          <img
            className="preview clickable"
            src={packshot}
            alt="Packshot"
            title="Click to enlarge"
            onClick={() => setLightbox(packshot)}
          />
        )}
      </section>

      <section className="card">
        <h2>Step 2: Reference interior (scene plate)</h2>
        <p className="hint">
          One interior for the whole series. Two paths: generate a room in a chosen English style, or upload your own photo; each path uses a different composition template.
        </p>

        <div className="row">
          <label className="check">
            <input
              type="radio"
              name="plateMode"
              checked={plateMode === 'style'}
              onChange={() => setPlateMode('style')}
            />
            Generate in a style from the list
          </label>
          <label className="check">
            <input
              type="radio"
              name="plateMode"
              checked={plateMode === 'own'}
              onChange={() => setPlateMode('own')}
            />
            Own interior photo
          </label>
        </div>

        {plateMode === 'style' && (
          <>
            <div className="style-grid">
              {STYLES.map((s) => (
                <div
                  key={s.key}
                  className={`style-card ${styleKey === s.key ? 'selected' : ''}`}
                  onClick={() => saveStyleKey(s.key)}
                  title={s.hint}
                >
                  <img
                    src={styleThumb(s.key)}
                    alt={s.label}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                  <div className="style-card-label">{s.label}</div>
                </div>
              ))}
            </div>
            <p className="hint">{selectedStyle.hint}</p>
            <div className="row">
              <label className="check">
                <input
                  type="radio"
                  name="frameMode"
                  checked={frameMode === 'product'}
                  onChange={() => saveFrameMode('product')}
                />
                Frame: product close-up (~70% under the sill)
              </label>
              <label className="check">
                <input
                  type="radio"
                  name="frameMode"
                  checked={frameMode === 'wide'}
                  onChange={() => saveFrameMode('wide')}
                />
                Frame: wide interior
              </label>
            </div>
            <div className="row">
              <button onClick={generatePlate} disabled={plateBusy}>
                {plateBusy
                  ? 'Generating preview…'
                  : `Generate interior: ${selectedStyle.label}`}
              </button>
            </div>
          </>
        )}

        {plateMode === 'own' && (
          <div className="row">
            <label className="upload-btn">
              Upload interior photo
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  if (!e.target.files[0]) return
                  setPlate(await fileToDataUrl(e.target.files[0]))
                  setPlateOrigin('own')
                }}
              />
            </label>
          </div>
        )}
        {plate && (
          <>
            <img
              className="preview wide clickable"
              src={plate}
              alt="Scene plate"
              title="Click to enlarge"
              onClick={() => setLightbox(plate)}
            />
            <p className="hint">
              The image above is the interior that will be used for the whole series (source: {plateOrigin === 'own' ? 'own photo' : 'style from the list'}). Not happy with it? Regenerate or upload another one before you run the series.
            </p>
          </>
        )}
      </section>

      <section className="card">
        <h2>Prompts (editable)</h2>
        <p className="hint">
          This exact text is sent to the model. Placeholders work inside templates:{' '}<code>{'{FINISH}'}</code> the selected finish block, <code>{'{VALVE}'}</code>{' '}the valve material, <code>{'{SECTIONS}'}</code> the section count,{' '}<code>{'{WIDTH_MM}'}</code> the width in mm. Changes save automatically in this browser.
        </p>

        <details>
          <summary>Interior styles ({STYLES.length}, each editable separately)</summary>
          {STYLES.map((s) => (
            <label key={s.key} className="block-label">
              <span className="style-editor-head">
                <img
                  className="style-mini"
                  src={styleThumb(s.key)}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
                {s.label}
              </span>
              <textarea
                rows={5}
                value={prompts.styles[s.key]}
                onChange={(e) => setStylePrompt(s.key, e.target.value)}
              />
            </label>
          ))}
        </details>

        <details>
          <summary>Interior scaffold: product close-up frame</summary>
          <textarea
            rows={8}
            value={prompts.plateScaffoldProduct}
            onChange={(e) => setPrompt({ plateScaffoldProduct: e.target.value })}
          />
        </details>

        <details>
          <summary>Interior scaffold: wide frame</summary>
          <textarea
            rows={8}
            value={prompts.plateScaffoldWide}
            onChange={(e) => setPrompt({ plateScaffoldWide: e.target.value })}
          />
        </details>

        <details>
          <summary>Framing add-ons for composition ({'{FRAMING}'})</summary>
          <label className="block-label">
            Product close-up
            <textarea
              rows={3}
              value={prompts.framingProduct}
              onChange={(e) => setPrompt({ framingProduct: e.target.value })}
            />
          </label>
          <label className="block-label">
            Wide interior
            <textarea
              rows={3}
              value={prompts.framingWide}
              onChange={(e) => setPrompt({ framingWide: e.target.value })}
            />
          </label>
        </details>

        <details>
          <summary>Composition template: interior generated from a style</summary>
          <textarea
            rows={16}
            value={prompts.composeStyled}
            onChange={(e) => setPrompt({ composeStyled: e.target.value })}
          />
        </details>

        <details>
          <summary>Composition template: own interior photo</summary>
          <textarea
            rows={16}
            value={prompts.composeOwn}
            onChange={(e) => setPrompt({ composeOwn: e.target.value })}
          />
        </details>

        <details>
          <summary>Finish swap template (series from one frame)</summary>
          <textarea
            rows={5}
            value={prompts.finishSwap}
            onChange={(e) => setPrompt({ finishSwap: e.target.value })}
          />
        </details>

        <details>
          <summary>Valve swap template</summary>
          <textarea
            rows={5}
            value={prompts.swap}
            onChange={(e) => setPrompt({ swap: e.target.value })}
          />
        </details>

        <details>
          <summary>Finish blocks (6)</summary>
          {FINISHES.map((f) => (
            <label key={f.key} className="block-label">
              {f.label}
              <textarea
                rows={4}
                value={prompts.finishes[f.key]}
                onChange={(e) => setFinishBlock(f.key, e.target.value)}
              />
            </label>
          ))}
        </details>

        <details>
          <summary>Valve materials (2)</summary>
          {Object.values(VALVES).map((v) => (
            <label key={v.key} className="block-label">
              {v.label}
              <textarea
                rows={2}
                value={prompts.valves[v.key]}
                onChange={(e) => setValveMaterial(v.key, e.target.value)}
              />
            </label>
          ))}
        </details>

        <div className="row">
          <button onClick={resetPrompts}>Restore defaults</button>
        </div>
      </section>

      <section className="card">
        <h2>Step 3: Variant series</h2>
        <div className="pickers">
          <div>
            <h3>Sections</h3>
            <select
              value={sections}
              onChange={(e) => saveSections(Number(e.target.value))}
            >
              {SECTION_VARIANTS.map((v) => (
                <option key={v.sections} value={v.sections}>
                  {v.sections} sections · {v.width} mm · {v.btu} BTU
                </option>
              ))}
            </select>
            <p className="hint">
              Enters the prompt as {'{SECTIONS}'} and {'{WIDTH_MM}'}. The whole series is generated in a single width variant.
            </p>
          </div>
          <div>
            <h3>Finishes</h3>
            {FINISHES.map((f) => (
              <label key={f.key} className="check">
                <input
                  type="checkbox"
                  checked={selFinishes.includes(f.key)}
                  onChange={(e) =>
                    setSelFinishes((s) =>
                      e.target.checked ? [...s, f.key] : s.filter((k) => k !== f.key),
                    )
                  }
                />
                {f.label}
              </label>
            ))}
          </div>
          <div>
            <h3>Valves</h3>
            {Object.values(VALVES).map((v) => (
              <label key={v.key} className="check">
                <input
                  type="checkbox"
                  checked={selValves.includes(v.key)}
                  onChange={(e) =>
                    setSelValves((s) =>
                      e.target.checked ? [...s, v.key] : s.filter((k) => k !== v.key),
                    )
                  }
                />
                {v.label}
              </label>
            ))}
          </div>
        </div>

        <div className="row">
          <button
            className="primary"
            onClick={runSeries}
            disabled={running || !packshot || !plate || totalCells === 0}
          >
            {running
              ? `Generating… (${doneCount}/${totalCells})`
              : `Generate series (${totalCells} images)`}
          </button>
          {running && (
            <button onClick={() => (cancelRef.current = true)}>Stop</button>
          )}
          {doneCount > 0 && !running && (
            <button onClick={downloadAll}>Download all (ZIP)</button>
          )}
        </div>

        <div className="grid">
          {plan.flatMap((p) =>
            p.valveOrder.map((v) => {
              const id = cellId(p.finishKey, v)
              const cell = cells[id]
              const finish = FINISHES.find((f) => f.key === p.finishKey)
              return (
                <div key={id} className={`cell ${cell?.status || ''}`}>
                  <div className="cell-title">
                    {finish.label} · {VALVES[v].label.toLowerCase()}
                  </div>
                  {!cell?.status && (
                    <div className="cell-empty">
                      <button
                        onClick={() => retryCell(p.finishKey, v)}
                        disabled={running}
                      >
                        Generate this frame
                      </button>
                    </div>
                  )}
                  {cell?.status === 'running' && <div className="spinner" />}
                  {cell?.status === 'error' && (
                    <div className="error">
                      <p>{cell.error}</p>
                      <button onClick={() => retryCell(p.finishKey, v)}>
                        Retry (full composition)
                      </button>
                    </div>
                  )}
                  {cell?.status === 'done' && (
                    <>
                      <img
                        className="clickable"
                        src={cell.img}
                        alt={id}
                        title="Click to enlarge"
                        onClick={() => setLightbox(cell.img)}
                      />
                      <div className="row">
                        <button
                          onClick={async () =>
                            download(
                              await toJpeg(cell.img),
                              `radiator_${cell.sections || sections}sections_${id}.jpg`,
                            )
                          }
                        >
                          Download
                        </button>
                        <button onClick={() => retryCell(p.finishKey, v)}>Retry</button>
                      </div>
                    </>
                  )}
                  {cell?.prompt && (
                    <details className="prompt-details">
                      <summary>Prompt used for this frame</summary>
                      <pre className="prompt-pre">{cell.prompt}</pre>
                    </details>
                  )}
                </div>
              )
            }),
          )}
        </div>
      </section>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Preview" />
          <div className="lightbox-hint">click or press Esc to close</div>
        </div>
      )}

      <footer>
        <p>
          QA before sending to the client: count the sections against the packshot, check the two-column depth, the ornament on every section, both valves connected, and the shadow direction consistent with the window light.
        </p>
      </footer>
    </div>
  )
}
