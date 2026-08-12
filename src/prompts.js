// ---------------------------------------------------------------------------
// Radiator Studio, domyślna biblioteka promptów (v3)
// Silnik: Gemini 2.5 Flash Image (Nano Banana)
// Zasada: model nie czyta negatywów, wszystkie zakazy pisane twierdząco.
//
// Wszystko poniżej to DOMYŚLNE wartości, edytowalne w UI (sekcja "Prompty"),
// edycje zapisują się w localStorage przeglądarki.
// Placeholdery: {FINISH} blok finiszu, {VALVE} materiał przyłączy,
// {SECTIONS} liczba sekcji, {WIDTH_MM} szerokość w mm.
//
// Wnętrze referencyjne ma dwa tory:
//  A) generowane w wybranym stylu: prompt = opis stylu + wspólny szkielet
//  B) własne zdjęcie: kompozycja używa szablonu agnostycznego (COMPOSE_OWN)
// ---------------------------------------------------------------------------

// --- Wspólny szkielet plate'a (dokleja się do opisu każdego stylu) ----------

export const PLATE_SCAFFOLD = `The wall directly beneath the window is completely empty and unobstructed. There is a clear, evenly lit stretch of bare wall and floor across the lower centre of the frame, roughly 1200 mm wide and 700 mm tall, with nothing standing in front of it. Two slim capped pipe stubs emerge from the floor close to the wall, ready for a radiator to be connected.

Bright, generous natural daylight floods in through the window, filling the room with soft luminous light. The exposure is airy and high-key in character: shadows are open and gentle, and no part of the frame falls into heavy darkness. Warm ambient bounce brightens every corner. No hard sun, no flash.

Shot on a full-frame camera with a 35 mm lens at f/5.6, camera at the height of the window sill, perfectly level, so all vertical lines stay vertical and there is no wide-angle distortion. Editorial interior photography in the style of World of Interiors: colour-accurate, natural contrast, no heavy grading. The image contains no text, no lettering and no graphic overlays.`

// --- 10 stylów wnętrz (opis pokoju, edytowalny per styl) --------------------

