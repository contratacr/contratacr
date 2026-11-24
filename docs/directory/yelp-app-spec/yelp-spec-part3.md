# Yelp iOS spec, part 3 (sheets 18-26): Restaurants results list, Auto Repair search + results, Home / More Categories

Source: contact sheets 18-26 (read at sheet size; label text read from the sheets, not individual frames, so tiny strings may be slightly off). Frames approx. 11:07-11:08 clock. ES = Costa Rican Spanish, "usted".
Our colors/logo/icons only; never copy Yelp red, logo, icons, fonts, photos.

## Persistent chrome (all screens in these sheets)
- Bottom floating pill tab bar (translucent, glass), 5 tabs, icon over label: **Search** (magnifier, active = highlighted capsule), **Projects** (document/folder icon), **Assistant** (sparkle icon), **My Lists** (bookmark icon), **Me** (user-circle icon).
  ES: Buscar, Proyectos, Asistente, Mis listas, Yo (or Perfil).
- Result screens show a top header bar: back arrow, bold "**<Category>**" + grey "<Location>" (e.g. "Restaurants  New York, NY"; "Auto Repair  Current Location" then "New York, NY"), right icon = map-pin/person-pin button (opens map). Map is a strip behind the header (street-map backdrop visible, label overlay "Hackensack" etc.); list sits in a bottom sheet with drag handle that overlays the map.
  ES: "Restaurantes  San José, CR"; map button label "Mapa".
- Status bar shows iPhone screen recording (red dot); ignore.

## Screen A: Restaurants results list (sheet 18-19, frames ~ keep rows 120-133 area)
How reached: Home > category icon "Restaurants" (or search "Restaurants"). Location "New York, NY".
Top to bottom:
1. Header: back arrow | "Restaurants" + "New York, NY" | map-pin icon.
2. Sticky filter chip row (horizontal scroll): [filter-sliders icon button] | **Sort** (dropdown chevron) | **Open Now** | **Price** (chevron) | **Offers Takeout** (cut off; more chips to right, not visible). ES: Ordenar | Abierto ahora | Precio | Ofrece para llevar. The slider icon opens the full filters sheet (not visible).
3. Vertical list, rows numbered "N. Name". Row layout (top-down):
   - Photo carousel: horizontal strip of 2+ large photos (third partially visible, "See..." overlay on last tile, "See all" likely).
   - Title "N. Business Name" bold (e.g. "2. The Eighty Six", "3. Miss Nellie's", "4. Lola's", "5. Da Andrea - Chelsea", "6. LoveMama", "7. Golden Diner", "8. Shu Jiao Fu Zhou").
   - Star rating graphic (5 squares, orange/red) + numeric "4.7" + "(43 reviews)" (counts abbreviated "2.1k", "7.1k", "1.3k").
   - Line with pin icon: "Neighborhood  .  $$  .  Closed until 4:00 PM" or "Open until 2:00 AM" (status text: "Closed" red bold, "Open" green bold; price level $/$$/$$$).
   - Optional badge line: "Locally owned (i)" with orange icon (info tooltip) - only on some.
   - Review-snippet line with speech-bubble icon: "quote..." + blue "Read more".
   - Bottom row: category chips (e.g. "Seafood", "Steakhouses", "American"; "New American"; "Thai", "Malaysian", "Vietnamese"; "Diners", "Breakfast & Brunch"; "Chinese") + right-aligned red pill **primary CTA**.
4. Primary CTA varies per business: **Order** (most; restaurants with online ordering) or **Call to order** (e.g. Miss Nellie's, no online order; presumably tel: link). Some rows show no CTA (Lola's, row 4: only chips; CTA not visible/absent).
   ES: "Pedir" / "Llamar para pedir".
5. Insert module between row 5 and 6: **"Eat at a local spot"** (avatar icon + heading, peach/cream tinted band) then a photo-card carousel of locally-owned businesses (photos with menu overlay); acts as editorial/promoted section. ES: "Coma en un lugar local".
6. Another inserted card in a later frame: photo (storefront) with "Entree + Drink / Coconut & Alcohol excluded", "See menu" overlays = offer/menu-deal banner on a row photo (LoveMama).
Taps: row/photo/title = business page; CTA Order = order flow; chips = filter by that category; "Read more" = expand snippet/open review; map icon = map view; sort/price = dropdown/popover.

