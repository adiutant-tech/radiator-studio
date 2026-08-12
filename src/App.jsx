import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import {
  PLATE_SCAFFOLD,
  STYLES,
  FINISHES,
  VALVES,
  SECTION_VARIANTS,
  COMPOSE_STYLED,
  COMPOSE_OWN,
  FINISH_SWAP_TEMPLATE,
  VALVE_SWAP_TEMPLATE,
} from './prompts.js'
import { generateImage, getApiKey, setApiKey } from './api.js'

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

const cellId = (finishKey, valveKey) => `${finishKey}__${valveKey}`

// Podbijaj przy każdej zmianie, widoczne w nagłówku appki:
const APP_VERSION = 'v3.2'

// Miniatura stylu: public/styles/{key}.jpg (brak pliku = kafelek bez zdjęcia)
const styleThumb = (key) => `${import.meta.env.BASE_URL}styles/${key}.jpg`

// --- Edytowalne prompty: domyślne wartości + zapis w localStorage -----------

// Klucz jest wersjonowany: podbicie celowo porzuca edycje z localStorage,
// żeby po zmianie domyślnych w repo wszyscy wystartowali od aktualnych.
// v5: dwa tory wnętrza (10 stylów z listingu / własne zdjęcie z osobnym
// szablonem kompozycji), szkielet plate'a wspólny dla stylów.
const PROMPTS_LS_KEY = 'radiator-studio-prompts-v5'
const SECTIONS_LS_KEY = 'radiator-studio-sections'
const STYLE_LS_KEY = 'radiator-studio-style'

