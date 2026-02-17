// World Cup 2026 — 48 qualified teams
// Each entry: { name, code (FIFA 3-letter), colors (for the ring) }
// Colors are the primary flag/jersey colors used for the circular ribbon.

const TEAMS = [
  // AFC (Asia)
  { name: "Australia", code: "AUS", flag: "🇦🇺", colors: ["#00843D", "#FFCD00"] },
  { name: "IR Iran", code: "IRN", flag: "🇮🇷", colors: ["#239F40", "#FFFFFF", "#DA0000"] },
  { name: "Japan", code: "JPN", flag: "🇯🇵", colors: ["#000080", "#FFFFFF"] },
  { name: "Jordan", code: "JOR", flag: "🇯🇴", colors: ["#000000", "#FFFFFF", "#007A3D", "#CE1126"] },
  { name: "Korea Republic", code: "KOR", flag: "🇰🇷", colors: ["#CD2E3A", "#0047A0"] },
  { name: "Qatar", code: "QAT", flag: "🇶🇦", colors: ["#8A1538", "#FFFFFF"] },
  { name: "Saudi Arabia", code: "KSA", flag: "🇸🇦", colors: ["#006C35", "#FFFFFF"] },
  { name: "Uzbekistan", code: "UZB", flag: "🇺🇿", colors: ["#0099B5", "#FFFFFF", "#1EB53A"] },

  // CAF (Africa)
  { name: "Algeria", code: "ALG", flag: "🇩🇿", colors: ["#006233", "#FFFFFF", "#D21034"] },
  { name: "Cabo Verde", code: "CPV", flag: "🇨🇻", colors: ["#003893", "#CF2027", "#F7D116"] },
  { name: "Côte d'Ivoire", code: "CIV", flag: "🇨🇮", colors: ["#F77F00", "#FFFFFF", "#009E60"] },
  { name: "Egypt", code: "EGY", flag: "🇪🇬", colors: ["#CE1126", "#FFFFFF", "#000000"] },
  { name: "Ghana", code: "GHA", flag: "🇬🇭", colors: ["#CE1126", "#FCD116", "#006B3F"] },
  { name: "Morocco", code: "MAR", flag: "🇲🇦", colors: ["#C1272D", "#006233"] },
  { name: "Senegal", code: "SEN", flag: "🇸🇳", colors: ["#00853F", "#FDEF42", "#E31B23"] },
  { name: "South Africa", code: "RSA", flag: "🇿🇦", colors: ["#007749", "#FFB81C", "#000000", "#DE3831", "#FFFFFF", "#002395"] },
  { name: "Tunisia", code: "TUN", flag: "🇹🇳", colors: ["#E70013", "#FFFFFF"] },

  // CONCACAF (North/Central America & Caribbean)
  { name: "Canada", code: "CAN", flag: "🇨🇦", colors: ["#FF0000", "#FFFFFF"] },
  { name: "Curaçao", code: "CUW", flag: "🇨🇼", colors: ["#002B7F", "#F9E814"] },
  { name: "Haiti", code: "HAI", flag: "🇭🇹", colors: ["#00209F", "#D21034"] },
  { name: "Mexico", code: "MEX", flag: "🇲🇽", colors: ["#006847", "#FFFFFF", "#CE1126"] },
  { name: "Panama", code: "PAN", flag: "🇵🇦", colors: ["#DA121A", "#FFFFFF", "#072357"] },
  { name: "USA", code: "USA", flag: "🇺🇸", colors: ["#002868", "#FFFFFF", "#BF0A30"] },

  // CONMEBOL (South America)
  { name: "Argentina", code: "ARG", flag: "🇦🇷", colors: ["#74ACDF", "#FFFFFF"] },
  { name: "Bolivia", code: "BOL", flag: "🇧🇴", colors: ["#007934", "#FCE300", "#D52B1E"] },
  { name: "Brazil", code: "BRA", flag: "🇧🇷", colors: ["#009C3B", "#FFDF00", "#002776"] },
  { name: "Colombia", code: "COL", flag: "🇨🇴", colors: ["#FCD116", "#003893", "#CE1126"] },
  { name: "Ecuador", code: "ECU", flag: "🇪🇨", colors: ["#FFD100", "#034EA2", "#CE1126"] },
  { name: "Paraguay", code: "PAR", flag: "🇵🇾", colors: ["#DA121A", "#FFFFFF", "#0038A8"] },
  { name: "Uruguay", code: "URU", flag: "🇺🇾", colors: ["#5CBFEB", "#FFFFFF"] },

  // OFC (Oceania)
  { name: "New Zealand", code: "NZL", flag: "🇳🇿", colors: ["#000000", "#FFFFFF"] },

  // UEFA (Europe) — 12 confirmed group winners
  { name: "Austria", code: "AUT", flag: "🇦🇹", colors: ["#ED2939", "#FFFFFF"] },
  { name: "Belgium", code: "BEL", flag: "🇧🇪", colors: ["#000000", "#FDDA24", "#EF3340"] },
  { name: "Croatia", code: "CRO", flag: "🇭🇷", colors: ["#FF0000", "#FFFFFF", "#171796"] },
  { name: "England", code: "ENG", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", colors: ["#FFFFFF", "#CF081F", "#041E42"] },
  { name: "France", code: "FRA", flag: "🇫🇷", colors: ["#002395", "#FFFFFF", "#ED2939"] },
  { name: "Germany", code: "GER", flag: "🇩🇪", colors: ["#000000", "#DD0000", "#FFCE00"] },
  { name: "Netherlands", code: "NED", flag: "🇳🇱", colors: ["#FF6600", "#FFFFFF", "#21468B"] },
  { name: "Norway", code: "NOR", flag: "🇳🇴", colors: ["#EF2B2D", "#FFFFFF", "#002868"] },
  { name: "Portugal", code: "POR", flag: "🇵🇹", colors: ["#006600", "#FF0000"] },
  { name: "Scotland", code: "SCO", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", colors: ["#003078", "#FFFFFF"] },
  { name: "Spain", code: "ESP", flag: "🇪🇸", colors: ["#AA151B", "#F1BF00"] },
  { name: "Switzerland", code: "SUI", flag: "🇨🇭", colors: ["#DA291C", "#FFFFFF"] },

  // Play-off qualifiers (confirmed from inter-confederation & other play-offs)
  { name: "Congo DR", code: "COD", flag: "🇨🇩", colors: ["#007FFF", "#CE1021", "#F7D618"] },
  { name: "Iraq", code: "IRQ", flag: "🇮🇶", colors: ["#FFFFFF", "#007A3D", "#CE1126", "#000000"] },
  { name: "Jamaica", code: "JAM", flag: "🇯🇲", colors: ["#009B3A", "#000000", "#FED100"] },
  { name: "New Caledonia", code: "NCL", flag: "🇳🇨", colors: ["#002395", "#ED2939", "#009543"] },
  { name: "Suriname", code: "SUR", flag: "🇸🇷", colors: ["#377E3F", "#FFFFFF", "#B40A2D"] },

  // UEFA play-off spots (TBD March 2026) — include top contenders so users can pick
  { name: "Denmark", code: "DEN", flag: "🇩🇰", colors: ["#C8102E", "#FFFFFF"] },
  { name: "Italy", code: "ITA", flag: "🇮🇹", colors: ["#008C45", "#FFFFFF", "#CD212A"] },
  { name: "Poland", code: "POL", flag: "🇵🇱", colors: ["#FFFFFF", "#DC143C"] },
  { name: "Sweden", code: "SWE", flag: "🇸🇪", colors: ["#004B87", "#FECC02"] },
  { name: "Turkey", code: "TUR", flag: "🇹🇷", colors: ["#E30A17", "#FFFFFF"] },
  { name: "Ukraine", code: "UKR", flag: "🇺🇦", colors: ["#005BBB", "#FFD500"] },
  { name: "Wales", code: "WAL", flag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", colors: ["#C8102E", "#FFFFFF", "#00AB39"] },
  { name: "Czechia", code: "CZE", flag: "🇨🇿", colors: ["#FFFFFF", "#D7141A", "#11457E"] },
].sort((a, b) => a.name.localeCompare(b.name));
