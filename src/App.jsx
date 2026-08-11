import { useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import {
  PLATE_PROMPT,
  FINISHES,
  VALVES,
  composePrompt,
  valveSwapPrompt,
} from './prompts.js'
import { generateImage, getWorkerUrl, setWorkerUrl } from './api.js'

// ---------------------------------------------------------------------------

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

function download(dataUrl, name) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = name
  a.click()
}

const cellId = (finishKey, valveKey) => `${finishKey}__${valveKey}`

// ---------------------------------------------------------------------------

export default function App() {
  const [workerUrl, setWorkerUrlState] = useState(getWorkerUrl())
  const [packshot, setPackshot] = useState(null)
  const [plate, setPlate] = useState(null)
  const [platePrompt, setPlatePrompt] = useState(PLATE_PROMPT)
  const [plateBusy, setPlateBusy] = useState(false)

  const [selFinishes, setSelFinishes] = useState(FINISHES.map((f) => f.key))
  const [selValves, setSelValves] = useState(['silver', 'gold'])

  // cells: { [id]: {status: 'pending'|'running'|'done'|'error', img, error} }
  const [cells, setCells] = useState({})
  const [running, setRunning] = useState(false)
  const cancelRef = useRef(false)

  const patchCell = (id, patch) =>
    setCells((c) => ({ ...c, [id]: { ...(c[id] || {}), ...patch } }))

  // --- ustawienia ----------------------------------------------------------

  const saveWorker = (v) => {
    setWorkerUrlState(v)
    setWorkerUrl(v)
  }

  // --- plate ---------------------------------------------------------------

  const generatePlate = async () => {
    setPlateBusy(true)
    try {
      setPlate(await generateImage(platePrompt, []))
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
    // To trzyma spójność: oba warianty przyłączy dzielą identyczny kadr.
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

    const init = {}
    for (const p of plan)
      for (const v of p.valveOrder)
        init[cellId(p.finishKey, v)] = { status: 'pending' }
    setCells(init)

    for (const p of plan) {
      if (cancelRef.current) break
      const finish = FINISHES.find((f) => f.key === p.finishKey)
      const [firstValve, secondValve] = p.valveOrder
      let masterImg = null

      // 1) pełna kompozycja: packshot + plate
      const firstId = cellId(finish.key, firstValve)
      patchCell(firstId, { status: 'running' })
      try {
        masterImg = await generateImage(
          composePrompt(finish.block, VALVES[firstValve].material),
          [packshot, plate],
        )
        patchCell(firstId, { status: 'done', img: masterImg })
      } catch (e) {
        patchCell(firstId, { status: 'error', error: e.message })
        // bez mastera nie ma z czego swapować drugiego wariantu
        if (secondValve)
          patchCell(cellId(finish.key, secondValve), {
            status: 'error',
            error: 'Pominięto: brak kadru bazowego dla tego finiszu.',
          })
        continue
      }

      // 2) swap przyłączy z gotowego kadru
      if (secondValve && !cancelRef.current) {
        const secondId = cellId(finish.key, secondValve)
        patchCell(secondId, { status: 'running' })
        try {
          const img = await generateImage(
            valveSwapPrompt(VALVES[secondValve].material),
            [masterImg],
          )
          patchCell(secondId, { status: 'done', img })
        } catch (e) {
          patchCell(secondId, { status: 'error', error: e.message })
        }
      }
    }
    setRunning(false)
  }

  const retryCell = async (finishKey, valveKey) => {
    const finish = FINISHES.find((f) => f.key === finishKey)
    const id = cellId(finishKey, valveKey)
    patchCell(id, { status: 'running', error: null })
    try {
      const img = await generateImage(
        composePrompt(finish.block, VALVES[valveKey].material),
        [packshot, plate],
      )
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
      zip.file(`radiator_${id}.png`, base64, { base64: true })
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
        <h1>Radiator Studio</h1>
        <p className="sub">
          Jedno wnętrze referencyjne, 6 finiszy, srebrne lub złote przyłącza.
          Silnik: Gemini 2.5 Flash Image.
        </p>
      </header>

      <section className="card">
        <h2>Ustawienia</h2>
        <label>
          Adres Cloudflare Workera
          <input
            type="url"
            placeholder="https://radiator-studio.twoj-worker.workers.dev"
            value={workerUrl}
            onChange={(e) => saveWorker(e.target.value)}
          />
        </label>
      </section>

      <section className="card">
        <h2>Krok 1: Packshot produktu</h2>
        <p className="hint">
          Zdjęcie produktowe ze sklepu, najlepiej wycięte na białym tle. To jest
          źródło geometrii odlewu, model ma zakaz jej zmieniania.
        </p>
        <input
          type="file"
          accept="image/*"
          onChange={async (e) =>
            e.target.files[0] && setPackshot(await fileToDataUrl(e.target.files[0]))
          }
        />
        {packshot && <img className="preview" src={packshot} alt="Packshot" />}
      </section>

      <section className="card">
        <h2>Krok 2: Wnętrze referencyjne (scene plate)</h2>
        <p className="hint">
          Generowane raz i używane dla całej serii, to gwarantuje, że wszystkie
          warianty wyglądają na jedną sesję. Możesz też wgrać własne.
        </p>
        <details>
          <summary>Prompt wnętrza (edytowalny)</summary>
          <textarea
            rows={10}
            value={platePrompt}
            onChange={(e) => setPlatePrompt(e.target.value)}
          />
        </details>
        <div className="row">
          <button onClick={generatePlate} disabled={plateBusy}>
            {plateBusy ? 'Generuję wnętrze…' : 'Generuj wnętrze'}
          </button>
          <label className="upload-btn">
            Wgraj własne
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) =>
                e.target.files[0] && setPlate(await fileToDataUrl(e.target.files[0]))
              }
            />
          </label>
        </div>
        {plate && <img className="preview wide" src={plate} alt="Scene plate" />}
      </section>

      <section className="card">
        <h2>Krok 3: Seria wariantów</h2>
        <div className="pickers">
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
                      <img src={cell.img} alt={id} />
                      <div className="row">
                        <button onClick={() => download(cell.img, `radiator_${id}.png`)}>
                          Pobierz
                        </button>
                        <button onClick={() => retryCell(p.finishKey, v)}>Ponów</button>
                      </div>
                    </>
                  )}
                </div>
              )
            }),
          )}
        </div>
      </section>

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
