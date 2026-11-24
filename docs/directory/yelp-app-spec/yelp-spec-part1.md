# Yelp iOS app spec, part 1 (sheets 00-08, ~0 s to ~57 s, 11:05-11:06 clock)

Convention: EN label (exact) -> ES-CR (usted). Our own colors/logo/icons only.
Bottom tab bar (floating pill, on every main screen): Search | Projects | Assistant | My Lists | Me (Me has red badge "21"). Active tab has grey pill highlight and bold label.
-> Buscar | Proyectos | Asistente | Mis listas | Yo (insignia numerica)

## 1. Search tab / Home (f0000-f0007)
Reached: app start, tab "Search".
Top to bottom:
- Category icon row (horizontal): Restaurants, Auto Repair, Movers, Plumbers, Cleaning, More ("..."). -> Restaurantes, Taller mecanico, Mudanzas, Plomeros, Limpieza, Mas
- Search pill: red round search icon + placeholder "Search for plumbers" (placeholder rotates: "Search for auto repair", "Search for plumbers") + mic icon. -> "Buscar plomeros" / "Buscar taller mecanico"
- Promo band (pink-peach gradient) "Unlock your top 10 list" (lock emoji, repeating marquee text) + circular arrow button; subtext "For this list, Yelp analyzed submissions, ratings, review volume, and community input." + info (i) icon. -> "Desbloquee su top 10"; "Para esta lista, analizamos aportes, calificaciones, volumen de resenas y opinion de la comunidad."
- Horizontal carousel of ranked cards: card 10 "Uncle Af's" (photo, red rank badge, bookmark icon, red star rating "4.8 (951)"); next cards locked: lock icon + "Add 5 more to your 'Been here' list" (rank 9, 8...). -> "Agregue 5 mas a su lista 'He estado aqui'"
- Below: grey skeleton placeholder (feed loading; content not visible).
Taps: category icon -> search results for that category; More -> full category list (not visible); search pill -> Search entry screen (#7); arrow -> top-10 list builder (not visible); bookmark -> save to My Lists.

## 2. Me tab (f0009-f0031 area, sheets 00-02)
Reached: tap "Me". Scroll top to bottom:
- Top-right icons: bell (badge 21), share, QR code icon. 
- Empty avatar (camera+plus placeholder), username "ibyStart", mini counters row: [review icon] 0  [check-in/video icon] 0  [photo icon] 0.
- Quick action row (4 icon buttons): Add Review, Add Photo, Check In, Add Business. -> Agregar resena, Agregar foto, Registrar visita, Agregar negocio
- Heading "Share your experience" -> "Comparta su experiencia"
- Stack of dismissible cards (X top-right): business thumbnail + name ("Smashed and Pressed", "Crumbl - Lakeshore") + "Do you recommend this business?" + three pill buttons Yes | No | Maybe. -> "¿Recomienda este negocio?" Si | No | Tal vez
- Heading "Impact" with segmented tabs Reviews | Photos (red underline on active). Two stat boxes: "reactions all time 0", "views last 90 days 0". Empty text "Reactions await! Write your first review to help others discover a business." + grey full-width button "Write a review". -> Impacto; Resenas | Fotos; "reacciones en total", "vistas ultimos 90 dias"; "¡Las reacciones lo esperan! Escriba su primera resena para ayudar a otros a descubrir un negocio."; "Escribir una resena"
- Heading "Recently viewed": rows = thumbnail, name ("San Francisco Coffee Roasting..." "Inwood Bar and Grill"), address line (e.g. "1192 N Highland Ave NE, Atlanta, GA 30306"), bookmark icon right. -> "Vistos recientemente"
- Heading "Contributions": list rows with icon + label + count: Reviews 0; Community conversations 0 (green "New" tag); Added businesses 0. -> Contribuciones: Resenas; Conversaciones de la comunidad (Nuevo); Negocios agregados
- Heading "Community": rows Yelp Elite Squad; Messages; Find friends; Events; "Activity feed" (partly visible, list continues, rest not visible). -> Comunidad: Escuadron Elite (programa propio); Mensajes; Encontrar amigos; Eventos; Actividad
Taps: bell -> Notifications (#3); share -> iOS share sheet (#4) ; QR icon -> QR sheet (#5); X on card dismisses; Yes/No/Maybe records quick review; Add Review etc. open flows (not visible).

## 3. Notifications (f0020s, sheet02 first)
Reached: bell on Me. Header: back arrow + title "Notifications". List rows: red-square category icon, bold title, 1-2 line body, relative age right ("1d ago"). Examples: "Done right the first time" / "Still looking for a plumber? Share a few details and connect with local pros - it's fast and it's free." (2d) / "Who do locals actually trust?" / "Turkey can wait. Clean first." / "Hosting soon?" / "Repair or replace?" / "Big event? Get it tailored." / "Winter's coming for your lawn" / "Hosting an event, ibyStart? Find top caterers..." / "Fix up fluffy with a top groomer...". Content = marketing nudges to start a service request per category (cleaning, auto, handyman, appliance repair, tailor, landscaper, caterer, groomer). -> "Notificaciones"; "hace 1 d". Tap row -> likely opens that category's request flow (not visible).

## 4. Share sheet (from Me share icon)
Native iOS share sheet, link "yelp.com" (profile URL): contacts, AirDrop, Messages, Mail, WhatsApp, Copy, Add to New Quick Note, Add to Favorites, View More. -> use native share with our profile URL.

## 5. QR sheet (Me QR icon)
Card with profile QR (avatar centre), name "ibyStart", buttons Share | Scan. -> Compartir | Escanear.

## 6. My Lists tab (sheet02 last, sheet03)
Header: "My Lists" + pill "Map" (-> Mapa). Tabs: Been here (check icon, active) | Want to go | Lists. -> He estado | Quiero ir | Listas.
Toolbar: filter icon button, chip "Rerank", "+" button, share button. 
Promo card: "0/5 Unlock list of top 10 picks for you by adding 5 more" with 3 locked icons.
Empty state: illustration + "Add spots to track, rank, and share where you've been." -> "Agregue lugares para registrar, clasificar y compartir donde ha estado."
"Have you been here yet?" rows: thumbnail, name, subline "neighborhood • categories" (e.g. "Financial District • Food Trucks, Food Court"), location-pin button right (mark as been here). Examples Off the Grid Salesforce Tower, Powered By Pork, Tainos Puerto Rican Food, Marianne's, Ocean Blue Laundry and...

## 7. Assistant tab (sheet03)
Reached: tap "Assistant". Header: hamburger (history) | "Yelp Assistant" | compose (new chat) icon | X close.
Greeting: "What sounds good, ibyStart?" (visible when keyboard closed). 
Horizontally scrolling coloured prompt cards (icon + label + prompt): "OFF THE MAP - Any local hidden gems nearby?", "ADVENTUROUS - Surprise me with something nearby I wouldn't think to search for", "KEE... - Best res... mi..." (third truncated). Each has a round up-arrow send button when tapped.
Chips: "Best bets" (dark, selected), "Right now", "Weekend plans".
Input: "Ask anything..." + mic. Keyboard opens on tap. -> Asistente; "¿Que se le antoja, X?"; "FUERA DEL MAPA - ¿Joyas escondidas cerca?"; "AVENTURERO"; chips "Mejores opciones", "Ahora mismo", "Planes de fin de semana"; "Pregunte lo que quiera..."

## 8. Projects tab (sheet03 last - sheet05)
Header: "ibyStart's Projects" centered (collapsing large title on scroll) + "..." menu button (contents not visible). Floating red pill "Get help with Yelp Assistant" (sparkle icon) that collapses to red round sparkle FAB on scroll (-> Assistant). -> "Proyectos de X"; "Obtenga ayuda con el Asistente".
Sections:
- "Hire a local pro today": 4-col icon grid, 2 rows: Movers, Home cleaning, Plumbers, Appliance repair / Electricians, Auto detailing, Contractors, More. -> Contrate a un profesional local hoy: Mudanzas, Limpieza del hogar, Plomeros, Reparacion de electrodomesticos, Electricistas, Detallado automotriz, Contratistas, Mas
- "What's next on your list?": vertical cards each icon + name + two buttons: red "Start project" | grey "Add to plan". Cards: Home Cleaning, Handyman, General Contractors. -> "¿Que sigue en su lista?"; "Iniciar proyecto" | "Agregar al plan"
- "Make your home your happy place": horizontal cards with large photo, numbered badge (1,2), title, grey button: "Upgrade your kitchen" [Find kitchen pros]; "Spruce up curb appeal" [Find landscapers?(trunc. "Find l...")]. -> "Haga de su hogar su lugar feliz"; "Renueve su cocina" [Buscar expertos en cocinas]
- "Create a backyard retreat": "Enjoy living space outdoors" [Find deck pros]; "Cozy up b..." [Find ...]
- "Maintain your outdoors": "Get ahead of leaks" [Find roofers]; "Keep trees..." [Find t...]
- "Refresh your indoors": "Keep cozy or cool" [Find HVAC pros]; "Get that c..." [Find hc...]
Pattern: editorial seasonal carousels, each card = photo + headline + "Find <trade> pros" button -> category search.

## 9. Search entry screen (f0113-f0114, sheet06/07)
Reached: tap search pill on Home (11:06). Fields: back arrow + "Type or search with your voice" + mic; row "Current Location" (pin icon, blue) as location field.
Chips: Restaurants, "I need help fixing >". 
"Recently searched": chips with clock icon (Plumbers, Coffee, Cafes & Coffee Shops, Auto Detailing).
"Recently viewed businesses": rows with logo, name, "1000+ mi • Atlanta, GA, US".
"Trending searches": chips with trend icon (Smoked Whole Turkey, Deep Fried Turkey...).
Typing "Plumbers" shows autosuggest list (search icon rows): "Plumbers - Pricing and Availability" (special icon), "Plumbers", "Plumbers - Water Heater Installation/Repair", "- Open 24 Hours", "- Sewer System Installation/Repair", "- Septic Tank Inspection/Repair", "- Drain Cleaning", "- Gas Line Installation/Repair". Field has X clear. Keyboard action key = blue search key. -> "Escriba o busque con su voz"; "Ubicacion actual"; "Busquedas recientes"; "Negocios vistos recientemente"; "Busquedas populares"; "Necesito ayuda para arreglar".

## 10. Results: map-first first load (f0124-f0125)
Header: back arrow + "Plumbers" + "Current Location" (grey), list icon (toggle to list). Full map with draggable bottom sheet (skeleton). After location change: header "Plumbers New York, NY" with person/account icon at right (profile-ish toggle).
Sheet: filter-sliders icon, chips: Sort v, (Yelp Guaranteed w/ shield), Open Now, Fast-responding, Request a Quote, More Filters, Inspe... (scroll; "Inspected"/similar, cut off) -> Ordenar, Garantizado, Abierto ahora, Respuesta rapida, Solicitar cotizacion, Mas filtros.
Services category extra block: "Hi ibyStart, what do you need help with today?" + AI chips ("I want to fix a leaky faucet", "Looking to replace my wa...", "I need help with a clogged toilet", "I want to install a n...") + input "Tell Yelp Assistant what you need" + red send arrow + note "Yelp Assistant will match you with local pros". -> "Hola X, ¿en que podemos ayudarle hoy?"; "Cuentenos que necesita"; "El asistente le conectara con profesionales locales".
Empty-state (no results, first load): "Notice something missing here? [Add business]"; "No results for: Plumbers / Near: ... Try using different or fewer keywords, or move the map and redo your search here." -> "¿Nota que falta algo? Agregar negocio"; "Sin resultados para..."; "Intente con otras palabras o mueva el mapa y repita la busqueda aqui."

## 11. Sort sheet
Modal bottom sheet "Sort" + X; radio list: Recommended (default) | Distance | Rating | Reviewed. -> Ordenar: Recomendado | Distancia | Calificacion | Mas resenas.

## 12. Results list, SERVICES category (Plumbers) (f0125-f0144+, sheets 07-08)
Header sticky: "Plumbers New York, NY". Chips scroll as above. After the AI block:
- "Sponsored Results" (i) heading. Then business cards (sponsored first, then organic):
  Card layout: name (bold) ; red stars + "5.0 (1 review)" ; thumbnail right (square, or logo); line "pin 11.6 mi - Flushing" (distance + neighborhood); "Yelp Guaranteed" with shield (badge); attribute line with icon (e.g. "Looking to upgrade your home or business? At KESA Contracting we can help bring y... Read more" ; "Certified professionals (i)" ; "Emergency services" ; "Free consultations (i)" ; "Schedule now" ; "15 years in business (i)" ; "Free estimates"; checkmark tags "Balcony addition / Bathroom remod... / Bed..."); review snippet in quotes + "Read more"; "Response time 6 hrs - Response rate 100%" (bolt icon); "Excellent responses - Response time 10 mins" (green).
  Primary buttons per card (full width):
  - Red filled "Get pricing & availability" (most cards, sponsored and organic services) -> request-quote flow.
  - Grey outline "Call" (Vuksani Service Group, emergency services biz) - tap-to-call.
  - Grey "Contact" (Urban Mechanical, Verrico & Palmer, PRO P&H Mechanical, ... when no quote-flow). 
  So per card ONE primary button only, order of preference observed: "Get pricing & availability" (red) else "Call" else "Contact" (grey). -> "Solicitar precio y disponibilidad" / "Llamar" / "Contactar".
  Names seen: Kesa Contracting, MVM Mechanical LLC, Vuksani Service Group, Urban Mechanical, Verrico & Palmer, Absolute General Contractor, PRO P&H Mechanical, Five Star Bath Solutions of Westchester County (3.7, 6 reviews, "Free estimates").
- Bottom tab bar stays (Search tab active). Rows separated by thin dividers; tapping card opens business page (not in my sheets).

## Category dependence (what is visible in my range)
- Only Services (Plumbers) results seen: quote button, Yelp Guaranteed, response time/rate, services attributes, AI helper block, "Request a Quote" and "Fast-responding" filters.
- Restaurants/auto repair/gas station/pharmacy result pages: NOT visible in part 1 (Restaurants only as chip). Auto Repair/Restaurants/Movers/Cleaning/Plumbers category icons on Home.
- Projects tab ties service categories to "Start project" (quote request) vs "Add to plan".

## Navigation order seen
Home -> Me -> (Notifications, Share, QR) -> My Lists -> Assistant -> Projects (scroll carousels) -> Home -> Search entry -> results map -> sort sheet -> list scroll.