function defaultPrompts() {
  return {
    plateScaffold: PLATE_SCAFFOLD,
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
      plateScaffold: saved.plateScaffold ?? d.plateScaffold,
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
  const [packshot, setPackshot] = useState(null)
  const [plate, setPlate] = useState(null)
  const [plateBusy, setPlateBusy] = useState(false)

  // Tor wnętrza: 'style' (generowane z listingu) albo 'own' (własne zdjęcie).
  // plateOrigin zapamiętuje, jak powstał AKTUALNY plate, bo od tego zależy,
  // który szablon kompozycji zostanie użyty.
  const [plateMode, setPlateMode] = useState('style')
  const [plateOrigin, setPlateOrigin] = useState('style')
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
    if (confirm('Przywrócić wszystkie prompty do wartości domyślnych?')) {
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

  const buildSwapPrompt = (valveKey) =>
    prompts.swap.replaceAll('{VALVE}', prompts.valves[valveKey])

  const buildFinishSwapPrompt = (finishKey) =>
    prompts.finishSwap.replaceAll('{FINISH}', prompts.finishes[finishKey])

  // --- ustawienia ----------------------------------------------------------

  const saveApiKey = (v) => {
    setApiKeyState(v)
    setApiKey(v)
  }

  // --- plate ---------------------------------------------------------------

  const generatePlate = async () => {
    setPlateBusy(true)
    try {
      const stylePrompt = `${prompts.styles[styleKey]}\n\n${prompts.plateScaffold}`
      const raw = await generateImage(stylePrompt, [])
      setPlate(await recompress(raw))
      setPlateOrigin('style')
    } catch (e) {
      alert(`Błąd generacji wnętrza: ${e.message}`)
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
      alert('Potrzebny packshot i wnętrze referencyjne.')
      return
    }
    cancelRef.current = false
    setRunning(true)

    // budżet bajtowy na oba wejścia łącznie (limit ~1 MiB na żądanie)
    const [packshotSmall, plateSmall] = await fitBudget([packshot, plate])

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
      const inputs = isMaster ? [packshotSmall, plateSmall] : [masterFrame]

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
            error: 'Pominięto: brak kadru bazowego dla tego finiszu.',
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
  // Używana i przez "Generuj ten kadr", i przez "Ponów".
  const retryCell = async (finishKey, valveKey) => {
    if (!packshot || !plate) {
      alert('Potrzebny packshot i wnętrze referencyjne.')
      return
    }
    const id = cellId(finishKey, valveKey)
    const prompt = buildComposePrompt(finishKey, valveKey)
    patchCell(id, { status: 'running', error: null, prompt, sections })
    try {
      const img = await generateImage(prompt, await fitBudget([packshot, plate]))
      patchCell(id, { status: 'done', img })
    } catch (e) {
      patchCell(id, { status: 'error', error: e.message })
    }
  }

  const downloadAll = async () => {
    const zip = new JSZip()
    for (const [id, cell] of Object.entries(cells)) {
      if (cell.status !== 'done') continue
      const base64 = cell.img.split(',')[1]
      zip.file(`radiator_${cell.sections || sections}sekcji_${id}.png`, base64, {
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
          Jedno wnętrze referencyjne, 6 finiszy, srebrne lub złote przyłącza.
          Silnik: Gemini 2.5 Flash Image.
        </p>
      </header>

      <section className="card">
        <h2>Ustawienia</h2>
        <label>
          Klucz API Gemini (Google AI Studio)
          <input
            type="password"
            placeholder="AIza..."
            value={apiKey}
            onChange={(e) => saveApiKey(e.target.value)}
          />
        </label>
        <p className="hint">
          Klucz zostaje wyłącznie w tej przeglądarce (localStorage), appka woła
          API Google bezpośrednio. W Google Cloud Console ogranicz klucz do
          witryny https://adiutant-tech.github.io/* i do Generative Language API.
        </p>
      </section>

      <section className="card">
        <h2>Krok 1: Packshot produktu</h2>
        <p className="hint">
          Zdjęcie produktowe ze sklepu, najlepiej wycięte na białym tle. To jest
          źródło geometrii odlewu, model ma zakaz jej zmieniania. Obraz jest
          automatycznie skalowany do 1600 px przed wysyłką.
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
            title="Kliknij, aby powiększyć"
            onClick={() => setLightbox(packshot)}
          />
        )}
      </section>

      <section className="card">
        <h2>Krok 2: Wnętrze referencyjne (scene plate)</h2>
        <p className="hint">
          Jedno wnętrze na całą serię. Dwa tory: wygeneruj pokój w wybranym
          stylu angielskim albo wgraj własne zdjęcie, każdy tor używa innego
          szablonu kompozycji.
        </p>

        <div className="row">
          <label className="check">
            <input
              type="radio"
              name="plateMode"
              checked={plateMode === 'style'}
              onChange={() => setPlateMode('style')}
            />
            Generuj w stylu z listy
          </label>
          <label className="check">
            <input
              type="radio"
              name="plateMode"
              checked={plateMode === 'own'}
              onChange={() => setPlateMode('own')}
            />
            Własne zdjęcie wnętrza
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
              <button onClick={generatePlate} disabled={plateBusy}>
                {plateBusy
                  ? 'Generuję podgląd…'
                  : `Generuj wnętrze: ${selectedStyle.label}`}
              </button>
            </div>
          </>
        )}

        {plateMode === 'own' && (
          <div className="row">
            <label className="upload-btn">
              Wgraj zdjęcie wnętrza
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
              title="Kliknij, aby powiększyć"
              onClick={() => setLightbox(plate)}
            />
            <p className="hint">
              Miniatura powyżej to wnętrze, które zostanie użyte w serii
              (źródło: {plateOrigin === 'own' ? 'własne zdjęcie' : 'styl z listy'}).
              Nie podoba się? Generuj ponownie albo wgraj inne, zanim odpalisz serię.
            </p>
          </>
        )}
      </section>

      <section className="card">
        <h2>Prompty (edytowalne)</h2>
        <p className="hint">
          Dokładnie ten tekst idzie do modelu. W szablonach działają placeholdery:{' '}
          <code>{'{FINISH}'}</code> blok wybranego finiszu, <code>{'{VALVE}'}</code>{' '}
          materiał przyłączy, <code>{'{SECTIONS}'}</code> liczba sekcji,{' '}
          <code>{'{WIDTH_MM}'}</code> szerokość w mm. Zmiany zapisują się
          automatycznie w tej przeglądarce.
        </p>

        <details>
          <summary>Style wnętrz ({STYLES.length}, każdy edytowalny osobno)</summary>
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
          <summary>Szkielet wnętrza (wspólny dla wszystkich stylów)</summary>
          <textarea
            rows={8}
            value={prompts.plateScaffold}
            onChange={(e) => setPrompt({ plateScaffold: e.target.value })}
          />
        </details>

        <details>
          <summary>Szablon kompozycji: wnętrze generowane ze stylu</summary>
          <textarea
            rows={16}
            value={prompts.composeStyled}
            onChange={(e) => setPrompt({ composeStyled: e.target.value })}
          />
        </details>

        <details>
          <summary>Szablon kompozycji: własne zdjęcie wnętrza</summary>
          <textarea
            rows={16}
            value={prompts.composeOwn}
            onChange={(e) => setPrompt({ composeOwn: e.target.value })}
          />
        </details>

        <details>
          <summary>Szablon swapu finiszu (seria z jednego kadru)</summary>
          <textarea
            rows={5}
            value={prompts.finishSwap}
            onChange={(e) => setPrompt({ finishSwap: e.target.value })}
          />
        </details>

        <details>
          <summary>Szablon swapu przyłączy</summary>
          <textarea
            rows={5}
            value={prompts.swap}
            onChange={(e) => setPrompt({ swap: e.target.value })}
          />
        </details>

        <details>
          <summary>Bloki finiszy (6)</summary>
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
          <summary>Materiały przyłączy (2)</summary>
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
          <button onClick={resetPrompts}>Przywróć domyślne</button>
        </div>
      </section>

      <section className="card">
        <h2>Krok 3: Seria wariantów</h2>
        <div className="pickers">
          <div>
            <h3>Liczba sekcji</h3>
            <select
              value={sections}
              onChange={(e) => saveSections(Number(e.target.value))}
            >
              {SECTION_VARIANTS.map((v) => (
                <option key={v.sections} value={v.sections}>
                  {v.sections} sekcji · {v.width} mm · {v.btu} BTU
                </option>
              ))}
            </select>
            <p className="hint">
              Wchodzi do promptu jako {'{SECTIONS}'} i {'{WIDTH_MM}'}. Cała seria
              jest generowana w jednym wariancie szerokości.
            </p>
          </div>
          <div>
            <h3>Finisze</h3>
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
            <h3>Przyłącza</h3>
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
              ? `Generuję… (${doneCount}/${totalCells})`
              : `Generuj serię (${totalCells} obrazów)`}
          </button>
          {running && (
            <button onClick={() => (cancelRef.current = true)}>Przerwij</button>
          )}
          {doneCount > 0 && !running && (
            <button onClick={downloadAll}>Pobierz wszystko (ZIP)</button>
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
                        Generuj ten kadr
                      </button>
                    </div>
                  )}
                  {cell?.status === 'running' && <div className="spinner" />}
                  {cell?.status === 'error' && (
                    <div className="error">
                      <p>{cell.error}</p>
                      <button onClick={() => retryCell(p.finishKey, v)}>
                        Ponów (pełna kompozycja)
                      </button>
                    </div>
                  )}
                  {cell?.status === 'done' && (
                    <>
                      <img
                        className="clickable"
                        src={cell.img}
                        alt={id}
                        title="Kliknij, aby powiększyć"
                        onClick={() => setLightbox(cell.img)}
                      />
                      <div className="row">
                        <button
                          onClick={() =>
                            download(
                              cell.img,
                              `radiator_${cell.sections || sections}sekcji_${id}.png`,
                            )
                          }
                        >
                          Pobierz
                        </button>
                        <button onClick={() => retryCell(p.finishKey, v)}>Ponów</button>
                      </div>
                    </>
                  )}
                  {cell?.prompt && (
                    <details className="prompt-details">
                      <summary>Prompt użyty w tym kadrze</summary>
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
          <img src={lightbox} alt="Podgląd" />
          <div className="lightbox-hint">kliknij albo Esc, aby zamknąć</div>
        </div>
      )}

      <footer>
        <p>
          QA przed wysyłką do klienta: policz sekcje na packshocie i na kadrze,
          sprawdź 2 kolumny w głąb, wysokość poniżej parapetu, ornament tylko na
          skrajnych sekcjach, cień zgodny ze światłem z okna.
        </p>
      </footer>
    </div>
  )
}