## Screen B: Home (Search tab) (sheet 19 right, sheet 26)
Reached: tap Search tab / back out of results.
1. Category icon row (horizontal): **Restaurants** (fork-knife), **Auto Repair** (car), **Movers** (truck), **Plumbers** (faucet), **Cleaning** (spray bottle/broom), **More** (three dots). ES: Restaurantes, Taller mecánico (Mecánica automotriz), Mudanzas, Plomeros, Limpieza, Más.
2. Search field (large, red magnifier circle at left, mic icon at right) with rotating placeholder: "Search for plumbers", "Search for hot & new restaurants" ("Search for ___"). ES: "Buscar plomeros", "Buscar restaurantes nuevos y populares". Mic = voice search.
3. Promo banner (peach/pink gradient): "Your top 10 list" + lock icon + "Unlock your top 10" + circular arrow button (right). Subtext: "For this list, Yelp analyzed submissions, ratings, review volume, and community input." + (i) info icon. Horizontally scrolling numbered cards (ranked 10, 9, 8...) with big red hexagon number badge + bookmark icon on card; first card photo ("Uncle Af's", stars 4.8 (951)); locked card: lock icon + "Add 5 more to your 'Been here' list". ES: "Su top 10", "Desbloquee su top 10", "Agregue 5 más a su lista 'He estado aquí'". (Gamified feature; optional for us.)
4. Below: grey skeleton placeholders (loading feed), content not visible.
5. Tab bar.

## Screen C: More Categories (sheet 26)
Reached: Home > "More" (...) icon. Full sheet with circular back button (top-left, "<") and centered title "**More Categories**". Grouped list, icon + label, section headings in grey small text:
- **Popular**: Accountants, Handyman, Electricians
- **Snacks & Drinks**: Coffee & Tea, Bars, Desserts
- **Spas & Salons**: Hair Salons, Massage, Day Spas
- **Auto Services**: Car Wash, Auto Repair, Gas Stations (list continues, not visible)
ES: Más categorías; Populares; Snacks y bebidas; Spas y salones; Servicios automotrices; Contadores, Mantenimiento del hogar (Handyman), Electricistas, Café y té, Bares, Postres, Peluquerías, Masajes, Spas, Lavacar, Taller mecánico, Gasolineras.

## Screen D: Auto Repair search box (sheet 20 #2; sheet 25)
Reached: tap header on results (or search field). Header becomes text field: back arrow, text "Auto Repair" (selected/highlighted), clear (x) circle. Below: location row with pin icon: "Current Location" (blue) or "New York, NY" (once changed). Suggestion list:
- Top entry with brand badge: "Auto Repair - Pricing and Availability" (special lead-gen entry, icon with red/blue badge)
- Magnifier rows: "Auto Repair", "Auto Repair - Oil Change", "Auto Repair - Check Engine Light", "Auto Repair - Brakes", "Auto Repair - Tires", "Auto Repair - Smog Check"
- Later state (sheet 25): clock icon history row "Auto repair"; heading **People also search for** with sparkle-icon rows: Mechanic, Oil Change Stations, Transmission Repair, Automotive, Bmw Repair.
- iOS keyboard (ES layout, blue search key).
ES: "Taller mecánico - Precios y disponibilidad", "...- Cambio de aceite", "...- Luz de revisión del motor", "...- Frenos", "...- Llantas", "...- Revisión de emisiones" (smog check may not apply to CR; use "Revisión técnica (RTV)"). "La gente también busca".

## Screen E: Empty search state (sheet 25 #7)
Search field placeholder "Type or search with your voice" + mic; location row "Current Location". Sections:
- **Recently searched** (chips with clock icon): Auto Repair, Plumbers, Coffee, Cafés & Coffee Shops, Auto Detailing
- **Recently viewed businesses** (rows: logo/avatar, name, "distance . city, state"): e.g. "San Francisco Coffee Roasting Company  1000+ mi . Atlanta, GA, US"
- **Trending searches** (chips with trend-arrow icon): Breakfast Burrito, Soup, Carpet Cleaning, Vietnamese
ES: "Búsquedas recientes", "Negocios vistos recientemente", "Búsquedas en tendencia", "Escriba o busque con su voz", "Ubicación actual".

