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

// Kadr PRODUKTOWY: strefa pod parapetem wypełnia PRAWIE CAŁĄ ramkę.
export const PLATE_SCAFFOLD_PRODUCT = `The composition is an extremely tight, product-focused close-up of the wall directly beneath the window sill. The empty stretch of bare wall under the sill fills almost the entire frame, about 90 percent of it: the sill itself is only a thin band along the very top edge of the frame, a narrow strip of floor shows along the very bottom edge, and the sides of the frame are the wall itself, with no surrounding room visible at all. The wall beneath the window is completely empty and unobstructed, and the floor along it is completely clean and bare: no pipes, no pipe stubs, no fittings and no radiator hardware of any kind.

Bright, generous natural daylight falls from the window above, filling the space with soft luminous light. The exposure is airy and high-key in character: shadows are open and gentle, and no part of the frame falls into heavy darkness. No hard sun, no flash.

Shot on a full-frame camera with an 85 mm lens at f/8 from about 1 metre away, camera at the mid-height of the under-sill zone, perfectly level, so all vertical lines stay vertical and there is no distortion. Everything is critically sharp across the whole frame at near-macro detail: the grain of the plaster, the brush marks in the paint on the skirting, the grain of the floor are all clearly resolved. Editorial product photography in an interior: colour-accurate, natural contrast, no heavy grading. The image contains no text, no lettering and no graphic overlays.`

// --- Plate z MINIATURY stylu (miniatura = obraz [1], v5.4) -------------------
// Miniatura kafelka jest referencją generacji, żeby wynik odpowiadał temu,
// co user widzi i wybiera. Fallback na tor tekstowy, gdy miniatury brak.

export const PLATE_FROM_THUMB_PRODUCT = `Image [1] is the reference photograph of an interior. Render THE SAME room, but photographed as an extremely tight close-up of the wall directly beneath the window sill: the camera has moved to about 1 metre from that wall, at the mid-height of the under-sill zone, perfectly level. The empty stretch of bare wall under the sill fills almost the entire frame, about 90 percent of it; the sill itself is only a thin band along the very top edge, a narrow strip of floor shows along the very bottom edge, and the sides of the frame are the wall itself. Every material, colour and detail visible in this close-up comes from image [1]: the same wall finish and panelling, the same skirting board, the same sill and window joinery, the same floor material, the same curtains if they reach into frame, the same daylight character. The wall beneath the sill and the floor along it are completely empty and clean: no radiator, no pipes, no pipe stubs, no fittings and no objects standing against that wall. Bright, generous daylight, airy high-key exposure, open gentle shadows. Everything is critically sharp at near-macro detail. The image contains no text, no lettering and no graphic overlays.`

// --- 10 stylów wnętrz (opis pokoju, edytowalny per styl) --------------------