export const STYLES = [
  {
    key: 'classic-georgian',
    label: 'Classic Georgian',
    hint: 'Symetria, głębokie listwy przypodłogowe, wyważone sztukaterie, powściągliwa paleta, idealne proporcje.',
    prompt: `A photorealistic interior photograph of a room in a classic Georgian townhouse. Perfect classical proportions and symmetry: a tall sash window with slim glazing bars centred on the wall, refined restrained mouldings, panelled wall below dado height, a deep moulded skirting board, walls and joinery in a restrained chalky heritage palette of soft greys and putty tones, herringbone oak parquet, a soft linen curtain at the frame's edge. Calm, balanced and quietly grand.`,
  },
  {
    key: 'contemporary-georgian',
    label: 'Contemporary Georgian',
    hint: 'Czyste wykończenia, uproszczone sztukaterie, jaśniejsza paleta, nowoczesna elegancja w klasycznej architekturze.',
    prompt: `A photorealistic interior photograph of a room in a contemporary Georgian style. Classic Georgian architecture with crisp, clean finishes: a tall sash window, simplified mouldings and panelling, walls in a light warm off-white palette, smooth painted joinery, pale herringbone timber floor, an airy sheer linen curtain. Modern refinement within classical bones, bright, precise and uncluttered.`,
  },
  {
    key: 'georgian-heritage',
    label: 'Georgian Heritage',
    hint: 'Tradycyjny detal, panelowane glify, grubsze opaski okienne, historyczny charakter i głębia.',
    prompt: `A photorealistic interior photograph of a room in a Georgian heritage style. Traditional period detailing with real depth: a tall sash window set in a deep panelled reveal, thick architraves, a panelled door with brass hardware at the frame's edge, full-height wall panelling in a muted sage-green heritage colour, aged herringbone parquet. Historic character, layered joinery and a strong sense of age and craftsmanship.`,
  },
  {
    key: 'victorian-townhouse',
    label: 'Victorian Townhouse',
    hint: 'Ozdobne gzymsy, głębokie kolory, dekoracyjne listwy, bardziej opulentny i dramatyczny detal.',
    prompt: `A photorealistic interior photograph of a room in a Victorian townhouse. Opulent and dramatic period detailing: a tall sash window with brass fittings, ornate cornices, decorative trim, walls and panelling in a deep rich colour such as dark green, a subtly patterned wallpaper above the panelling, heavy patterned curtains with tasselled tiebacks, a dark wood side table, a gilt-framed painting, herringbone parquet. Rich, moody and atmospheric, yet elegant.`,
  },
  {
    key: 'edwardian',
    label: 'Edwardian',
    hint: 'Miększy niż wiktoriański: eleganckie sztukaterie, jaśniejsze kolory, lekkość i wdzięk.',
    prompt: `A photorealistic interior photograph of a room in an Edwardian style, softer than Victorian. A generous sash window letting in plenty of daylight, elegant but lighter mouldings, panelled wall in a soft warm neutral, gentle curtains, light timber floor. Gracious and airy, a period room with charm and lightness, naturally suited to contemporary life.`,
  },
  {
    key: 'english-country',
    label: 'English Country',
    hint: 'Swobodna, rustykalna elegancja, naturalne materiały, patyna, miękkie tkaniny i faktury.',
    prompt: `A photorealistic interior photograph of a room in a relaxed English country style. Rustic elegance and natural materials: a sash window with a deep sill, softly aged lime-washed or patinated plaster walls with visible texture, faded floral curtains, a small gilt-framed painting, warm timber floor with a woven natural-fibre rug. Everything gently worn and soft, aged finishes, lived-in warmth and quiet charm.`,
  },
  {
    key: 'modern-english-country',
    label: 'Modern English Country',
    hint: 'Spokojne kolory, naturalne tekstury, klasyczna architektura w swobodnym, współczesnym wydaniu.',
    prompt: `A photorealistic interior photograph of a room in a modern English country style. Classic architecture with a relaxed contemporary country feel: a sash window with a vase of garden flowers on the sill, calm putty and off-white colours, simple linen curtains, framed prints on the wall, a rustic antique chair, natural textures, a woven jute rug on a pale timber floor. Fresh, calm, warm and unpretentious.`,
  },
  {
    key: 'arts-and-crafts',
    label: 'Arts & Crafts',
    hint: 'Rzemiosło, bogate drewno, fakturowane powierzchnie, ziemiste kolory, detale rękodzielnicze.',
    prompt: `A photorealistic interior photograph of a room in the English Arts and Crafts spirit. Craftsmanship and rich woods: a sash window with a small stained-glass panel detail, handsome oak joinery and warm timber panelling, walls in an earthy sage green, an antique handcrafted chair, a patterned rug with earthy reds on aged parquet, textured artisan surfaces throughout. Honest materials, warm earthy colours and visible hand-made quality.`,
  },
  {
    key: 'british-new-traditional',
    label: 'British New Traditional',
    hint: 'Powściągliwie i ponadczasowo: neutralna paleta, klasyczny szkielet architektury, minimum dekoracji.',
    prompt: `A photorealistic interior photograph of a room in a British new traditional style. Understated and timeless: classic architectural bones, a tall sash window, refined panelling and cornicing, but a strictly neutral palette of soft whites and pale greys, minimal decoration, one simple linen curtain, clean uncluttered surfaces. Quiet, precise, "London interior designer" restraint within period architecture.`,
  },
  {
    key: 'london-eclectic',
    label: 'London Eclectic Heritage',
    hint: 'Warstwy i kolekcje: różne epoki, sztuka, książki, indywidualny charakter.',
    prompt: `A photorealistic interior photograph of a room in a London eclectic heritage style. Layered, collected and characterful: a tall sash window, a bookcase filled with well-read books beside it, gilt-framed paintings of mixed periods leaning against the wall and hung salon-style, a rich Persian rug on aged parquet, mixed eras of furniture and art that feel personally collected over years. Individual, cultured and full of character, yet composed.`,
  },
]

// --- Warianty przyłączy (zawory + rurki) ------------------------------------

export const VALVES = {
  silver: {
    key: 'silver',
    label: 'Srebrne przyłącza',
    material:
      'polished silver nickel-chrome, a cool bright silver metal with crisp, clean specular reflections',
  },
  gold: {
    key: 'gold',
    label: 'Złote przyłącza',
    material:
      'polished brass with a warm golden tone, softly gleaming gold metal with warm reflections',
  },
}

// --- 6 finiszy: bloki materiałowe, nie kolory --------------------------------

