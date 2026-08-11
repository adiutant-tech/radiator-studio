// ---------------------------------------------------------------------------
// Radiator Studio, domyślna biblioteka promptów
// Silnik: Gemini 2.5 Flash Image (Nano Banana)
// Zasada: model nie czyta negatywów, wszystkie zakazy pisane twierdząco.
//
// Wszystko poniżej to DOMYŚLNE wartości. Aplikacja pozwala je edytować w UI
// (sekcja "Prompty"), edycje są zapisywane w localStorage przeglądarki.
// Placeholdery w szablonach:
//   {FINISH} - blok materiałowy wybranego finiszu
//   {VALVE}  - opis materiału przyłączy (srebrne / złote)
// ---------------------------------------------------------------------------

// --- KROK 1: scene plate, puste wnętrze (generowany raz, cache'owany) -------

export const PLATE_PROMPT = `A photorealistic interior photograph of an elegant drawing room in a Georgian townhouse on Kings Road, Chelsea, London.

A tall sash window with slim glazing bars and folding panelled shutters sits in the centre of the back wall, dressed with full-length pinch-pleat linen curtains in a soft oatmeal tone. The walls are painted in a chalky, complex heritage colour, a muted greenish-grey in the Farrow & Ball register, with a deep moulded skirting board running along the base and an ornate plaster cornice at the ceiling. The floor is wide herringbone oak parquet, softly worn, with the edge of a faded antique Persian rug entering from the lower right corner.

At the edges of the frame: the corner of a linen upholstered sofa at the left, an aged brass floor lamp behind it, a gilt-framed antique oil painting on the wall at the right, and a small stack of art books on the parquet. Fresh white peonies in a ceramic vase on a low table. The room feels inherited and quietly expensive, restrained old money rather than a showroom.

The wall directly beneath the window is completely empty and unobstructed. There is a clear, evenly lit stretch of bare wall, skirting board and floor across the lower centre of the frame, roughly 1200 mm wide and 700 mm tall, with nothing standing in front of it. Two slim copper pipe stubs emerge from the floorboards close to the wall, capped, ready for a radiator to be connected.

Soft overcast London daylight floods in through the window from the left, wrapping the room in gentle directional light with long soft shadows falling to the right. Warm ambient bounce fills the shadows. No hard sun, no flash.

Shot on a full-frame camera with a 35 mm lens at f/5.6, camera at the height of the window sill, perfectly level, so all vertical lines stay vertical and there is no wide-angle distortion. Editorial interior photography in the style of World of Interiors: colour-accurate, natural contrast, no heavy grading. The image contains no text, no lettering and no graphic overlays.`

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
    block: `A deep warm charcoal-grey metallic coating with a fine low-key shimmer in the pigment. Broad, soft, diffuse highlights run down the front crest of each column where the daylight from the left catches them, falling away to near black in the recesses between the columns. It reads unmistakably as coated metal, industrial and refined, never as flat grey plastic.`,
  },
  {
    key: 'satin-black',
    label: 'Satin Black',
    block: `A soft-sheen black lacquer at roughly 30 percent gloss. Narrow, clean, elongated highlights run vertically down the front crest of every column, and the raised scrollwork on the end sections catches thin bright edge-light along its topmost edges. Deep black in shadow, silky and gently reflective in the light. It is not glossy and it shows no mirror reflections of the room.`,
  },
  {
    key: 'antique-bronze',
    label: 'Antique Bronze',
    block: `A hand-highlighted antique bronze patina. A dark chocolate-brown metallic base coat, with warm burnished gold and copper highlight rubbed by hand onto every raised edge: the crest of each column, the top and bottom collars, the full length of the ornamental scrollwork on the end sections, and the curved feet. The recesses, the ground of the ornament and the gaps between the columns stay deep and dark brown. The contrast between the bright rubbed edges and the dark recesses is the entire character of this finish and must be strong, so the ornament reads sculpturally. Rich, aged, warm and luminous where the daylight strikes it. It is never a uniform flat brown.`,
  },
  {
    key: 'cream-white',
    label: 'Cream White',
    block: `A warm off-white eggshell paint with a soft low sheen, in the register of old lime plaster and aged French painted furniture. Faintly creamy and yellow-warm rather than cold, blue or brilliant white. Gentle grey-lilac shadows settle into the ornamental relief and between the columns, keeping every piece of casting detail legible against the pale wall behind it. A painted-furniture look, calm and understated.`,
  },
  {
    key: 'base-coat',
    label: 'Base Coat Only',
    block: `The bare factory base coat, unpainted. A uniform matte mid-grey primer straight from the foundry, slightly chalky and dry, with subtly uneven coverage and the faint texture of the casting surface showing through. Utilitarian and raw, with no sheen and no decorative finish. It looks like a product awaiting its final paint, honest and workshop-like, not distressed and not rusty.`,
  },
]