export const STYLES = [
  {
    key: 'classic-georgian',
    label: 'Classic Georgian',
    hint: 'Symmetry, deep skirting, refined mouldings, restrained palette, perfect proportions.',
    prompt: `A photorealistic interior photograph of a room in a classic Georgian townhouse. Perfect classical proportions and symmetry: a tall sash window with slim glazing bars centred on the wall, refined restrained mouldings, panelled wall below dado height, a deep moulded skirting board, walls and joinery in a restrained chalky heritage palette of soft greys and putty tones, herringbone oak parquet, a soft linen curtain at the frame's edge. Calm, balanced and quietly grand.`,
  },
  {
    key: 'contemporary-georgian',
    label: 'Contemporary Georgian',
    hint: 'Crisp, clean finishes, simplified mouldings, lighter palette, modern refinement within classic architecture.',
    prompt: `A photorealistic interior photograph of a room in a contemporary Georgian style. Classic Georgian architecture with crisp, clean finishes: a tall sash window, simplified mouldings and panelling, walls in a light warm off-white palette, smooth painted joinery, pale herringbone timber floor, an airy sheer linen curtain. Modern refinement within classical bones, bright, precise and uncluttered.`,
  },
  {
    key: 'georgian-heritage',
    label: 'Georgian Heritage',
    hint: 'Traditional detailing, panelled reveals, thicker architraves, historic character and depth.',
    prompt: `A photorealistic interior photograph of a room in a Georgian heritage style. Traditional period detailing with real depth: a tall sash window set in a deep panelled reveal, thick architraves, a panelled door with brass hardware at the frame's edge, full-height wall panelling in a muted sage-green heritage colour, aged herringbone parquet. Historic character, layered joinery and a strong sense of age and craftsmanship.`,
  },
  {
    key: 'victorian-townhouse',
    label: 'Victorian Townhouse',
    hint: 'Ornate cornices, rich colours, decorative trim, more opulent and dramatic detailing.',
    prompt: `A photorealistic interior photograph of a room in a Victorian townhouse. Opulent and dramatic period detailing: a tall sash window with brass fittings, ornate cornices, decorative trim, walls and panelling in a deep rich colour such as dark green, a subtly patterned wallpaper above the panelling, heavy patterned curtains with tasselled tiebacks, a dark wood side table, a gilt-framed painting, herringbone parquet. Rich, moody and atmospheric, yet elegant.`,
  },
  {
    key: 'edwardian',
    label: 'Edwardian',
    hint: 'Softer than Victorian: elegant mouldings, lighter colours, gracious and airy feel.',
    prompt: `A photorealistic interior photograph of a room in an Edwardian style, softer than Victorian. A generous sash window letting in plenty of daylight, elegant but lighter mouldings, panelled wall in a soft warm neutral, gentle curtains, light timber floor. Gracious and airy, a period room with charm and lightness, naturally suited to contemporary life.`,
  },
  {
    key: 'english-country',
    label: 'English Country',
    hint: 'Relaxed, rustic elegance, natural materials, aged finishes, soft fabrics and textures.',
    prompt: `A photorealistic interior photograph of a room in a relaxed English country style. Rustic elegance and natural materials: a sash window with a deep sill, softly aged lime-washed or patinated plaster walls with visible texture, faded floral curtains, a small gilt-framed painting, warm timber floor with a woven natural-fibre rug. Everything gently worn and soft, aged finishes, lived-in warmth and quiet charm.`,
  },
  {
    key: 'modern-english-country',
    label: 'Modern English Country',
    hint: 'Calm colours, natural textures, classic architecture with a relaxed, contemporary country feel.',
    prompt: `A photorealistic interior photograph of a room in a modern English country style. Classic architecture with a relaxed contemporary country feel: a sash window with a vase of garden flowers on the sill, calm putty and off-white colours, simple linen curtains, framed prints on the wall, a rustic antique chair, natural textures, a woven jute rug on a pale timber floor. Fresh, calm, warm and unpretentious.`,
  },
  {
    key: 'arts-and-crafts',
    label: 'Arts & Crafts',
    hint: 'Craftsmanship, rich woods, textured surfaces, earthy colours, artisan details.',
    prompt: `A photorealistic interior photograph of a room in the English Arts and Crafts spirit. Craftsmanship and rich woods: a sash window with a small stained-glass panel detail, handsome oak joinery and warm timber panelling, walls in an earthy sage green, an antique handcrafted chair, a patterned rug with earthy reds on aged parquet, textured artisan surfaces throughout. Honest materials, warm earthy colours and visible hand-made quality.`,
  },
  {
    key: 'british-new-traditional',
    label: 'British New Traditional',
    hint: 'Understated, timeless: neutral palette, classic architectural bones, minimal decoration.',
    prompt: `A photorealistic interior photograph of a room in a British new traditional style. Understated and timeless: classic architectural bones, a tall sash window, refined panelling and cornicing, but a strictly neutral palette of soft whites and pale greys, minimal decoration, one simple linen curtain, clean uncluttered surfaces. Quiet, precise, "London interior designer" restraint within period architecture.`,
  },
  {
    key: 'london-eclectic',
    label: 'London Eclectic Heritage',
    hint: 'Layered, collected, characterful: mixed periods, art, books and individuality.',
    prompt: `A photorealistic interior photograph of a room in a London eclectic heritage style. Layered, collected and characterful: a tall sash window, a bookcase filled with well-read books beside it, gilt-framed paintings of mixed periods leaning against the wall and hung salon-style, a rich Persian rug on aged parquet, mixed eras of furniture and art that feel personally collected over years. Individual, cultured and full of character, yet composed.`,
  },
]

// --- Warianty przyłączy (zawory + rurki) ------------------------------------

