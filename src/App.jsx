import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import {
  PLATE_SCAFFOLD_PRODUCT,
  PLATE_FROM_THUMB_PRODUCT,
  FRAMING_PRODUCT,
  STYLES,
  FINISHES,
  VALVES,
  SECTION_VARIANTS,
  COMPOSE_STYLED,
  COMPOSE_OWN,
  FINISH_SWAP_TEMPLATE,
  VALVE_SWAP_TEMPLATE,
  VALVES_GENERIC,
  VALVES_REF_SINGLE,
  VALVES_REF_PAIR,
  SWAP_REF_SINGLE,
  SWAP_REF_PAIR,
  PAIR_NOTE,
  VERIFY_MASTER,
  VERIFY_COUNT,
  RETRY_NOTE_COUNT,
  RETRY_NOTE_DESIGN,
} from './prompts.js'
import {
  generateImage,
  verifyJson,
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
  getQaModelOverride,
  setQaModelOverride,
  getQaModelResolved,
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


// Liczenie to najsłabszy punkt modeli obrazkowych: cyfra + słowo + wyliczanka
// sekcja po sekcji dają najwyższą zgodność liczby sekcji.
const SECTION_WORDS = { 4: 'four', 6: 'six', 8: 'eight', 10: 'ten', 12: 'twelve', 14: 'fourteen' }
const widthNote = (n) =>
  n <= 6
    ? 'a small, narrow radiator, clearly narrower than the window above it, occupying only part of the wall.'
    : n <= 10
      ? 'a medium-width radiator, narrower than the window above it.'
      : 'a wide radiator, spanning most of the width of the window above it.'
const sectionsEnum = (n) =>
  `Counting from the left, the sections are: ${Array.from({ length: n }, (_, i) => `section ${i + 1}`).join(', ')}. After section ${n} the radiator ends with its end column and its foot; the total is exactly ${n} sections.`

const cellId = (finishKey, valveKey) => `${finishKey}__${valveKey}`

// Podbijaj przy każdej zmianie, widoczne w nagłówku appki:
const APP_VERSION = 'v6.2'

// Auto-QA: maksymalna liczba prób generacji jednego kadru (1 + ponowienia)
const QA_MAX_ATTEMPTS = 3
const VERIFY_LS_KEY = 'radiator-studio-verify'

// Miniatura stylu: public/styles/{key}.jpg (brak pliku = kafelek bez zdjęcia)
const styleThumb = (key) => `${import.meta.env.BASE_URL}styles/${key}.jpg`

// --- Edytowalne prompty: domyślne wartości + zapis w localStorage -----------

// Klucz jest wersjonowany: podbicie celowo porzuca edycje z localStorage,
// żeby po zmianie domyślnych w repo wszyscy wystartowali od aktualnych.
// v7: packshot jest źródłem prawdy także o PROPORCJACH (usunięte "low,
// knee height" z czasów Short Ascota; wysokość produktu z referencji).
const PROMPTS_LS_KEY = 'radiator-studio-prompts-v26'
const SECTIONS_LS_KEY = 'radiator-studio-sections'
const STYLE_LS_KEY = 'radiator-studio-style'
const FRAME_LS_KEY = 'radiator-studio-frame'

function defaultPrompts() {
  return {
    plateScaffoldProduct: PLATE_SCAFFOLD_PRODUCT,
    plateFromThumbProduct: PLATE_FROM_THUMB_PRODUCT,
    framingProduct: FRAMING_PRODUCT,
    styles: Object.fromEntries(STYLES.map((s) => [s.key, s.prompt])),
    composeStyled: COMPOSE_STYLED,
    composeOwn: COMPOSE_OWN,
    finishSwap: FINISH_SWAP_TEMPLATE,
    swap: VALVE_SWAP_TEMPLATE,
    finishes: Object.fromEntries(FINISHES.map((f) => [f.key, f.block])),
    valves: Object.fromEntries(
      Object.values(VALVES).map((v) => [v.key, v.material]),
    ),
    valvesGeneric: VALVES_GENERIC,
    valvesRefSingle: VALVES_REF_SINGLE,
    valvesRefPair: VALVES_REF_PAIR,
    swapRefSingle: SWAP_REF_SINGLE,
    swapRefPair: SWAP_REF_PAIR,
    pairNote: PAIR_NOTE,
    verifyMaster: VERIFY_MASTER,
    verifyCount: VERIFY_COUNT,
    retryNoteCount: RETRY_NOTE_COUNT,
    retryNoteDesign: RETRY_NOTE_DESIGN,
  }
}

function loadPrompts() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROMPTS_LS_KEY))
    if (!saved) return defaultPrompts()
    const d = defaultPrompts()
    return {
      plateScaffoldProduct: saved.plateScaffoldProduct ?? d.plateScaffoldProduct,
      plateFromThumbProduct: saved.plateFromThumbProduct ?? d.plateFromThumbProduct,
      framingProduct: saved.framingProduct ?? d.framingProduct,
      styles: { ...d.styles, ...(saved.styles || {}) },
      composeStyled: saved.composeStyled ?? d.composeStyled,
      composeOwn: saved.composeOwn ?? d.composeOwn,
      finishSwap: saved.finishSwap ?? d.finishSwap,
      swap: saved.swap ?? d.swap,
      finishes: { ...d.finishes, ...(saved.finishes || {}) },
      valves: { ...d.valves, ...(saved.valves || {}) },
      valvesGeneric: saved.valvesGeneric ?? d.valvesGeneric,
      valvesRefSingle: saved.valvesRefSingle ?? d.valvesRefSingle,
      valvesRefPair: saved.valvesRefPair ?? d.valvesRefPair,
      swapRefSingle: saved.swapRefSingle ?? d.swapRefSingle,
      swapRefPair: saved.swapRefPair ?? d.swapRefPair,
      pairNote: saved.pairNote ?? d.pairNote,
      verifyMaster: saved.verifyMaster ?? d.verifyMaster,
      verifyCount: saved.verifyCount ?? d.verifyCount,
      retryNoteCount: saved.retryNoteCount ?? d.retryNoteCount,
      retryNoteDesign: saved.retryNoteDesign ?? d.retryNoteDesign,
    }
  } catch {
    return defaultPrompts()
  }
}