// --- KROK 2: szablon kompozycji packshot + plate -----------------------------
// image [1] = packshot produktu, image [2] = scene plate

export const COMPOSE_TEMPLATE = `Using image [1] as the exact product reference and image [2] as the room, place the cast iron radiator from image [1] into the room from image [2], standing on the parquet floor against the wall directly beneath the sash window.

Preserve the radiator from image [1] exactly as it is. Keep its silhouette, its proportions, the exact number of sections, the width and spacing of every section, the raised ornamental scrollwork on the two end sections, the plain smooth columns in between, the shape of the four curved decorative feet, and the round valve bosses at the bottom outer corners. The casting detail must match image [1] one to one. Do not redesign, simplify, stylise or embellish any part of it, and do not add ornament to the plain middle sections. It is a sectional cast iron column radiator, exactly two columns deep, with a slim front-to-back profile.

It is a low, squat radiator, 510 mm tall, about knee height. The top of the radiator sits well below the window sill with a clear gap of at least 200 mm between them. Show it from a gentle three-quarter angle from the left, so the two-column depth is readable and the ornamental end section faces the camera.

Connect it to the existing floor pipes with slim traditional angled radiator valves. The two valves and their visible connecting pipework are made of {VALVE}. The valve metal contrasts cleanly with the radiator body.

Keep the room from image [2] completely unchanged. The wall colour, the window, the curtains, the parquet, the rug, the furniture at the frame edges, the camera position and the lens perspective all stay exactly as they are.

Integrate the radiator into the scene photographically: the same soft overcast daylight from the left rakes across its front, revealing the ornamental relief through gentle directional shadow. Cast a soft shadow to the right along the floor and a tight dark contact shadow under each of the four feet, with a visible gap of light beneath the body of the radiator. Add a faint warm bounce from the parquet onto the lower edges of the casting. Match the grain, colour temperature and depth of field of image [2] so the result reads as a single photograph.

The finish of the radiator body: {FINISH}`

// --- KROK 3a: szablon swapu finiszu (z kadru master) -------------------------
// Cała seria dzieli jeden kadr: pierwszy finisz to pełna kompozycja,
// każdy kolejny to edycja mastera zmieniająca wyłącznie lakier.

export const FINISH_SWAP_TEMPLATE = `Keep everything in this image absolutely identical: the room, the camera angle, the framing, the lighting, the shadows, the valves and pipework, and the radiator's exact geometry, its section count, its position in the room and all of its casting detail. Change only the surface finish of the radiator body to the following, re-rendering its highlights, sheen and shadows so they are physically correct for the new material:

{FINISH}`

// --- KROK 3b: szablon swapu przyłączy (z gotowego kadru) ---------------------

export const VALVE_SWAP_TEMPLATE = `Keep everything in this image absolutely identical: the room, the camera, the framing, the lighting, the radiator, its finish, its geometry, its section count and all of its casting detail. Change only the two radiator valves and their visible connecting pipework at the bottom outer corners. Their new material is {VALVE}. Re-render the reflections and highlights on the valves and pipes so they are physically correct for that metal, and keep their shape, size and position exactly as they are.`