export const VALVES = {
  silver: {
    key: 'silver',
    label: 'Silver valves',
    material:
      'polished silver nickel-chrome, a cool bright silver metal with crisp, clean specular reflections',
  },
  gold: {
    key: 'gold',
    label: 'Gold valves',
    material:
      'polished brass with a warm golden tone, softly gleaming gold metal with warm reflections',
  },
  'antique-brass': {
    key: 'antique-brass',
    label: 'Antique brass valves',
    material:
      'aged, unlacquered antique brass with a warm golden-brown patina: a muted, softly tarnished glow rather than polish, slightly darker in the recesses and around the fittings',
  },
  'satin-nickel': {
    key: 'satin-nickel',
    label: 'Satin nickel valves',
    material:
      'brushed satin nickel, a soft warm-grey silver metal with a fine brushed texture and a gentle diffuse sheen, no mirror-like reflections',
  },
}

// --- 6 finiszy: bloki materiałowe, nie kolory --------------------------------

export const FINISHES = [
  {
    key: 'matt-black',
    label: 'Matt Black',
    block: `A dead flat matt black powder coat with zero gloss. The surface absorbs light completely, producing no specular highlights and no sheen anywhere on the casting. The form is legible only through soft tonal gradation across the curved columns and the darkness pooling in the recesses of the casting. A neutral graphite black, neither blue-black nor brown-black.`,
  },
  {
    key: 'gunmetal-grey',
    label: 'Gunmetal Grey',
    block: `A deep warm charcoal-grey metallic coating with a fine low-key shimmer in the pigment. Broad, soft, diffuse highlights run down the front crest of each column where the daylight catches them, falling away to near black in the recesses between the columns. It reads unmistakably as coated metal, industrial and refined, never as flat grey plastic.`,
  },
  {
    key: 'satin-black',
    label: 'Satin Black',
    block: `A soft-sheen black lacquer at roughly 30 percent gloss. Narrow, clean, elongated highlights run vertically down the front crest of every column, and any raised detail of the casting catches thin bright edge-light along its topmost edges. Deep black in shadow, silky and gently reflective in the light. It is not glossy and it shows no mirror reflections of the room.`,
  },
  {
    key: 'antique-bronze',
    label: 'Antique Bronze',
    block: `A hand-highlighted antique bronze patina. A dark chocolate-brown metallic base coat, with warm burnished gold and copper highlight rubbed by hand onto every raised edge of the casting: the crest of each column, the top and bottom collars, any raised detail the casting carries, and the feet. The recesses and the gaps between the columns stay deep and dark brown. The contrast between the bright rubbed edges and the dark recesses is the entire character of this finish and must be strong, so the relief of the casting reads sculpturally. Rich, aged, warm and luminous where the daylight strikes it. It is never a uniform flat brown.`,
  },
  {
    key: 'cream-white',
    label: 'Cream White',
    block: `A warm off-white eggshell paint with a soft low sheen, in the register of old lime plaster and aged French painted furniture. Faintly creamy and yellow-warm rather than cold, blue or brilliant white. Gentle grey-lilac shadows settle into the recesses of the casting and between the columns, keeping every piece of casting detail legible against the wall behind it. A painted-furniture look, calm and understated.`,
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

const PRODUCT_PARA = `THE RADIATOR HAS EXACTLY {SECTIONS} ({SECTIONS_WORD}) SECTIONS. {SECTIONS_ENUM} The section count comes ONLY from this instruction. Image [2] may show a radiator with a different number of sections; its count carries no weight at all, only its design does.

For everything else, image [2] is the single source of truth for the radiator's design AND its proportions. Copy one to one: the silhouette, the real height-to-width proportions of a SINGLE section, the exact profile and curvature of the columns, the shape of the top and bottom collars, the shape of its feet, and the valve bosses at the bottom outer corners. The surface decoration comes ONLY from image [2]: if the sections in image [2] carry raised ornament, reproduce that ornament identically on the corresponding sections; if the sections in image [2] are plain and smooth, render them plain and smooth, with no engraving, relief, pattern or decoration added anywhere. Do not redesign, modernise, simplify, slim down, squash, shorten or stylise any part of it. Build the radiator by repeating the single-section design from image [2] exactly {SECTIONS} times, evenly spaced, approximately {WIDTH_MM} mm wide in total: {WIDTH_NOTE} It is a sectional cast iron column radiator; the number of columns in depth, and the front-to-back profile, follow image [2] exactly.`

// --- Bloki zaworów: wybierane AUTOMATYCZNIE przez appkę --------------------
// generic: brak zdjęcia zaworu; refSingle: zdjęcie z jednym zaworem;
// refPair: zdjęcie z DWOMA różnymi zaworami (pokrętło + lockshield).
// Zdjęcie zaworu = image [3] w kompozycji.

export const VALVES_GENERIC = `There are exactly two valves, one at each bottom outer corner of the radiator, never one and never more than two. Each valve stands on its own pipe coming vertically out of the floor and joins the radiator at the bottom of its end section, the left valve at the left end, the right valve at the right end. Both valves are identical in style and size, and both are fully connected, nothing floats loose in the room. Both valves and their visible pipework are made of {VALVE}. The valve metal contrasts cleanly with the radiator body.`

export const VALVES_REF_SINGLE = `There are exactly two valves, one at each bottom outer corner of the radiator, never one and never more than two. Image [3] is the exact product reference for the valves: copy the valve design from image [3] one to one, its body shape, handwheel, spindle and fittings, and both corners use this same design. Each valve stands on its own pipe coming vertically out of the floor and joins the radiator at the bottom of its end section; both are fully connected, nothing floats loose in the room. Both valves and their visible pipework are made of {VALVE}; relative to image [3], change only the metal finish. The valve metal contrasts cleanly with the radiator body. Image [3] shows the valves as loose, uninstalled product photos; in the scene each valve is INSTALLED in its working position: rotated so its union is fully threaded into the radiator's bottom side connection, with no open threads and no unconnected outlets visible anywhere, the pipe running from the valve straight down into the floor, and the handwheel or cap pointing upright. Keep realistic plumbing scale: a valve is small next to the radiator, roughly the height of the radiator's bottom collar.`

export const VALVES_REF_PAIR = `There are exactly two valves, one at each bottom outer corner of the radiator, never one and never more than two. Image [3] shows both of them, and the two valves are DIFFERENT from each other by design: the LEFT corner has the control valve with the round handwheel from image [3], and the RIGHT corner has the plain lockshield valve from image [3]; this pairing stays the same in every image. Copy each valve's design from image [3] one to one, its body shape, spindle and fittings. Each valve stands on its own pipe coming vertically out of the floor and joins the radiator at the bottom of its end section; both are fully connected, nothing floats loose in the room. Both valves and their visible pipework are made of {VALVE}; relative to image [3], change only the metal finish. The valve metal contrasts cleanly with the radiator body. Image [3] shows the valves as loose, uninstalled product photos; in the scene each valve is INSTALLED in its working position: rotated so its union is fully threaded into the radiator's bottom side connection, with no open threads and no unconnected outlets visible anywhere, the pipe running from the valve straight down into the floor, and the handwheel or cap pointing upright. Keep realistic plumbing scale: a valve is small next to the radiator, roughly the height of the radiator's bottom collar.`


const LIGHT_PARA = `Integrate the radiator into the photograph seamlessly. Follow the direction and character of the daylight already present in image [1], and keep the scene bright, airy and generously lit, with open, luminous shadows rather than heavy darkness. The light rakes across the front of the radiator at a low angle and catches every raised detail of the casting, so every raised detail of the casting reads crisply and sculpturally, never sinking into shadow; there is full visible detail even in the darkest areas of the radiator. Cast a soft shadow along the floor consistent with the room's light, and a tight contact shadow under each of its feet, with a visible gap of light beneath the body of the radiator. Add a faint warm bounce from the floor onto the lower edges of the casting. Match the grain, colour temperature and depth of field of image [1] so the radiator reads as if it had been in the original photograph all along.`

// --- KROK 2a: kompozycja dla WNĘTRZA GENEROWANEGO (plate ze stylu) ----------
// Plate ze szkieletu zawsze ma okno, pustą ścianę i rurki, więc szablon może
// się do nich odwoływać wprost.

export const COMPOSE_STYLED = `TASK: add ONE cast iron radiator with EXACTLY {SECTIONS} ({SECTIONS_WORD}) sections into the photograph below. The section count {SECTIONS} is the single most important requirement of this task.

Image [1] is a photograph of an interior. Image [2] is a product reference photo of a cast iron radiator. EDIT IMAGE [1]: add the radiator from image [2] into the photograph, standing on the floor against the wall directly beneath the window. This is an edit of image [1], not a new scene.

${PRODUCT_PARA}

Preserve the radiator's real height and proportions from image [2]; do not scale, squash or stretch it to fit the space. The radiator stands flat against the wall beneath the window, its back parallel to the wall and to the window sill, a few centimetres in front of the skirting board; it is never rotated, never angled away from the wall and never freestanding in the room. CRITICAL: the output keeps exactly the same crop, framing and camera position as image [1]. Never zoom out, widen the view or pull the camera back to fit the radiator or the window in; if image [1] is a tight close-up, it is perfectly fine for the radiator to be cropped by the frame edges. {FRAMING}

Add two pipes rising vertically out of the floor at the radiator's bottom outer corners, and connect the radiator to them using a pair of traditional angled radiator valves. {VALVES_BLOCK}

Everything else in image [1] stays exactly as it is: the walls, the window, the floor, every piece of furniture and every object, the framing, the camera position and the lens perspective. The result must be instantly recognisable as the same photograph with one addition: the radiator and its two valves.

${LIGHT_PARA}

The finish of the radiator body: {FINISH}`

// --- KROK 2b: kompozycja dla WŁASNEGO ZDJĘCIA (wnętrze dowolne) --------------
// Zero założeń o pokoju: bez okna, bez parkietu, bez kierunku światła.

export const COMPOSE_OWN = `TASK: add ONE cast iron radiator with EXACTLY {SECTIONS} ({SECTIONS_WORD}) sections into the photograph below. The section count {SECTIONS} is the single most important requirement of this task.

Image [1] is a photograph of a real room. Image [2] is a product reference photo of a cast iron radiator. EDIT IMAGE [1]: add the radiator from image [2] into the photograph. It stands on the floor against a clear stretch of wall visible in image [1]: beneath the window if there is one, otherwise in the most natural empty spot for a radiator. This is an edit of the photograph, not a new scene.

${PRODUCT_PARA}

Preserve the radiator's real height and proportions from image [2]; do not scale, squash or stretch it to fit the space. The radiator stands flat against the wall it is placed on, its back parallel to that wall (and to the window sill, if it stands beneath a window), a few centimetres in front of the skirting board; it is never rotated, never angled away from the wall and never freestanding in the room. CRITICAL: the output keeps exactly the same crop, framing and camera position as image [1]. Never zoom out, widen the view or pull the camera back to fit the radiator in; if image [1] is a tight close-up, it is perfectly fine for the radiator to be cropped by the frame edges.

Connect the radiator to two pipes rising vertically out of the floor; if no pipes are visible in image [1], add them discreetly at the radiator's bottom outer corners. {VALVES_BLOCK}

THE PHOTOGRAPH IS NOT YOURS TO CHANGE. Everything in image [1] apart from the added radiator stays pixel-faithful and instantly recognisable as the same place: the same walls, the same windows, the same floor, every piece of furniture and every object, the same framing, the same camera position and the same lens perspective. Do not replace the room, do not restyle it, do not tidy it, do not invent a different interior. The only change is the radiator with its two valves added against the wall.

${LIGHT_PARA}

The finish of the radiator body: {FINISH}`

// --- Dopisek kadru do szablonu kompozycji ({FRAMING}) ------------------------
// Od v5.7 istnieje tylko kadr produktowy; wersja wide usunięta (v5.9).

export const FRAMING_PRODUCT = `The radiator is the hero of the photograph and fills the frame almost edge to edge beneath the sill, so close that the image reads like a product detail shot: the cast-iron surface texture, the crispness of the casting edges and every raised or recessed detail of the casting are rendered at near-macro detail on every visible section. If the radiator is wider than the frame, its outer sections are simply cropped by the frame edges; never zoom out to fit it in.`

// --- KROK 3a: swap finiszu (z kadru master) ----------------------------------

export const FINISH_SWAP_TEMPLATE = `Keep everything in this image absolutely identical: the room, the camera angle, the framing, the lighting, the shadows, the valves and pipework, and the radiator's exact geometry, its section count, its position in the room and all of its casting detail. {VALVE_NOTE} Change only the surface finish of the radiator body to the following, re-rendering its highlights, sheen and shadows so they are physically correct for the new material:

{FINISH}`

// Nota o parze zaworów, wstrzykiwana do KAŻDEGO kroku serii w trybie "pair",
// żeby edycje nie "naprawiały" celowej asymetrii do symetrii.
export const PAIR_NOTE = `The radiator's two valves are intentionally DIFFERENT from each other: the valve with the handwheel is on the left, and the plain lockshield valve is on the right. Keep each valve exactly as it is, on its own side. Do not make the two valves match.`

// --- KROK 3b: swap przyłączy (z gotowego kadru) -------------------------------

export const VALVE_SWAP_TEMPLATE = `Keep everything in this image absolutely identical: the room, the camera, the framing, the lighting, the radiator, its finish, its geometry, its section count and all of its casting detail. The radiator has exactly two valves, one at each bottom outer corner, each standing on its own pipe rising from the floor and connected to the radiator. Change only the material of these two valves and their visible pipework to {VALVE}. Re-render the reflections and highlights on the valves and pipes so they are physically correct for that metal, and keep their shape, size and position exactly as they are. Do not add, remove or move any valve. {VALVE_REF}`

// --- Dopiski do swapu zaworów ({VALVE_REF} w szablonie swapu) ---------------
// Wybierane automatycznie: brak zdjęcia = pusto; single/pair wg trybu zdjęcia.

export const SWAP_REF_SINGLE = `Image [2] is the exact product reference for the valves: keep both valves exactly this design, its body shape, handwheel, spindle and fittings, and change only their metal finish to the material specified above.`

export const SWAP_REF_PAIR = `Image [2] is the exact product reference for the valves: keep each valve exactly as it is in the current image, the same design on the same side, the handwheel valve on the left and the plain lockshield on the right, and change only the metal finish of both valves and their pipework to the material specified above. Do not swap the two designs between sides.`

// --- Auto-QA: weryfikacja wygenerowanych kadrów -------------------------------
// Po każdej generacji tani model TEKSTOWY Gemini ogląda wynik i liczy sekcje;
// przy pełnej kompozycji dodatkowo porównuje wzór z packshotem. Niezgodny kadr
// jest odrzucany, a prompt generacji dostaje dopisek korygujący (poniżej).

export const VERIFY_MASTER = `You are a meticulous quality inspector. Image [1] is a generated interior photograph containing exactly one cast iron radiator. Image [2] is the product packshot of the radiator that was supposed to be reproduced.

First, count the vertical sections of the radiator in image [1] one by one, carefully. Count the repeating cast columns themselves, not the gaps between them. Then judge whether the radiator in image [1] follows the DESIGN of image [2]: the same section profile and column shape, the same foot design, and the same level of surface decoration (a plain reference stays plain, a decorated reference stays decorated). When judging the design, ignore the colour, the finish and the number of sections.

Answer with JSON only, no other text: {"sections": <integer>, "design_match": <true or false>}`

export const VERIFY_COUNT = `You are a meticulous quality inspector. The image is an interior photograph containing exactly one cast iron radiator. Count the vertical sections of the radiator one by one, carefully. Count the repeating cast columns themselves, not the gaps between them.

Answer with JSON only, no other text: {"sections": <integer>}`

// Dopiski korygujące doklejane do prompta przy ponowieniu po odrzuceniu przez QA.
// {GOT} = ile sekcji wyszło, {SECTIONS}/{SECTIONS_WORD} = ile ma być.

export const RETRY_NOTE_COUNT = `PREVIOUS ATTEMPT REJECTED BY QA: the radiator was built with {GOT} sections instead of {SECTIONS}. That is wrong. Build the radiator with EXACTLY {SECTIONS} ({SECTIONS_WORD}) sections this time, and recount them one by one before finishing.`

export const RETRY_NOTE_DESIGN = `PREVIOUS ATTEMPT REJECTED BY QA: the radiator did not follow the reference design in image [2]. Copy the section profile, column shape, foot design and surface decoration of image [2] exactly; a plain reference stays plain. Do not substitute a generic radiator design from memory.`