export const FINISHES = [
  {
    key: 'matt-black',
    label: 'Matt Black',
    block: `A dead flat matt black powder coat with zero gloss. The surface absorbs light completely, producing no specular highlights and no sheen anywhere on the casting. The form is legible only through soft tonal gradation across the curved columns and the darkness pooling in the ornamental relief. A neutral graphite black, neither blue-black nor brown-black.`,
  },
  {
    key: 'gunmetal-grey',
    label: 'Gunmetal Grey',
    block: `A deep warm charcoal-grey metallic coating with a fine low-key shimmer in the pigment. Broad, soft, diffuse highlights run down the front crest of each column where the daylight catches them, falling away to near black in the recesses between the columns. It reads unmistakably as coated metal, industrial and refined, never as flat grey plastic.`,
  },
  {
    key: 'satin-black',
    label: 'Satin Black',
    block: `A soft-sheen black lacquer at roughly 30 percent gloss. Narrow, clean, elongated highlights run vertically down the front crest of every column, and the raised scrollwork catches thin bright edge-light along its topmost edges. Deep black in shadow, silky and gently reflective in the light. It is not glossy and it shows no mirror reflections of the room.`,
  },
  {
    key: 'antique-bronze',
    label: 'Antique Bronze',
    block: `A hand-highlighted antique bronze patina. A dark chocolate-brown metallic base coat, with warm burnished gold and copper highlight rubbed by hand onto every raised edge: the crest of each column, the top and bottom collars, the full length of the ornamental scrollwork, and the curved feet. The recesses, the ground of the ornament and the gaps between the columns stay deep and dark brown. The contrast between the bright rubbed edges and the dark recesses is the entire character of this finish and must be strong, so the ornament reads sculpturally. Rich, aged, warm and luminous where the daylight strikes it. It is never a uniform flat brown.`,
  },
  {
    key: 'cream-white',
    label: 'Cream White',
    block: `A warm off-white eggshell paint with a soft low sheen, in the register of old lime plaster and aged French painted furniture. Faintly creamy and yellow-warm rather than cold, blue or brilliant white. Gentle grey-lilac shadows settle into the ornamental relief and between the columns, keeping every piece of casting detail legible against the wall behind it. A painted-furniture look, calm and understated.`,
  },
  {
    key: 'base-coat',
    label: 'Base Coat Only',
    block: `The bare factory base coat, unpainted. A uniform matte mid-grey primer straight from the foundry, slightly chalky and dry, with subtly uneven coverage and the faint texture of the casting surface showing through. Utilitarian and raw, with no sheen and no decorative finish. It looks like a product awaiting its final paint, honest and workshop-like, not distressed and not rusty.`,
  },
]

// --- Warianty szerokości: liczba sekcji --------------------------------------

export const SECTION_VARIANTS = [
  { sections: 4, width: 362, btu: 1652 },
  { sections: 6, width: 518, btu: 2478 },
  { sections: 8, width: 674, btu: 3304 },
  { sections: 10, width: 830, btu: 4127 },
  { sections: 12, width: 986, btu: 4956 },
  { sections: 14, width: 1142, btu: 5782 },
]

// --- Wspólne fragmenty szablonów kompozycji ----------------------------------

const PRODUCT_PARA = `Image [2] is the single source of truth for the radiator's design AND its proportions. Copy it one to one: the silhouette, the real height-to-width proportions of a single section, the exact profile and curvature of the columns, the shape of the top and bottom collars, the raised ornamental scrollwork cast into every single section, the shape of the decorative feet, and the round valve bosses at the bottom outer corners. Do not redesign, modernise, simplify, slim down, squash, shorten or stylise any part of it, and do not omit the ornament on any section; every section carries the same raised relief pattern as in image [2]. The ONLY permitted deviation from image [2] is the number of sections: build the radiator with exactly {SECTIONS} evenly spaced identical sections, approximately {WIDTH_MM} mm wide in total, while each individual section stays exactly as in image [2]. It is a sectional cast iron column radiator, exactly two columns deep, with a slim front-to-back profile.`

const VALVES_PARA = `There are exactly two valves, one at each bottom outer corner of the radiator, never one and never more than two. Each valve stands on its own pipe coming vertically out of the floor and joins the radiator at the bottom of its end section, the left valve at the left end, the right valve at the right end. Both valves are identical in style and size, and both are fully connected, nothing floats loose in the room. Both valves and their visible pipework are made of {VALVE}. The valve metal contrasts cleanly with the radiator body.`

