# Radiator Studio

Aplikacja do generowania serii wizualizacji radiatora w jednym wnętrzu referencyjnym: 6 finiszy (Matt Black, Gunmetal Grey, Satin Black, Antique Bronze, Cream White, Base Coat Only), każdy w 2 wariantach przyłączy (srebrne lub złote). Architektura wzorowana na Lemoné Blog Studio: React/Vite na GitHub Pages, Cloudflare Worker jako proxy do API. Silnik obrazkowy: Gemini 2.5 Flash Image (Nano Banana).

## Jak działa pipeline

1. **Packshot**: wgrywasz zdjęcie produktowe ze sklepu. To źródło geometrii odlewu, prompt zakazuje modelowi jej zmieniania.
2. **Scene plate**: puste wnętrze Kings Road generowane raz (prompt edytowalny w UI) albo wgrane własne. Jeden plate dla całej serii, to on gwarantuje spójność.
3. **Seria**: dla każdego finiszu pełna kompozycja packshot + plate z pierwszym wariantem przyłączy, a drugi wariant powstaje przez edycję gotowego kadru (swap samych zaworów). Dzięki temu oba warianty przyłączy dzielą identyczny kadr, a liczba pełnych generacji spada o połowę.

Wyniki: podgląd w siatce, pobieranie pojedynczo lub całość jako ZIP. Nazewnictwo plików: `radiator_{finisz}__{przyłącza}.png`.

## Deploy

### 1. Worker (backend)

```bash
cd worker
npx wrangler login
npx wrangler secret put GEMINI_API_KEY   # wklej klucz z Google AI Studio
npx wrangler deploy
```

Zanotuj adres, np. `https://radiator-studio.twoj-worker.workers.dev`.

Po deployu frontu odkomentuj `ALLOWED_ORIGIN` w `wrangler.toml` i wpisz adres GitHub Pages, potem `npx wrangler deploy` ponownie. Bez tego Worker odpowiada każdemu originowi, a klucz płaci za wszystkich.

### 2. Frontend

```bash
npm install
npm run dev        # lokalnie: http://localhost:5173
```

GitHub Pages: wypchnij repo na GitHub, w Settings → Pages ustaw Source na "GitHub Actions". Workflow `.github/workflows/deploy.yml` buduje i publikuje przy każdym pushu na `main`. W `vite.config.js` `base` jest ustawione na `'./'`, działa na Pages bez zmian.

W aplikacji, w sekcji Ustawienia, wklej adres Workera (zapisuje się w localStorage).

## Ograniczenia silnika, których nie naprawi kod

- **Rozdzielczość ~1 MP** w bazowym modelu. Do druku potrzebny upscale (Topaz, Magnific) albo wariant Pro.
- **SynthID**: każdy output ma niewidoczny watermark Google, wykrywalny narzędziami.
- **Brak negative promptu**: wszystkie zakazy w promptach są sformułowane twierdząco, nie zmieniaj ich na "no X".
- Model bywa niedeterministyczny: przycisk "Ponów" przy każdym kadrze robi pełną kompozycję od nowa.

## QA przed wysyłką do klienta

Odrzuć kadr, jeśli: liczba sekcji inna niż na packshocie (policz), widać 3+ kolumny w głąb, grzejnik wyższy niż ~1/3 okna, ornament na środkowych sekcjach, nóżki proste albo ich brak, cień niezgodny ze światłem z okna, przyłącza w innym metalu niż zadeklarowany.

## Struktura

```
src/prompts.js    # cała biblioteka promptów: plate, kompozycja, swapy
src/api.js        # klient Workera
src/App.jsx       # UI i kolejka generacji
worker/worker.js  # proxy Gemini z kluczem w secrets
```