// ---------------------------------------------------------------------------

export default function App() {
  const [apiKey, setApiKeyState] = useState(getApiKey())
  const [modelId, setModelIdState] = useState(getModel())
  const [qaModel, setQaModelState] = useState(getQaModelOverride())
  const [engine, setEngineState] = useState(getEngine())
  const [openaiKey, setOpenaiKeyState] = useState(getOpenaiKey())
  const [openaiModel, setOpenaiModelState] = useState(getOpenaiModel())
  const [openaiProxy, setOpenaiProxyState] = useState(getOpenaiProxy())
  const [packshot, setPackshot] = useState(null)
  const [valveRef, setValveRef] = useState(null)
  // 'single' = zdjęcie z jednym zaworem, 'pair' = dwa różne (pokrętło + lockshield)
  const [valveRefMode, setValveRefMode] = useState('single')
  const [plate, setPlate] = useState(null)
  const [plateBusy, setPlateBusy] = useState(false)

  // Tor wnętrza: 'style' (generowane z listingu) albo 'own' (własne zdjęcie).
  // plateOrigin zapamiętuje, jak powstał AKTUALNY plate, bo od tego zależy,
  // który szablon kompozycji zostanie użyty.
  const [plateMode, setPlateMode] = useState('style')
  const [plateOrigin, setPlateOrigin] = useState('style')
  // Kadr na stałe produktowy: wide usunięty z UI (v5.7) i z promptów (v5.9)
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
  // Auto-QA włączone domyślnie; wyłączenie zapamiętywane w localStorage.
  const [verifyOn, setVerifyOn] = useState(
    () => localStorage.getItem(VERIFY_LS_KEY) !== '0',
  )
  const saveVerifyOn = (on) => {
    setVerifyOn(on)
    localStorage.setItem(VERIFY_LS_KEY, on ? '1' : '0')
  }
  const [lightbox, setLightbox] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [promptsOpen, setPromptsOpen] = useState(false)
  const cancelRef = useRef(false)

  // Kadr MASTER z bramką akceptacji (v6.1): seria nie rusza automatycznie.
  // Krok 1 generuje wyłącznie master; user go ocenia (badge QA, podgląd,
  // Retry); krok 2 dopiero na jego podstawie robi pozostałe warianty.
  // Zmiana packshotu lub wnętrza unieważnia master.
  const [masterImg, setMasterImg] = useState(null)
  const [masterMeta, setMasterMeta] = useState(null) // {finishKey, valveKey}
  const clearMaster = () => {
    setMasterImg(null)
    setMasterMeta(null)
  }

  // Esc zamyka okna modalne
  useEffect(() => {
    if (!settingsOpen && !promptsOpen) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setSettingsOpen(false)
      setPromptsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen, promptsOpen])

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
      .replaceAll(
        '{VALVES_BLOCK}',
        !valveRef
          ? prompts.valvesGeneric
          : valveRefMode === 'pair'
            ? prompts.valvesRefPair
            : prompts.valvesRefSingle,
      )
      .replaceAll('{FINISH}', prompts.finishes[finishKey])
      .replaceAll('{VALVE}', prompts.valves[valveKey])
      .replaceAll('{SECTIONS}', String(sectionVariant.sections))
      .replaceAll('{SECTIONS_WORD}', SECTION_WORDS[sectionVariant.sections] || String(sectionVariant.sections))
      .replaceAll('{SECTIONS_ENUM}', sectionsEnum(sectionVariant.sections))
      .replaceAll('{WIDTH_NOTE}', widthNote(sectionVariant.sections))
      .replaceAll('{WIDTH_MM}', String(sectionVariant.width))
      .replaceAll('{FRAMING}', prompts.framingProduct)

  const buildSwapPrompt = (valveKey) =>
    prompts.swap
      .replaceAll('{VALVE}', prompts.valves[valveKey])
      .replaceAll(
        '{VALVE_REF}',
        !valveRef
          ? ''
          : valveRefMode === 'pair'
            ? prompts.swapRefPair
            : prompts.swapRefSingle,
      )

  const buildFinishSwapPrompt = (finishKey) =>
    prompts.finishSwap
      .replaceAll(
        '{VALVE_NOTE}',
        valveRef && valveRefMode === 'pair' ? prompts.pairNote : '',
      )
      .replaceAll('{FINISH}', prompts.finishes[finishKey])

  // --- Auto-QA: generacja z weryfikacją i automatycznym ponowieniem ---------
  // Po każdej generacji tani model TEKSTOWY Gemini liczy sekcje na wyniku,
  // a przy pełnej kompozycji dodatkowo porównuje wzór z packshotem. Kadr
  // niezgodny jest odrzucany, prompt dostaje dopisek korygujący i generacja
  // idzie ponownie, łącznie do QA_MAX_ATTEMPTS prób. Gdy weryfikacja jest
  // niemożliwa (brak klucza Gemini, błąd sieci), kadr przyjmowany jest bez
  // weryfikacji - QA nigdy nie blokuje pracy.

  const retryNoteCountText = (got) =>
    prompts.retryNoteCount
      .replaceAll('{GOT}', String(got))
      .replaceAll('{SECTIONS}', String(sections))
      .replaceAll('{SECTIONS_WORD}', SECTION_WORDS[sections] || String(sections))

  // Głosowanie QA (v5.12): 3 niezależne odczyty tego samego kadru, mediana
  // liczby sekcji, większość dla design_match. Pojedynczy odczyt VLM myli się
  // o +/-2 przy 8+ sekcjach; mediana z trzech tnie ten szum. Koszt: 3 tanie
  // wywołania tekstowe na próbę.
  const verifyVoted = async (prompt, images) => {
    const votes = (
      await Promise.all([0, 1, 2].map(() => verifyJson(prompt, images)))
    ).filter((v) => v && Number.isFinite(Number(v.sections)))
    if (!votes.length) return null
    const counts = votes.map((v) => Number(v.sections)).sort((a, b) => a - b)
    const median = counts[Math.floor(counts.length / 2)]
    const designVotes = votes
      .map((v) => v.design_match)
      .filter((d) => d === true || d === false)
    const designMatch = designVotes.length
      ? designVotes.filter(Boolean).length * 2 > designVotes.length
      : undefined
    return { sections: median, design_match: designMatch }
  }

  // checkDesign: packshot (dataURL) => QA porównuje też wzór; null => tylko liczba
  const generateVerified = async (basePrompt, inputs, { checkDesign = null, noteCellId = null } = {}) => {
    if (!verifyOn) return { img: await generateImage(basePrompt, inputs), verify: null }
    let best = null
    let addendum = ''
    for (let attempt = 1; attempt <= QA_MAX_ATTEMPTS; attempt++) {
      // Stop przerywa też pętlę QA: zwróć najlepszy dotychczasowy kadr,
      // a jeśli żadnego jeszcze nie ma, przerwij całkowicie.
      if (cancelRef.current) {
        if (best) return best
        throw new Error('Stopped.')
      }
      const img = await generateImage(
        addendum ? `${basePrompt}\n\n${addendum}` : basePrompt,
        inputs,
      )
      const [imgSmall] = await fitBudget([img])
      const v = await verifyVoted(
        checkDesign ? prompts.verifyMaster : prompts.verifyCount,
        checkDesign ? [imgSmall, checkDesign] : [imgSmall],
      )
      const got = Number(v?.sections)
      if (!v || !Number.isFinite(got)) return { img, verify: null }
      const okCount = got === sections
      const okDesign = checkDesign ? v.design_match !== false : true
      const cand = {
        img,
        verify: {
          got,
          want: sections,
          designMatch: checkDesign ? v.design_match !== false : null,
          attempts: attempt,
          ok: okCount && okDesign,
        },
      }
      if (okCount && okDesign) return cand
      if (
        !best ||
        Math.abs(got - sections) < Math.abs(best.verify.got - sections) ||
        (Math.abs(got - sections) === Math.abs(best.verify.got - sections) &&
          okDesign &&
          best.verify.designMatch === false)
      )
        best = cand
      addendum = [
        okCount ? null : retryNoteCountText(got),
        okDesign ? null : prompts.retryNoteDesign,
      ]
        .filter(Boolean)
        .join('\n\n')
      if (attempt === QA_MAX_ATTEMPTS)
        best = { ...best, verify: { ...best.verify, attempts: QA_MAX_ATTEMPTS } }
      if (noteCellId && attempt < QA_MAX_ATTEMPTS)
        patchCell(noteCellId, {
          qa: `QA rejected attempt ${attempt}: ${got} sections${
            checkDesign && v.design_match === false ? ', design mismatch' : ''
          }. Retrying (${attempt + 1}/${QA_MAX_ATTEMPTS})…`,
        })
    }
    return best
  }

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

  // Miniatura stylu jako dataURL (null, gdy pliku brak)
  const loadStyleThumb = async (key) => {
    try {
      const res = await fetch(styleThumb(key))
      if (!res.ok) return null
      const blob = await res.blob()
      const raw = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = reject
        r.readAsDataURL(blob)
      })
      return await recompress(raw)
    } catch {
      return null
    }
  }

  const generatePlate = async () => {
    setPlateBusy(true)
    try {
      // Tor główny: MINIATURA stylu jako obraz [1], wynik ma odpowiadać
      // temu, co user widzi na kafelku. Fallback: stary tor tekstowy.
      const thumb = await loadStyleThumb(styleKey)
      const raw = thumb
        ? await generateImage(prompts.plateFromThumbProduct, [thumb])
        : await generateImage(
            `${prompts.styles[styleKey]}\n\n${prompts.plateScaffoldProduct}`,
            [],
          )
      setPlate(await recompress(raw))
      setPlateOrigin('style')
      clearMaster()
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
    const order = Object.keys(VALVES).filter((v) => selValves.includes(v))
    return selFinishes.map((fk) => ({ finishKey: fk, valveOrder: order }))
  }, [selFinishes, selValves])

  const totalCells = plan.reduce((n, p) => n + p.valveOrder.length, 0)

  // KROK 1: sam MASTER. Pierwszy wybrany finisz × pierwszy wybrany wariant
  // przyłączy, jedyna pełna kompozycja packshot+wnętrze w serii. User ocenia
  // wynik (badge QA, podgląd, Retry) i dopiero potem odpala warianty.
  const runMaster = async () => {
    if (!packshot || !plate) {
      alert('A packshot and a reference interior are required.')
      return
    }
    if (plan.length === 0 || plan[0].valveOrder.length === 0) {
      alert('Select at least one finish and one valve variant.')
      return
    }
    cancelRef.current = false
    setRunning(true)
    const finishKey = plan[0].finishKey
    const valveKey = plan[0].valveOrder[0]
    const id = cellId(finishKey, valveKey)
    const prompt = buildComposePrompt(finishKey, valveKey)

    // KOLEJNOŚĆ MA ZNACZENIE: [1] = pokój (baza edycji), [2] = packshot,
    // [3] = opcjonalna referencja zaworu
    const inputsAll = await fitBudget(
      valveRef ? [plate, packshot, valveRef] : [plate, packshot],
    )
    const [plateSmall, packshotSmall, valveSmall] = inputsAll

    setCells({ [id]: { status: 'running', prompt, sections, qa: null, verify: null } })
    clearMaster()
    try {
      // Master jest sprawdzany przez QA także pod kątem zgodności WZORU
      // z packshotem; warianty dziedziczą wzór z mastera.
      const res = await generateVerified(
        prompt,
        valveSmall
          ? [plateSmall, packshotSmall, valveSmall]
          : [plateSmall, packshotSmall],
        { checkDesign: packshotSmall, noteCellId: id },
      )
      patchCell(id, { status: 'done', img: res.img, verify: res.verify, qa: null })
      const [fitted] = await fitBudget([res.img])
      setMasterImg(fitted)
      setMasterMeta({ finishKey, valveKey })
    } catch (e) {
      patchCell(id, { status: 'error', error: e.message })
    }
    setRunning(false)
  }

  // KROK 2: WARIANTY z zaakceptowanego mastera. Finisze jako swap lakieru
  // z mastera, przyłącza jako swap zaworów z kadru danego finiszu. Master
  // nie jest generowany ponownie; jego komórka zostaje nietknięta.
  const runVariants = async () => {
    if (!masterImg || !masterMeta) {
      alert('Generate the master frame first (step 1).')
      return
    }
    cancelRef.current = false
    setRunning(true)

    const valveSmall = valveRef ? (await fitBudget([valveRef]))[0] : null
    const masterId = cellId(masterMeta.finishKey, masterMeta.valveKey)

    setCells((prev) => {
      const init = {}
      for (const p of plan)
        for (const v of p.valveOrder) {
          const id = cellId(p.finishKey, v)
          init[id] =
            id === masterId && prev[id]?.status === 'done'
              ? prev[id]
              : { status: 'pending' }
        }
      return init
    })

    for (const p of plan) {
      if (cancelRef.current) break

      // baza dla finiszu: master albo swap lakieru z mastera (z zaworem mastera)
      let baseImg
      if (p.finishKey === masterMeta.finishKey) {
        baseImg = masterImg
      } else {
        const baseId = cellId(p.finishKey, masterMeta.valveKey)
        const tracked = p.valveOrder.includes(masterMeta.valveKey)
        const swapPrompt = buildFinishSwapPrompt(p.finishKey)
        if (tracked)
          patchCell(baseId, { status: 'running', prompt: swapPrompt, sections, qa: null, verify: null })
        try {
          const res = await generateVerified(swapPrompt, [masterImg], {
            noteCellId: tracked ? baseId : null,
          })
          if (tracked)
            patchCell(baseId, { status: 'done', img: res.img, verify: res.verify, qa: null })
          ;[baseImg] = await fitBudget([res.img])
        } catch (e) {
          if (tracked) patchCell(baseId, { status: 'error', error: e.message })
          for (const v of p.valveOrder)
            if (v !== masterMeta.valveKey)
              patchCell(cellId(p.finishKey, v), {
                status: 'error',
                error: 'Skipped: no base frame for this finish.',
              })
          continue
        }
      }

      // pozostałe warianty przyłączy: swap zaworów z kadru tego finiszu
      for (const v of p.valveOrder) {
        if (v === masterMeta.valveKey) continue
        if (cancelRef.current) break
        const vId = cellId(p.finishKey, v)
        const swapPrompt = buildSwapPrompt(v)
        patchCell(vId, { status: 'running', prompt: swapPrompt, sections, qa: null, verify: null })
        try {
          const res = await generateVerified(
            swapPrompt,
            valveSmall ? [baseImg, valveSmall] : [baseImg],
            { noteCellId: vId },
          )
          patchCell(vId, { status: 'done', img: res.img, verify: res.verify, qa: null })
        } catch (e) {
          patchCell(vId, { status: 'error', error: e.message })
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
    // Pojedyncza generacja też jest przerywalna: ustawia flagę running,
    // dzięki czemu przycisk Stop jest widoczny i działa (z QA to do 3 generacji).
    cancelRef.current = false
    setRunning(true)
    const id = cellId(finishKey, valveKey)
    const prompt = buildComposePrompt(finishKey, valveKey)
    patchCell(id, { status: 'running', error: null, prompt, sections, qa: null, verify: null })
    try {
      // [1] = pokój (baza edycji), [2] = packshot, [3] = opcjonalny zawór
      const inputs = await fitBudget(
        valveRef ? [plate, packshot, valveRef] : [plate, packshot],
      )
      const res = await generateVerified(prompt, inputs, {
        checkDesign: inputs[1],
        noteCellId: id,
      })
      patchCell(id, { status: 'done', img: res.img, verify: res.verify, qa: null })
      // Retry na komórce mastera odświeża też sam master; warianty zrobione
      // ze starego mastera są od tej chwili nieaktualne (przegeneruj krok 2).
      if (masterMeta && cellId(masterMeta.finishKey, masterMeta.valveKey) === id) {
        const [fitted] = await fitBudget([res.img])
        setMasterImg(fitted)
      }
    } catch (e) {
      patchCell(id, { status: 'error', error: e.message })
    } finally {
      setRunning(false)
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
      <header className="topbar">
        <div>
          <h1>
            Radiator Studio <span className="version">{APP_VERSION}</span>
          </h1>
          <p className="sub">
            One reference interior, six finishes, silver or gold valves.
          </p>
        </div>
        <div className="row">
          <button className="settings-btn" onClick={() => setSettingsOpen(true)}>
          ⚙ Settings
          {((engine === 'gemini' && !apiKey) ||
            (engine === 'openai' && !openaiKey)) && (
            <span className="settings-warn" title="API key missing">
              !
            </span>
          )}
        </button>
          <button className="settings-btn" onClick={() => setPromptsOpen(true)}>
            ✎ Prompts
          </button>
        </div>
      </header>

      {settingsOpen && (
        <div className="modal" onClick={() => setSettingsOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Settings</h2>
              <button className="modal-close" onClick={() => setSettingsOpen(false)}>
                ✕
              </button>
            </div>

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
            <label>
              QA model (text, for Auto-QA checks)
              <input
                type="text"
                placeholder={
                  getQaModelResolved()
                    ? `auto: ${getQaModelResolved()}`
                    : 'auto-detected from your account'
                }
                value={qaModel}
                onChange={(e) => {
                  setQaModelState(e.target.value)
                  setQaModelOverride(e.target.value)
                }}
              />
            </label>
            <p className="hint">
              Leave empty for auto-detection: the app asks the API for the model list and picks a current text "flash" model. Fill in only to force a specific one.
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
          </div>
        </div>
      )}

      <section className="card">
        <h2>Step 1: Product packshot</h2>
        <p className="hint">
          A product photo from the shop, ideally cut out on white. The radiator is transplanted into the interior 1:1, INCLUDING its section count, so upload the packshot of the exact SKU you want to show. The image is automatically scaled to 1600 px before sending.
        </p>
        <div className="row">
          <label className="upload-btn">
            Upload packshot
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                if (!e.target.files[0]) return
                setPackshot(await fileToDataUrl(e.target.files[0]))
                clearMaster()
              }}
            />
          </label>
          {packshot && (
            <button
              onClick={() => {
                setPackshot(null)
                clearMaster()
              }}
            >
              Remove
            </button>
          )}
        </div>
        {packshot && (
          <img
            className="preview clickable"
            src={packshot}
            alt="Packshot"
            title="Click to enlarge"
            onClick={() => setLightbox(packshot)}
          />
        )}

        <h3 style={{ marginTop: 16 }}>Valve packshot (optional)</h3>
        <p className="hint">
          If provided, it becomes the exact design reference for both valves;
          only the metal finish (silver/gold) is changed per variant. Without
          it, the model invents a generic traditional valve.
        </p>
        <div className="row">
          <label className="upload-btn">
            Upload valve photo
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) =>
                e.target.files[0] && setValveRef(await fileToDataUrl(e.target.files[0]))
              }
            />
          </label>
          {valveRef && <button onClick={() => setValveRef(null)}>Remove</button>}
        </div>
        {valveRef && (
          <div className="row">
            <label className="check">
              <input
                type="radio"
                name="valveRefMode"
                checked={valveRefMode === 'single'}
                onChange={() => setValveRefMode('single')}
              />
              Photo shows one valve (used on both sides)
            </label>
            <label className="check">
              <input
                type="radio"
                name="valveRefMode"
                checked={valveRefMode === 'pair'}
                onChange={() => setValveRefMode('pair')}
              />
              Photo shows two different valves (handwheel left, lockshield right)
            </label>
          </div>
        )}
        {valveRef && (
          <img
            className="preview clickable"
            src={valveRef}
            alt="Valve reference"
            title="Click to enlarge"
            onClick={() => setLightbox(valveRef)}
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
                  clearMaster()
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

      {promptsOpen && (
        <div className="modal" onClick={() => setPromptsOpen(false)}>
          <div className="modal-box modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Prompts (editable)</h2>
              <button className="modal-close" onClick={() => setPromptsOpen(false)}>
                ✕
              </button>
            </div>

        
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
          <summary>Plate from style thumbnail: product frame (thumbnail = image [1])</summary>
          <textarea
            rows={7}
            value={prompts.plateFromThumbProduct}
            onChange={(e) => setPrompt({ plateFromThumbProduct: e.target.value })}
          />
        </details>

        <details>
          <summary>Interior scaffold: product close-up frame (fallback, no thumbnail)</summary>
          <textarea
            rows={8}
            value={prompts.plateScaffoldProduct}
            onChange={(e) => setPrompt({ plateScaffoldProduct: e.target.value })}
          />
        </details>

        <details>
          <summary>Framing add-on: product close-up ({'{FRAMING}'})</summary>
          <textarea
            rows={4}
            value={prompts.framingProduct}
            onChange={(e) => setPrompt({ framingProduct: e.target.value })}
          />
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
          <summary>Valve blocks (auto-selected: no photo / one valve / two different valves)</summary>
          <label className="block-label">
            No valve photo (generic valves)
            <textarea
              rows={4}
              value={prompts.valvesGeneric}
              onChange={(e) => setPrompt({ valvesGeneric: e.target.value })}
            />
          </label>
          <label className="block-label">
            Valve photo: one valve (image [3])
            <textarea
              rows={4}
              value={prompts.valvesRefSingle}
              onChange={(e) => setPrompt({ valvesRefSingle: e.target.value })}
            />
          </label>
          <label className="block-label">
            Valve photo: two different valves (image [3])
            <textarea
              rows={5}
              value={prompts.valvesRefPair}
              onChange={(e) => setPrompt({ valvesRefPair: e.target.value })}
            />
          </label>
          <label className="block-label">
            Valve swap add-on: one valve (image [2])
            <textarea
              rows={3}
              value={prompts.swapRefSingle}
              onChange={(e) => setPrompt({ swapRefSingle: e.target.value })}
            />
          </label>
          <label className="block-label">
            Pair note (injected into every finish swap in "two valves" mode)
            <textarea
              rows={3}
              value={prompts.pairNote}
              onChange={(e) => setPrompt({ pairNote: e.target.value })}
            />
          </label>
          <label className="block-label">
            Valve swap add-on: two different valves (image [2])
            <textarea
              rows={3}
              value={prompts.swapRefPair}
              onChange={(e) => setPrompt({ swapRefPair: e.target.value })}
            />
          </label>
        </details>

        <details>
          <summary>Valve materials ({Object.keys(VALVES).length})</summary>
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

        <details>
          <summary>Auto-QA (verification & retry notes)</summary>
          <label className="block-label">
            QA check: full composition (counts sections + compares design with packshot)
            <textarea
              rows={6}
              value={prompts.verifyMaster}
              onChange={(e) => setPrompt({ verifyMaster: e.target.value })}
            />
          </label>
          <label className="block-label">
            QA check: swap frames (counts sections only)
            <textarea
              rows={4}
              value={prompts.verifyCount}
              onChange={(e) => setPrompt({ verifyCount: e.target.value })}
            />
          </label>
          <label className="block-label">
            Retry note: wrong section count ({'{GOT}'} / {'{SECTIONS}'} filled in automatically)
            <textarea
              rows={3}
              value={prompts.retryNoteCount}
              onChange={(e) => setPrompt({ retryNoteCount: e.target.value })}
            />
          </label>
          <label className="block-label">
            Retry note: design mismatch with packshot
            <textarea
              rows={3}
              value={prompts.retryNoteDesign}
              onChange={(e) => setPrompt({ retryNoteDesign: e.target.value })}
            />
          </label>
        </details>

        <div className="row">
          <button onClick={resetPrompts}>Restore defaults</button>
        </div>

          </div>
        </div>
      )}

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
              The radiator is transferred 1:1 from the packshot, so the section count comes from the packshot itself. Set this selector to MATCH the packshot: it steers only the Auto-QA check and the file names, not the generation.
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

        <label className="check qa-toggle">
          <input
            type="checkbox"
            checked={verifyOn}
            onChange={(e) => saveVerifyOn(e.target.checked)}
          />
          Auto-QA: verify each frame (section count + packshot design), auto-retry
          up to {QA_MAX_ATTEMPTS} attempts. Extra cost only when a frame fails QA.
          Uses the Gemini key for checking.
        </label>

        <div className="row">
          <button
            className="primary"
            onClick={runMaster}
            disabled={running || !packshot || !plate || totalCells === 0}
          >
            {running && !masterImg
              ? 'Generating master…'
              : masterImg
                ? 'Regenerate master frame'
                : '1. Generate master frame'}
          </button>
          <button
            className="primary"
            onClick={runVariants}
            disabled={running || !masterImg || totalCells < 2}
          >
            {running && masterImg
              ? `Generating variants… (${doneCount}/${totalCells})`
              : `2. Generate variants from master (${Math.max(totalCells - 1, 0)} images)`}
          </button>
          {running && (
            <button onClick={() => (cancelRef.current = true)}>Stop</button>
          )}
          {doneCount > 0 && !running && (
            <button onClick={downloadAll}>Download all (ZIP)</button>
          )}
        </div>
        <p className="hint">
          Step 1 composes the master: first selected finish with the first selected valve variant, straight from the packshot. Inspect it (section count, casting design, QA badge) and use Retry until it is right; every variant inherits its frame and geometry. Step 2 turns the approved master into the remaining finish and valve variants. Changing the packshot or the interior clears the master.
        </p>

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
                  {cell?.status === 'running' && (
                    <>
                      <div className="spinner" />
                      {cell.qa && <p className="qa-note">{cell.qa}</p>}
                    </>
                  )}
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
                      {cell.verify && (
                        <p className={`verify ${cell.verify.ok ? 'ok' : 'bad'}`}>
                          {cell.verify.ok
                            ? `✓ QA: ${cell.verify.want} sections confirmed${
                                cell.verify.designMatch ? ', design matches packshot' : ''
                              }${cell.verify.attempts > 1 ? ` (attempt ${cell.verify.attempts})` : ''}`
                            : `⚠ QA: best of ${cell.verify.attempts} attempts shows ${cell.verify.got} sections (wanted ${cell.verify.want})${
                                cell.verify.designMatch === false ? ' and misses the packshot design' : ''
                              }`}
                        </p>
                      )}
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
          QA before sending to the client: count the sections against the packshot, check that column depth, feet and surface decoration match the packshot (plain stays plain), both valves installed and connected, and the shadow direction consistent with the room light.
        </p>
      </footer>
    </div>
  )
}