const LIGHT_PARA = `Integrate the radiator into the photograph seamlessly. Follow the direction and character of the daylight already present in image [1], and keep the scene bright, airy and generously lit, with open, luminous shadows rather than heavy darkness. The light rakes across the front of the radiator at a low angle and catches every raised detail of the casting, so the ornamental scrollwork on each section reads crisply and sculpturally, never sinking into shadow; there is full visible detail even in the darkest areas of the radiator. Cast a soft shadow along the floor consistent with the room's light, and a tight contact shadow under each of the four feet, with a visible gap of light beneath the body of the radiator. Add a faint warm bounce from the floor onto the lower edges of the casting. Match the grain, colour temperature and depth of field of image [1] so the radiator reads as if it had been in the original photograph all along.`

// --- KROK 2a: kompozycja dla WNĘTRZA GENEROWANEGO (plate ze stylu) ----------
// Plate ze szkieletu zawsze ma okno, pustą ścianę i rurki, więc szablon może
// się do nich odwoływać wprost.

export const COMPOSE_STYLED = `Image [1] is a photograph of an interior. Image [2] is a product reference photo of a cast iron radiator. EDIT IMAGE [1]: add the radiator from image [2] into the photograph, standing on the floor against the wall directly beneath the window. This is an edit of image [1], not a new scene.

${PRODUCT_PARA}

Preserve the radiator's real height and proportions from image [2]; do not scale, squash or stretch it to fit the space, the room accommodates the radiator, not the other way round. It stands beneath the window, and it is rendered at an angle consistent with the camera perspective of image [1], so the two-column depth is readable.

Connect the radiator to the two pipes rising from the floor using a pair of traditional angled radiator valves. ${VALVES_PARA}

Everything else in image [1] stays exactly as it is: the walls, the window, the floor, every piece of furniture and every object, the framing, the camera position and the lens perspective. The result must be instantly recognisable as the same photograph with one addition: the radiator and its two valves.

${LIGHT_PARA}

The finish of the radiator body: {FINISH}`

// --- KROK 2b: kompozycja dla WŁASNEGO ZDJĘCIA (wnętrze dowolne) --------------
// Zero założeń o pokoju: bez okna, bez parkietu, bez kierunku światła.

export const COMPOSE_OWN = `Image [1] is a photograph of a real room. Image [2] is a product reference photo of a cast iron radiator. EDIT IMAGE [1]: add the radiator from image [2] into the photograph. It stands on the floor against a clear stretch of wall visible in image [1]: beneath the window if there is one, otherwise in the most natural empty spot for a radiator. This is an edit of the photograph, not a new scene.

${PRODUCT_PARA}

Preserve the radiator's real height and proportions from image [2]; do not scale, squash or stretch it to fit the space, the room accommodates the radiator, not the other way round. It stands at an angle consistent with the camera perspective of image [1].

Connect the radiator to two pipes rising vertically out of the floor; if no pipes are visible in image [1], add them discreetly at the radiator's bottom outer corners. ${VALVES_PARA}

THE PHOTOGRAPH IS NOT YOURS TO CHANGE. Everything in image [1] apart from the added radiator stays pixel-faithful and instantly recognisable as the same place: the same walls, the same windows, the same floor, every piece of furniture and every object, the same framing, the same camera position and the same lens perspective. Do not replace the room, do not restyle it, do not tidy it, do not invent a different interior. The only change is the radiator with its two valves added against the wall.

${LIGHT_PARA}

The finish of the radiator body: {FINISH}`

// --- KROK 3a: swap finiszu (z kadru master) ----------------------------------

export const FINISH_SWAP_TEMPLATE = `Keep everything in this image absolutely identical: the room, the camera angle, the framing, the lighting, the shadows, the valves and pipework, and the radiator's exact geometry, its section count, its position in the room and all of its casting detail. Change only the surface finish of the radiator body to the following, re-rendering its highlights, sheen and shadows so they are physically correct for the new material:

{FINISH}`

// --- KROK 3b: swap przyłączy (z gotowego kadru) -------------------------------

export const VALVE_SWAP_TEMPLATE = `Keep everything in this image absolutely identical: the room, the camera, the framing, the lighting, the radiator, its finish, its geometry, its section count and all of its casting detail. The radiator has exactly two valves, one at each bottom outer corner, each standing on its own pipe rising from the floor and connected to the radiator. Change only the material of these two valves and their visible pipework to {VALVE}. Re-render the reflections and highlights on the valves and pipes so they are physically correct for that metal, and keep their shape, size and position exactly as they are. Do not add, remove or move any valve.`