## Screen F: Auto Repair results (service category) (sheets 20-25)
Reached: from search suggestion or category icon. Initial: skeleton loading placeholders (grey chips and cards), sheet drag handle.
Header: back | "Auto Repair" + "New York, NY" | map icon.
Filter chip row differs from restaurants (service chips): [filter icon] | Sort | Open Now | **Fast-responding** | **Diagn...** (cut) ... later scrolled state shows: **Request a Quote** | **Virtual Consultations** | **More Filters**. ES: Ordenar | Abierto ahora | Respuesta rápida | Diagnóstico | Solicitar cotización | Consultas virtuales | Más filtros.

Top to bottom of the feed:
1. **AI Assistant card** (inline): sparkle icon + "Hi ibyStart, what do you need help with today?" (greeting uses user's name). Suggestion chips (horizontal scroll): "I need an oil change", "I want to replace my tires", "My car's AC is not working", "Need a car battery replac..." Input field "Tell Yelp Assistant what you need" with circular send/arrow button; caption (sparkle) "Yelp Assistant will match you with local pros". ES: "Hola <nombre>, ¿en qué le podemos ayudar hoy?", chips "Necesito un cambio de aceite", "Quiero cambiar mis llantas", "El aire acondicionado de mi carro no funciona", "Necesito una batería nueva"; input "Cuéntele al Asistente lo que necesita"; "El Asistente le conectará con profesionales locales".
2. **Sponsored Results (i)** section heading (info tooltip). Ad cards (no number): name, pin + neighborhood ("Ozone Park", "Jamaica"), optional stars, thumbnail at right (placeholder grey storefront if none), badges ("Mobile services (i)", "Locally owned (i)"), snippet with "Read more", green-check service tags ("Auto care", "Auto maintenance", "Auto repairs"), response line "Response time 30 mins . Response rate 100%" (lightning icon), CTA either grey full-width **Contact** or red full-width **Get pricing**. Cards: Pablo Raposo (Contact), AONE (5.0, 3 reviews; Get pricing), 24 Hour Truck Tire Service (5.0 1 review, 12.6 mi, address, Locally owned; grey **Call**).
3. Non-sponsored-looking-but-ad rows continue: MINHS Automotive (4.0, 274 reviews, 3.2 mi, "Serving Brooklyn since 1992..." text, grey **Call**), Curbside Car Care (Belmont; "Online appointments", "24/7 Emergency Roadside Assistance NYC", tags "Auto fluids and filters maint..." "Oil c..."; "Response time 10 mins . Response rate 5%"; grey **Contact**), Metro Tire Co of Queens Corp (4.5, 31 reviews, 4.8 mi; "Waiting rooms"; review quote; red **Get pricing** + grey **Call**), The Tire Tech (Roselle; "Free estimates (i)"; "Servicio rapido y garantizado" (business text in Spanish); "Response time 1 wk . Response rate 5%"; Get pricing), Wicked Stylez Detailing (5.0, 1 review, "Offers customized solutions (i)", "Excellent responses . Response time 20 mins" (green icon); Get pricing), Trax (Glendale; blue shield "Verified License"; Get pricing; "Response time 9 hrs . Response rate 60%").
4. **"Work backed by a guarantee"** + "Sponsored (i)" : 2-col horizontal carousel cards (big photo, name e.g. "Lee Myles AutoCare +...", stars 4.1 (68 reviews), category line "Auto Repair, Transmission R...", buttons **Call**, **Request a quote**, caption "Responds in ~12 hours"). RJB Service (no reviews: "No reviews", "Commercial Truck Repair,").
5. **"Deals & free estimates"** + "Sponsored (i)" carousel: cards J & B Body Works (4.3, 48 reviews, "Verified License Auto R..."), Bauer Automotive T... (3.0), Claudio Auto Service (4.4, 10 reviews, "Auto Repair, Tires, Transmis..."), 24 Hour Truck Tire Se...; buttons **Request a quote** + **Call**; "Responds in ~6 hours / ~4 hours / ~20 minutes".
6. **Sponsored Result (i)** single: BKM Automotive (4.4, 90 reviews, 5.1 mi, 36-48 38th St, Astoria; "Minority-owned (i)"; snippet; "Response time 30 mins . Response rate 100%"; Get pricing).
7. **All Results** heading (organic, numbered). Row layout: "N. Name", stars + rating + "(N reviews)", pin + "distance mi . address", feature line with icon (e.g. "Online appointments", "At-home services", "Auto pickup and delivery", "Locally owned (i)", "Minority-owned (i)", blue shield "Verified License"), review quote + "Read more", "Excellent responses . Response time 40 mins" (green) or "Response time 1 wk . Response rate 50%", full-width red **Get pricing** button, thumbnail at right. Seen: 1 Sunnyside Auto Repair (4.5, 83), 2 Manhattan Auto Repair (4.6, 60), 3 Manhattan Alignment & Diagnostic Center (4.8, 202), 4 BKM Automotive, 5 Malibu Auto Repair (4.6, 134), 6 United Auto Repair (4.5, 39; At-home services), 7 L & W Repair Shop (4.2, 6), 8 L & B Auto Repair (4.8, 156), 9 The Tire Place (4.7, 305; Auto pickup and delivery), 10 Chariot Auto Repair (4.2, 113), 11 Gotham City Collision (4.9, 278; Verified License), 12 Midtown Chelsea Center (3.7, 7; 2.1 mi) and more (infinite scroll). Distance shown in miles (we use km).
Note: in services, distance replaces neighborhood line, stars are red-orange on 5 squares, rating shape differs slightly (3.7 shows partial star).
Taps: Get pricing = request-a-quote/pricing form (lead flow, not visible); Contact = contact/message-the-business sheet (not visible); Call = dial; Request a quote = quote request; "Responds in ~N" is info text.
ES: Resultados patrocinados; Todos los resultados; "Trabajo con garantía"; "Ofertas y estimados gratis"; Contactar; Llamar; Solicitar cotización; Ver precios (or "Pedir cotización"); "Tiempo de respuesta 30 min . Tasa de respuesta 100%"; "Respuestas excelentes"; "Licencia verificada"; "Citas en línea"; "Servicio a domicilio"; "Recogida y entrega del vehículo"; "Propiedad local"; "Estimados gratis"; "Servicios móviles"; "Responde en ~12 horas".

## Category-dependent CTA matrix (observed)
- Restaurant (non-sponsored): chips row + single red pill right-aligned: **Order** (default) or **Call to order**; none sometimes. No Reserve/Menu button seen in the list; "See menu" appears only on a deal banner photo. Status line (Open/Closed until time) and price ($ to $$$) present; no distance shown.
- Auto repair (service): full-width red **Get pricing** (organic list); ads use **Contact** (grey) / **Call** (grey) / **Request a quote**; filters Request a Quote, Virtual Consultations, Fast-responding, Diagnostics; response time/rate line; no price level, no open/closed line.
- Plumber/gas station/pharmacy: not visible in these sheets (Plumbers and Gas Stations appear only as category entries; results not shown).

## Other
- iOS Control Center overlay (last frames) = user screen-recording UI, not Yelp.
- Not visible: map view, full filter sheet, Sort menu options, business detail page, quote form, Assistant tab, Projects tab, My Lists, Me tab contents.

## Summary (5 lines)
1. Results screens: header (back, "Category + Location", map icon) over map strip; sticky chips (filter icon, Sort, Open Now, Price/Offers Takeout for restaurants; Fast-responding, Request a Quote, Virtual Consultations, More Filters for services); numbered rows with photo strip, stars, status/price, snippet "Read more", category chips.
2. CTA depends on category: restaurants get "Order"/"Call to order" pill; services get full-width red "Get pricing" (organic), and ads get "Contact"/"Call"/"Request a quote"; service rows show response time/rate and badges (Verified License, Locally owned, Minority-owned, Online appointments).
3. Service feed order: AI assistant card, "Sponsored Results", sponsored carousels ("Work backed by a guarantee", "Deals & free estimates"), "Sponsored Result", then "All Results" numbered.
4. Home: 6 category icons (Restaurants, Auto Repair, Movers, Plumbers, Cleaning, More), search bar with mic, "Your top 10 list" gamified banner; More Categories = grouped list (Popular, Snacks & Drinks, Spas & Salons, Auto Services...).
5. Search state: suggestions + "People also search for"; empty state has Recently searched, Recently viewed businesses, Trending searches; bottom bar tabs Search, Projects, Assistant, My Lists, Me.
