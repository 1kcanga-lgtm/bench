import { useState, useEffect, useMemo, useRef } from "react";

const SPORTS = ["Baseball", "Basketball", "Football", "Hockey", "Soccer", "Other"];
// A starter list for the brand datalist -- just suggestions, any brand can still be typed
// freehand. Combined at render time with whatever brands already appear in the collection.
const KNOWN_BRANDS = ["Upper Deck", "Topps", "O-Pee-Chee", "Panini", "Score", "Leaf", "Parkhurst", "In The Game", "SP Authentic", "Ultimate Collection", "Black Diamond"];

// Round 21: team-color theming for the Collection tab, applied only when a team filter is
// active (Kaleb's choice -- not an app-wide re-theme). Colors are each team's own on-ice/branding
// identity from general hockey knowledge, not pulled from any licensed asset -- this app never
// stores or displays an actual team logo/wordmark, just a color wash + CSS motifs, so there's
// nothing here that reproduces a trademarked mark. Covers every team name that appears anywhere
// in this file's own checklist/alumni data (guaranteed to be selectable in the team filter once
// Kaleb owns a matching card) plus a handful of other common Upper Deck-era teams a random pack
// pull could turn up. A team not in this table just keeps the app's normal default look --
// extend this table with a real {primary, accent, ink} triplet if a themed team ever feels flat.
const TEAM_THEMES = {
  "Dallas Stars": { primary: "#006847", accent: "#8A8D8F", ink: "#0B1210" },
  "Minnesota North Stars": { primary: "#154734", accent: "#FFC72C", ink: "#0B1210" },
  "Minnesota Wild": { primary: "#154734", accent: "#A6192E", ink: "#0B1210" },
  "Quebec Nordiques": { primary: "#1E5B94", accent: "#C8102E", ink: "#0C1720" },
  "Buffalo Sabres": { primary: "#002654", accent: "#FCB514", ink: "#0A0F1A" },
  "Florida Panthers": { primary: "#041E42", accent: "#C8102E", ink: "#080D16" },
  "Atlanta Thrashers": { primary: "#041E42", accent: "#5B9BD5", ink: "#080D16" },
  "Ottawa Senators": { primary: "#C52032", accent: "#C69214", ink: "#160406" },
  "Anaheim Ducks": { primary: "#111111", accent: "#F47A38", ink: "#050505" },
  "Boston Bruins": { primary: "#111111", accent: "#FFB81C", ink: "#050505" },
  "Colorado Avalanche": { primary: "#6F263D", accent: "#236192", ink: "#160A0D" },
  "Columbus Blue Jackets": { primary: "#002654", accent: "#CE1126", ink: "#0A0F1A" },
  "Nashville Predators": { primary: "#041E42", accent: "#FFB81C", ink: "#080D16" },
  "New Jersey Devils": { primary: "#C8102E", accent: "#111111", ink: "#160406" },
  "New York Rangers": { primary: "#0038A8", accent: "#CE1126", ink: "#080E1D" },
  "Phoenix Coyotes": { primary: "#8C2633", accent: "#E2D6B5", ink: "#160809" },
  "San Jose Sharks": { primary: "#006D75", accent: "#EA7200", ink: "#04191B" },
  "Washington Capitals": { primary: "#041E42", accent: "#C8102E", ink: "#080D16" },
  "Chicago Blackhawks": { primary: "#CF0A2C", accent: "#FF671B", ink: "#170305" },
  "Detroit Red Wings": { primary: "#CE1126", accent: "#FFFFFF", ink: "#170406" },
  "Edmonton Oilers": { primary: "#041E42", accent: "#FF4C00", ink: "#080D16" },
  "Montreal Canadiens": { primary: "#AF1E2D", accent: "#192168", ink: "#160406" },
  "Pittsburgh Penguins": { primary: "#111111", accent: "#FCB514", ink: "#050505" },
  "St. Louis Blues": { primary: "#002F87", accent: "#FCB514", ink: "#060E1D" },
  "Toronto Maple Leafs": { primary: "#00205B", accent: "#FFFFFF", ink: "#050A15" },
  "Vancouver Canucks": { primary: "#00205B", accent: "#00843D", ink: "#050A15" },
  "Vegas Golden Knights": { primary: "#333F42", accent: "#B4975A", ink: "#0C0E0F" },
  "Winnipeg Jets": { primary: "#041E42", accent: "#7B303E", ink: "#080D16" },
  "Carolina Hurricanes": { primary: "#CE1126", accent: "#111111", ink: "#170406" },
  "Calgary Flames": { primary: "#C8102E", accent: "#FAAF19", ink: "#160406" },
  "Tampa Bay Lightning": { primary: "#00205B", accent: "#FFFFFF", ink: "#050A15" },
  "Los Angeles Kings": { primary: "#111111", accent: "#A2AAAD", ink: "#050505" },
  "Philadelphia Flyers": { primary: "#F74902", accent: "#111111", ink: "#170703" },
  "New York Islanders": { primary: "#00539B", accent: "#F47D30", ink: "#050D1A" },
  "Seattle Kraken": { primary: "#001628", accent: "#99D9D9", ink: "#020508" },
  "Utah Hockey Club": { primary: "#69B3E7", accent: "#010101", ink: "#04121D" },
};

const STORAGE_KEY = "card-ledger-entries";

const CHECKLIST_MANUAL_KEY = "card-ledger-checklist-manual";
// Persisted seller bundles (round 31) -- each is { id, kind, team, cardIds, createdAt, sold }.
// Separate from the ledger itself so "physically bundled" cards can be looked up by id from the
// live `cards` array (values/photos etc. always reflect whatever's currently saved) while the
// *grouping* itself -- which cards go together -- stays fixed once Kaleb locks it in, instead of
// reshuffling every time the Sellers tab recomputes its suggestions.
const SELLER_BUNDLES_KEY = "card-ledger-seller-bundles";
// Round 38: which cards Kaleb has physically found/pulled while assembling a not-yet-bundled
// Suggested listing -- just a set of card ids, separate from the bundles themselves (a listing's
// card ids aren't locked in until "Mark as bundled"). Persisted the same way bundles are so
// progress survives a refresh/reload while he works through a pack over more than one sitting.
const SELLER_FOUND_KEY = "card-ledger-seller-found-ids";
// Round 39: cards Kaleb has flagged as "can't find" while pulling a pack together -- excluded
// from every future suggested listing (see the `available` filter in SellerPanel) until cleared,
// and swapped out of an already-locked-in bundle for a different eligible card the moment it's
// flagged (see toggleSellerCantFind below), so a pack he's actively assembling doesn't just come
// up one card short.
const SELLER_CANT_FIND_KEY = "card-ledger-seller-cant-find-ids";
// Filenames already seen in a watched scan folder, so re-checking it only turns up genuinely new
// scans rather than re-queuing everything in the folder every time.
const WATCH_SEEN_KEY = "card-ledger-watch-seen-files";
// A running, best-effort estimate of API spend (identify/appraise/price-lookup calls combined),
// computed from each response's own usage numbers -- not a substitute for the real total in the
// Anthropic console, but enough to see where the money's actually going without waiting to be
// surprised by the bill.
const USAGE_LOG_KEY = "card-ledger-usage-log";

// Upper Deck base-set checklists for the Minnesota North Stars / Dallas Stars franchise,
// compiled from Trading Card Database (tradingcarddb.com) team checklists -- TCDB is treated
// as the primary source of truth for this data (see sourceUrl per set, and CHECKLIST_NOTES).
// Base/flagship sets only -- no inserts, parallels, or non-Upper-Deck brands. Corrections found
// by cross-checking against TCDB directly (e.g. 1990-91 #547 Neil Wilkinson, added 2026-09-04
// after being spotted missing) should be applied here the same way.
const CHECKLIST_SETS = [
  {
    year: "1990-91", setName: "Upper Deck", team: "Minnesota North Stars", baseSetSize: 550,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/4878/team/324/Minnesota%20North%20Stars",
    cards: [{n:"9",p:"Curt Giles"}, {n:"28",p:"Don Barber"}, {n:"30",p:"Basil McRae"}, {n:"46",p:"Mike Modano"}, {n:"48",p:"Neal Broten"}, {n:"106",p:"Shawn Chambers"}, {n:"108",p:"Gaetan Duchesne"}, {n:"126",p:"Brian Bellows"}, {n:"150",p:"Stewart Gavin"}, {n:"210",p:"Aaron Broten"}, {n:"229",p:"Larry Murphy"}, {n:"235",p:"Peter Lappin"}, {n:"248",p:"Dave Gagner"}, {n:"283",p:"Ulf Dahlen"}, {n:"308",p:"Brian Bellows"}, {n:"346",p:"Mike Modano"}, {n:"359",p:"Derian Hatcher"}, {n:"381",p:"Daniel Berthiaume"}, {n:"383",p:"Frantisek Musil"}, {n:"385",p:"Jon Casey"}, {n:"406",p:"Bobby Smith"}, {n:"409",p:"Brian Propp"}, {n:"449",p:"Brian Hayward"}, {n:"547",p:"Neil Wilkinson"}],
  },
  {
    year: "1991-92", setName: "Upper Deck", team: "Minnesota North Stars", baseSetSize: 700,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/4896/team/324/Minnesota%20North%20Stars",
    cards: [{n:"51",p:"Enrico Ciccone"}, {n:"125",p:"Mike Craig"}, {n:"158",p:"Brian Glynn"}, {n:"160",p:"Mike Modano"}, {n:"180",p:"Dave Gagner"}, {n:"205",p:"Jon Casey"}, {n:"207",p:"Gaetan Duchesne"}, {n:"232",p:"Neal Broten"}, {n:"236",p:"Brian Bellows"}, {n:"260",p:"Brian Propp"}, {n:"274",p:"Marc Bureau"}, {n:"293",p:"Bobby Smith"}, {n:"295",p:"Mark Tinordi"}, {n:"307",p:"Chris Dahlquist"}, {n:"348",p:"Ulf Dahlen"}, {n:"388",p:"Basil McRae"}, {n:"544",p:"Todd Elik"}, {n:"546",p:"Derian Hatcher"}],
  },
  {
    year: "1992-93", setName: "Upper Deck", team: "Minnesota North Stars", baseSetSize: 640,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/4926/team/324/Minnesota%20North%20Stars",
    cards: [{n:"9",p:"Mike Modano"}, {n:"35",p:"Kevin Miller"}, {n:"62",p:"Trent Klatt"}, {n:"65",p:"Mike Craig"}, {n:"73",p:"Mark Tinordi"}, {n:"90",p:"Enrico Ciccone"}, {n:"172",p:"Brian Bellows"}, {n:"174",p:"Dave Gagner"}, {n:"177",p:"Brian Propp"}, {n:"190",p:"Jon Casey"}, {n:"206",p:"Neal Broten"}, {n:"210",p:"Todd Elik"}, {n:"247",p:"Kip Miller"}, {n:"250",p:"Ulf Dahlen"}, {n:"287",p:"Derian Hatcher"}, {n:"305",p:"Mike Modano"}, {n:"441",p:"Russ Courtnall"}, {n:"469",p:"Gaetan Duchesne"}, {n:"505",p:"Richard Matvichuk"}, {n:"528",p:"Tommy Sjodin"}, {n:"538",p:"Mike McPhee"}],
  },
  {
    year: "1993-94", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 575,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/5001/team/298/Dallas%20Stars",
    cards: [{n:"32",p:"Russ Courtnall"}, {n:"43",p:"Mike McPhee"}, {n:"55",p:"Richard Matvichuk"}, {n:"89",p:"Mark Tinordi"}, {n:"109",p:"Neal Broten"}, {n:"145",p:"Dave Gagner"}, {n:"152",p:"Trent Klatt"}, {n:"191",p:"Mike Craig"}, {n:"204",p:"Derian Hatcher"}, {n:"294",p:"Mike Modano"}, {n:"329",p:"Brent Gilchrist"}, {n:"360",p:"Ulf Dahlen"}, {n:"397",p:"Mike Modano"}, {n:"422",p:"Jarkko Varvio"}, {n:"441",p:"Paul Cavallini"}, {n:"468",p:"Paul Broten"}, {n:"478",p:"Andy Moog"}, {n:"517",p:"James Black"}],
  },
  {
    year: "1994-95", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 570,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/5091/team/298/Dallas%20Stars",
    cards: [{n:"15",p:"Paul Broten"}, {n:"31",p:"Russ Courtnall"}, {n:"48",p:"Dean Evason"}, {n:"58",p:"Mike Modano"}, {n:"81",p:"Andy Moog"}, {n:"127",p:"Derian Hatcher"}, {n:"140",p:"Peter Zezel"}, {n:"157",p:"Richard Matvichuk"}, {n:"186",p:"Shane Churla"}, {n:"260",p:"Mark Lawrence"}, {n:"267",p:"Todd Harvey"}, {n:"273",p:"Neal Broten"}, {n:"311",p:"Paul Cavallini"}, {n:"326",p:"Mike Kennedy"}, {n:"332",p:"Kevin Hatcher"}, {n:"347",p:"Brent Gilchrist"}, {n:"374",p:"Trent Klatt"}, {n:"382",p:"Dave Gagner"}, {n:"429",p:"Jarkko Varvio"}, {n:"459",p:"Darcy Wakaluk"}, {n:"536",p:"Todd Harvey"}, {n:"546",p:"Todd Harvey"}],
  },
  {
    year: "1995-96", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 570,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/5226/team/298/Dallas%20Stars",
    cards: [{n:"3",p:"Derian Hatcher"}, {n:"26",p:"Greg Adams"}, {n:"37",p:"Richard Matvichuk"}, {n:"87",p:"Mike Donnelly"}, {n:"105",p:"Corey Millen"}, {n:"162",p:"Trent Klatt"}, {n:"191",p:"Andy Moog"}, {n:"199",p:"Todd Harvey"}, {n:"220",p:"Mike Modano"}, {n:"256",p:"Kevin Hatcher"}, {n:"273",p:"Guy Carbonneau"}, {n:"285",p:"Joe Nieuwendyk"}, {n:"309",p:"Kevin Hatcher"}, {n:"326",p:"Brent Gilchrist"}, {n:"362",p:"Grant Marshall"}, {n:"370",p:"Dave Gagner"}, {n:"398",p:"Jere Lehtinen"}, {n:"420",p:"Mike Modano"}, {n:"458",p:"Shane Churla"}, {n:"503",p:"Jamie Langenbrunner"}],
  },
  {
    year: "1996-97", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 390,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/5356/team/298/Dallas%20Stars",
    cards: [{n:"43",p:"Mike Modano"}, {n:"44",p:"Derian Hatcher"}, {n:"45",p:"Todd Harvey"}, {n:"46",p:"Brent Fedyk"}, {n:"47",p:"Grant Marshall"}, {n:"48",p:"Jamie Langenbrunner"}, {n:"49",p:"Jere Lehtinen"}, {n:"245",p:"Joe Nieuwendyk"}, {n:"246",p:"Sergei Zubov"}, {n:"247",p:"Benoit Hogue"}, {n:"248",p:"Arturs Irbe"}, {n:"249",p:"Pat Verbeek"}, {n:"363",p:"Mike Modano"}],
  },
  {
    // Not a flagship Upper Deck base set -- Collector's Choice was a separate budget sub-brand.
    // Added as its own minimal "season" purely so Turek's Young Guns card (a real Dallas Stars
    // card, confirmed against the physical card) shows up on the Young Guns tab, which filters
    // CHECKLIST_SETS for yg:true. It will also appear as a 1-card "season" on the main Stars
    // Checklist (base-set-completion) tab -- a known, accepted side effect of reusing this
    // structure rather than a real gap in the checklist.
    year: "1996-97", setName: "Collector's Choice - Young Guns", team: "Dallas Stars", baseSetSize: 1,
    sourceUrl: "https://www.tcdb.com/ViewSet.cfm/sid/5247/1996-97-Collector's-Choice",
    cards: [{n:"358",p:"Roman Turek",yg:true}],
  },
  {
    year: "1997-98", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 420,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/5477/team/298/Dallas%20Stars",
    cards: [{n:"50",p:"Joe Nieuwendyk"}, {n:"51",p:"Derian Hatcher"}, {n:"52",p:"Jere Lehtinen"}, {n:"53",p:"Roman Turek"}, {n:"54",p:"Darryl Sydor"}, {n:"55",p:"Todd Harvey"}, {n:"56",p:"Mike Modano"}, {n:"259",p:"Ed Belfour"}, {n:"260",p:"Jamie Langenbrunner"}, {n:"261",p:"Juha Lind"}, {n:"262",p:"Pat Verbeek"}, {n:"263",p:"Sergei Zubov"}, {n:"264",p:"Dave Reid"}, {n:"265",p:"Greg Adams"}, {n:"397",p:"Derian Hatcher"}],
  },
  {
    year: "1998-99", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 420,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/5511/team/298/Dallas%20Stars",
    cards: [{n:"30",p:"Mike Modano"}, {n:"76",p:"Brett Hull"}, {n:"77",p:"Mike Keane"}, {n:"78",p:"Joe Nieuwendyk"}, {n:"79",p:"Darryl Sydor"}, {n:"80",p:"Ed Belfour"}, {n:"81",p:"Jamie Langenbrunner"}, {n:"82",p:"Petr Buzek"}, {n:"253",p:"Jamie Wright"}, {n:"254",p:"Sergei Zubov"}, {n:"255",p:"Richard Matvichuk"}, {n:"256",p:"Mike Modano"}, {n:"257",p:"Pat Verbeek"}, {n:"258",p:"Jere Lehtinen"}, {n:"259",p:"Derian Hatcher"}, {n:"260",p:"Jason Botterill"}],
  },
  {
    year: "1999-00", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 335,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/5532/team/298/Dallas%20Stars",
    cards: [{n:"43",p:"Brett Hull"}, {n:"44",p:"Ed Belfour"}, {n:"45",p:"Jamie Langenbrunner"}, {n:"46",p:"Derian Hatcher"}, {n:"47",p:"Jon Sim"}, {n:"48",p:"Joe Nieuwendyk"}, {n:"144",p:"Brett Hull"}, {n:"152",p:"Mike Modano"}, {n:"215",p:"Jere Lehtinen"}, {n:"216",p:"Mike Modano"}, {n:"217",p:"Darryl Sydor"}, {n:"218",p:"Sergei Zubov"}, {n:"219",p:"Pavel Patera"}, {n:"220",p:"Jamie Pushor"}],
  },
  {
    year: "2000-01", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 440,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/5572/team/298/Dallas%20Stars",
    cards: [{n:"55",p:"Mike Modano"}, {n:"56",p:"Joe Nieuwendyk"}, {n:"57",p:"Mike Keane"}, {n:"58",p:"Darryl Sydor"}, {n:"59",p:"Brenden Morrow"}, {n:"60",p:"Jere Lehtinen"}, {n:"61",p:"Derian Hatcher"}, {n:"183",p:"Keith Aldridge",yg:true}, {n:"284",p:"Brett Hull"}, {n:"285",p:"Sergei Zubov"}, {n:"286",p:"Jamie Langenbrunner"}, {n:"287",p:"Ed Belfour"}, {n:"288",p:"Roman Lyashenko"}, {n:"289",p:"Ted Donato"}, {n:"428",p:"Marty Turco",yg:true}],
  },
  {
    year: "2001-02", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 441,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/5615/team/298/Dallas%20Stars",
    cards: [{n:"55",p:"Mike Modano"}, {n:"56",p:"Ed Belfour"}, {n:"57",p:"Pierre Turgeon"}, {n:"58",p:"Jamie Langenbrunner"}, {n:"59",p:"Brenden Morrow"}, {n:"60",p:"Donald Audette"}, {n:"284",p:"Sergei Zubov"}, {n:"285",p:"Jere Lehtinen"}, {n:"286",p:"Joe Nieuwendyk"}, {n:"287",p:"Darryl Sydor"}, {n:"288",p:"Rob DiMaio"}, {n:"289",p:"Valeri Kamensky"}, {n:"421",p:"Niko Kapanen",yg:true}],
  },
  {
    year: "2002-03", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 456,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/5663/team/298/Dallas%20Stars",
    cards: [{n:"55",p:"Bill Guerin"}, {n:"56",p:"Mike Modano"}, {n:"57",p:"Sergei Zubov"}, {n:"58",p:"Marty Turco"}, {n:"59",p:"Jason Arnott"}, {n:"60",p:"Jere Lehtinen"}, {n:"300",p:"Ron Tugnutt"}, {n:"301",p:"Scott Young"}, {n:"302",p:"Pierre Turgeon"}, {n:"303",p:"Derian Hatcher"}, {n:"304",p:"Richard Matvichuk"}, {n:"305",p:"Kirk Muller"}],
  },
  {
    year: "2003-04", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 475,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/5713/team/298/Dallas%20Stars",
    cards: [{n:"59",p:"Mike Modano"}, {n:"60",p:"Sergei Zubov"}, {n:"61",p:"Jere Lehtinen"}, {n:"62",p:"Steve Ott"}, {n:"63",p:"Niko Kapanen"}, {n:"64",p:"Jason Bacashihua"}, {n:"65",p:"Marty Turco"}, {n:"215",p:"Antti Miettinen",yg:true}, {n:"302",p:"Brenden Morrow"}, {n:"303",p:"Jason Arnott"}, {n:"304",p:"Pierre Turgeon"}, {n:"305",p:"Bill Guerin"}, {n:"306",p:"Teppo Numminen"}, {n:"307",p:"Ron Tugnutt"}, {n:"308",p:"Stu Barnes"}, {n:"467",p:"Trevor Daley",yg:true}],
  },
  {
    year: "2004-05", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 210,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/5736/team/298/Dallas%20Stars",
    cards: [{n:"54",p:"Mike Modano"}, {n:"55",p:"Sergei Zubov"}, {n:"56",p:"Bill Guerin"}, {n:"57",p:"Jason Arnott"}, {n:"58",p:"Niko Kapanen"}, {n:"59",p:"Marty Turco"}],
  },
  {
    year: "2005-06", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 487,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/5751/team/298/Dallas%20Stars",
    cards: [{n:"58",p:"Bill Guerin"}, {n:"59",p:"Brenden Morrow"}, {n:"60",p:"Sergei Zubov"}, {n:"61",p:"Jaroslav Svoboda"}, {n:"62",p:"Steve Ott"}, {n:"63",p:"Jason Arnott"}, {n:"64",p:"Niko Kapanen"}, {n:"65",p:"Stu Barnes"}, {n:"305",p:"Mike Modano"}, {n:"306",p:"Marty Turco"}, {n:"307",p:"Jere Lehtinen"}, {n:"308",p:"Johan Hedberg"}, {n:"309",p:"Philippe Boucher"}, {n:"310",p:"Antti Miettinen"}, {n:"311",p:"Trevor Daley"}, {n:"459",p:"Jussi Jokinen",yg:true}],
  },
  {
    year: "2006-07", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 495,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/5792/team/298/Dallas%20Stars",
    cards: [{n:"61",p:"Marty Turco"}, {n:"62",p:"Brenden Morrow"}, {n:"63",p:"Jussi Jokinen"}, {n:"64",p:"Sergei Zubov"}, {n:"65",p:"Jere Lehtinen"}, {n:"66",p:"Steve Ott"}, {n:"67",p:"Philippe Boucher"}, {n:"210",p:"Loui Eriksson",yg:true}, {n:"313",p:"Mike Modano"}, {n:"314",p:"Antti Miettinen"}, {n:"315",p:"Jeff Halpern"}, {n:"316",p:"Patrik Stefan"}, {n:"317",p:"Mike Ribeiro"}, {n:"318",p:"Eric Lindros"}],
  },
  {
    year: "2007-08", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 500,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/6600/team/298/Dallas%20Stars",
    cards: [{n:"82",p:"Mike Modano"}, {n:"83",p:"Sergei Zubov"}, {n:"84",p:"Mike Smith"}, {n:"85",p:"Mike Ribeiro"}, {n:"86",p:"Brenden Morrow"}, {n:"87",p:"Jussi Jokinen"}, {n:"88",p:"Jeff Halpern"}, {n:"216",p:"Matt Niskanen",yg:true}, {n:"333",p:"Marty Turco"}, {n:"334",p:"Philippe Boucher"}, {n:"335",p:"Loui Eriksson"}, {n:"336",p:"Mattias Norstrom"}, {n:"337",p:"Mike Modano"}, {n:"338",p:"Jere Lehtinen"}, {n:"468",p:"Tobias Stephan",yg:true}, {n:"469",p:"Chris Conner",yg:true}],
  },
  {
    year: "2008-09", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 500,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/8985/team/298/Dallas%20Stars",
    cards: [{n:"133",p:"Mike Modano"}, {n:"134",p:"Sergei Zubov"}, {n:"135",p:"Brenden Morrow"}, {n:"136",p:"Brad Richards"}, {n:"137",p:"Trevor Daley"}, {n:"138",p:"Matt Niskanen"}, {n:"139",p:"Steve Ott"}, {n:"209",p:"James Neal",yg:true}, {n:"210",p:"Mark Fistric",yg:true}, {n:"310",p:"Jere Lehtinen"}, {n:"311",p:"Mike Ribeiro"}, {n:"312",p:"Philippe Boucher"}, {n:"313",p:"Marty Turco"}, {n:"314",p:"Stephane Robidas"}, {n:"315",p:"Toby Petersen"}, {n:"316",p:"Loui Eriksson"}, {n:"317",p:"Sean Avery"}, {n:"467",p:"Fabian Brunnstrom",yg:true}],
  },
  {
    year: "2009-10", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 500,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/9639/team/298/Dallas%20Stars",
    cards: [{n:"102",p:"Jeff Woywitka"}, {n:"139",p:"Mike Modano"}, {n:"140",p:"Stephane Robidas"}, {n:"141",p:"Brenden Morrow"}, {n:"142",p:"Mike Ribeiro"}, {n:"143",p:"Matt Niskanen"}, {n:"144",p:"Loui Eriksson"}, {n:"212",p:"Jamie Benn",yg:true}, {n:"222",p:"Ivan Vishnevskiy",yg:true}, {n:"389",p:"Marty Turco"}, {n:"390",p:"James Neal"}, {n:"391",p:"Steve Ott"}, {n:"392",p:"Jere Lehtinen"}, {n:"393",p:"Fabian Brunnstrom"}, {n:"394",p:"Brad Richards"}, {n:"458",p:"Perttu Lindgren",yg:true}, {n:"459",p:"Aaron Gagnon",yg:true}],
  },
  {
    year: "2010-11", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 500,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/10727/team/298/Dallas%20Stars",
    cards: [{n:"135",p:"Matt Niskanen"}, {n:"136",p:"Brad Richards"}, {n:"137",p:"Loui Eriksson"}, {n:"138",p:"Brenden Morrow"}, {n:"139",p:"Jamie Benn"}, {n:"140",p:"Stephane Robidas"}, {n:"218",p:"Philip Larsen",yg:true}, {n:"307",p:"James Neal"}, {n:"308",p:"Mike Ribeiro"}, {n:"309",p:"Kari Lehtonen"}, {n:"310",p:"Steve Ott"}, {n:"311",p:"Trevor Daley"}, {n:"312",p:"Fabian Brunnstrom"}],
  },
  {
    year: "2011-12", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 500,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/59609/team/298/Dallas%20Stars",
    cards: [{n:"140",p:"Brenden Morrow"}, {n:"141",p:"Kari Lehtonen"}, {n:"142",p:"Alex Goligoski"}, {n:"143",p:"Mike Ribeiro"}, {n:"144",p:"Jamie Benn"}, {n:"145",p:"Steve Ott"}, {n:"213",p:"Tomas Vincour",yg:true}, {n:"394",p:"Loui Eriksson"}, {n:"395",p:"Sheldon Souray"}, {n:"396",p:"Michael Ryder"}, {n:"397",p:"Toby Petersen"}, {n:"398",p:"Stephane Robidas"}, {n:"399",p:"Andrew Raycroft"}, {n:"466",p:"Jordie Benn",yg:true}],
  },
  {
    year: "2012-13", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 250,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/72732/team/298/Dallas%20Stars",
    cards: [{n:"53",p:"Kari Lehtonen"}, {n:"54",p:"Stephane Robidas"}, {n:"55",p:"Alex Goligoski"}, {n:"56",p:"Brenden Morrow"}, {n:"57",p:"Jamie Benn"}, {n:"58",p:"Michael Ryder"}, {n:"218",p:"Ryan Garbutt",yg:true}, {n:"219",p:"Reilly Smith",yg:true}, {n:"220",p:"Brenden Dillon",yg:true}, {n:"221",p:"Scott Glennie",yg:true}],
  },
  {
    year: "2013-14", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 500,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/82447/team/298/Dallas%20Stars",
    cards: [{n:"135",p:"Jamie Benn"}, {n:"136",p:"Alex Goligoski"}, {n:"137",p:"Ray Whitney"}, {n:"138",p:"Cody Eakin"}, {n:"139",p:"Brenden Dillon"}, {n:"140",p:"Kari Lehtonen"}, {n:"235",p:"Alex Chiasson",yg:true}, {n:"236",p:"Valeri Nichushkin",yg:true}, {n:"309",p:"Stephane Robidas"}, {n:"310",p:"Shawn Horcoff"}, {n:"311",p:"Erik Cole"}, {n:"312",p:"Tyler Seguin"}, {n:"313",p:"Trevor Daley"}, {n:"314",p:"Rich Peverley"}, {n:"315",p:"Sergei Gonchar"}, {n:"473",p:"Jack Campbell",yg:true}, {n:"490",p:"Antoine Roussel",yg:true}],
  },
  {
    year: "2014-15", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 500,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/97337/team/298/Dallas%20Stars",
    cards: [{n:"58",p:"Tyler Seguin"}, {n:"59",p:"Alex Goligoski"}, {n:"60",p:"Cody Eakin"}, {n:"61",p:"Ryan Garbutt"}, {n:"62",p:"Rich Peverley"}, {n:"63",p:"Vernon Fiddler"}, {n:"64",p:"Erik Cole"}, {n:"65",p:"Shawn Horcoff"}, {n:"66",p:"Colton Sceviour"}, {n:"219",p:"Patrik Nemeth",yg:true}, {n:"307",p:"Antoine Roussel"}, {n:"308",p:"Jordie Benn"}, {n:"309",p:"Jason Spezza"}, {n:"310",p:"Trevor Daley"}, {n:"311",p:"Kari Lehtonen"}, {n:"312",p:"Jamie Benn"}, {n:"313",p:"Valeri Nichushkin"}, {n:"314",p:"Ales Hemsky"}, {n:"461",p:"Jyrki Jokipakka",yg:true}, {n:"476",p:"John Klingberg",yg:true}, {n:"482",p:"Curtis McKenzie",yg:true}, {n:"496",p:"Brett Ritchie",yg:true}],
  },
  {
    year: "2015-16", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 500,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/114279/team/298/Dallas%20Stars",
    cards: [{n:"57",p:"Ales Hemsky"}, {n:"58",p:"Antoine Roussel"}, {n:"59",p:"Alex Goligoski"}, {n:"60",p:"John Klingberg"}, {n:"61",p:"Kari Lehtonen"}, {n:"62",p:"Tyler Seguin"}, {n:"244",p:"Mattias Janmark",yg:true}, {n:"311",p:"Patrick Sharp"}, {n:"312",p:"Jason Spezza"}, {n:"313",p:"Johnny Oduya"}, {n:"314",p:"Jamie Benn"}, {n:"315",p:"Antti Niemi"}, {n:"316",p:"Cody Eakin"}, {n:"463",p:"Brendan Ranford",yg:true}, {n:"479",p:"Radek Faksa",yg:true}, {n:"489",p:"Devin Shore",yg:true}],
  },
  {
    year: "2016-17", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 500,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/132652/team/298/Dallas%20Stars",
    cards: [{n:"59",p:"Ales Hemsky"}, {n:"60",p:"Cody Eakin"}, {n:"61",p:"Jamie Benn"}, {n:"62",p:"Jason Spezza"}, {n:"63",p:"John Klingberg"}, {n:"64",p:"Johnny Oduya"}, {n:"65",p:"Kari Lehtonen"}, {n:"237",p:"Esa Lindell",yg:true}, {n:"309",p:"Antti Niemi"}, {n:"310",p:"Patrick Sharp"}, {n:"311",p:"Tyler Seguin"}, {n:"312",p:"Jiri Hudler"}, {n:"313",p:"Dan Hamhuis"}, {n:"314",p:"Antoine Roussel"}, {n:"465",p:"Gemel Smith",yg:true}, {n:"481",p:"Stephen Johns",yg:true}, {n:"497",p:"Jason Dickinson",yg:true}],
  },
  {
    year: "2017-18", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 500,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/154987/team/298/Dallas%20Stars",
    cards: [{n:"58",p:"Antoine Roussel"}, {n:"59",p:"Radek Faksa"}, {n:"60",p:"Dan Hamhuis"}, {n:"61",p:"Jason Spezza"}, {n:"62",p:"Kari Lehtonen"}, {n:"63",p:"Stephen Johns"}, {n:"64",p:"Tyler Seguin"}, {n:"208",p:"Denis Gurianov",yg:true}, {n:"307",p:"Marc Methot"}, {n:"308",p:"Jamie Benn"}, {n:"309",p:"Martin Hanzal"}, {n:"310",p:"Ben Bishop"}, {n:"311",p:"Alexander Radulov"}, {n:"312",p:"Esa Lindell"}, {n:"463",p:"Remi Elie",yg:true}],
  },
  {
    year: "2018-19", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 500,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/179025/team/298/Dallas%20Stars",
    cards: [{n:"58",p:"Jason Spezza"}, {n:"59",p:"John Klingberg"}, {n:"60",p:"Ben Bishop"}, {n:"61",p:"Radek Faksa"}, {n:"62",p:"Stephen Johns"}, {n:"63",p:"Jamie Benn"}, {n:"202",p:"Roope Hintz",yg:true}, {n:"246",p:"Miro Heiskanen",yg:true}, {n:"309",p:"Mattias Janmark"}, {n:"310",p:"Tyler Seguin"}, {n:"311",p:"Alexander Radulov"}, {n:"312",p:"Marc Methot"}, {n:"313",p:"Valeri Nichushkin"}, {n:"314",p:"Connor Carrick"}, {n:"467",p:"Gavin Bayreuther",yg:true}],
  },
  {
    year: "2019-20", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 500,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/205523/team/298/Dallas%20Stars",
    cards: [{n:"143",p:"Tyler Seguin"}, {n:"144",p:"Alexander Radulov"}, {n:"145",p:"Radek Faksa"}, {n:"146",p:"Roope Hintz"}, {n:"147",p:"John Klingberg"}, {n:"148",p:"Esa Lindell"}, {n:"217",p:"Joel L'Esperance",yg:true}, {n:"393",p:"Joe Pavelski"}, {n:"394",p:"Corey Perry"}, {n:"395",p:"Jamie Benn"}, {n:"396",p:"Ben Bishop"}, {n:"397",p:"Andrej Sekera"}, {n:"398",p:"Miro Heiskanen"}, {n:"465",p:"Rhett Gardner",yg:true}],
  },
  {
    year: "2020-21", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 730,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/235048/team/298/Dallas%20Stars",
    cards: [{n:"58",p:"Ben Bishop"}, {n:"59",p:"John Klingberg"}, {n:"60",p:"Esa Lindell"}, {n:"61",p:"Joe Pavelski"}, {n:"62",p:"Alexander Radulov"}, {n:"63",p:"Tyler Seguin"}, {n:"207",p:"Joel Kiviranta",yg:true}, {n:"213",p:"Ty Dellandrea",yg:true}, {n:"227",p:"Thomas Harley",yg:true}, {n:"235",p:"Jason Robertson",yg:true}, {n:"246",p:"Jake Oettinger",yg:true}, {n:"310",p:"Jamie Benn"}, {n:"311",p:"Radek Faksa"}, {n:"312",p:"Denis Gurianov"}, {n:"313",p:"Miro Heiskanen"}, {n:"314",p:"Roope Hintz"}, {n:"315",p:"Anton Khudobin"}, {n:"316",p:"Corey Perry"}, {n:"540",p:"Nick Caamano"}, {n:"541",p:"Andrew Cogliano"}, {n:"542",p:"Justin Dowling"}, {n:"543",p:"Tanner Kero"}, {n:"664",p:"Tyler Seguin"}],
  },
  {
    year: "2021-22", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 750,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/269908/team/298/Dallas%20Stars",
    cards: [{n:"58",p:"Miro Heiskanen"}, {n:"59",p:"Denis Gurianov"}, {n:"60",p:"Anton Khudobin"}, {n:"61",p:"Alexander Radulov"}, {n:"62",p:"Jason Robertson"}, {n:"63",p:"Tyler Seguin"}, {n:"307",p:"Jamie Benn"}, {n:"308",p:"Radek Faksa"}, {n:"309",p:"Roope Hintz"}, {n:"310",p:"Esa Lindell"}, {n:"311",p:"John Klingberg"}, {n:"312",p:"Joe Pavelski"}, {n:"492",p:"Jacob Peterson"}, {n:"555",p:"Jani Hakanpaa"}, {n:"556",p:"Braden Holtby"}, {n:"557",p:"Luke Glendening"}, {n:"558",p:"Michael Raffl"}, {n:"559",p:"Ryan Suter"}, {n:"713",p:"Riley Tufte",yg:true}, {n:"741",p:"Riley Damiani",yg:true}],
  },
  {
    year: "2022-23", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 750,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/307417/team/298/Dallas%20Stars",
    cards: [{n:"58",p:"Denis Gurianov"}, {n:"59",p:"Jani Hakanpaa"}, {n:"60",p:"Miro Heiskanen"}, {n:"61",p:"Jason Robertson"}, {n:"62",p:"Ryan Suter"}, {n:"229",p:"Fredrik Karlstrom",yg:true}, {n:"306",p:"Tyler Seguin"}, {n:"308",p:"Jamie Benn"}, {n:"309",p:"Roope Hintz"}, {n:"310",p:"Joe Pavelski"}, {n:"311",p:"Jake Oettinger"}, {n:"313",p:"Jacob Peterson"}, {n:"459",p:"Wyatt Johnston",yg:true}, {n:"544",p:"Mason Marchment"}, {n:"545",p:"Colin Miller"}, {n:"546",p:"Nils Lundkvist"}, {n:"547",p:"Scott Wedgewood"}, {n:"548",p:"Luke Glendening"}, {n:"669",p:"Joe Pavelski"}, {n:"704",p:"Matej Blumel",yg:true}, {n:"710",p:"Fredrik Olofsson",yg:true}, {n:"747",p:"Wyatt Johnston"}],
  },
  {
    year: "2023-24", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 750,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/360182/team/298/Dallas%20Stars",
    cards: [{n:"55",p:"Roope Hintz"}, {n:"56",p:"Joe Pavelski"}, {n:"57",p:"Tyler Seguin"}, {n:"58",p:"Jamie Benn"}, {n:"59",p:"Radek Faksa"}, {n:"60",p:"Jake Oettinger"}, {n:"305",p:"Jason Robertson"}, {n:"306",p:"Mason Marchment"}, {n:"307",p:"Ty Dellandrea"}, {n:"308",p:"Wyatt Johnston"}, {n:"309",p:"Miro Heiskanen"}, {n:"310",p:"Esa Lindell"}, {n:"463",p:"Matt Murray",yg:true}, {n:"543",p:"Evgenii Dadonov"}, {n:"544",p:"Craig Smith"}, {n:"545",p:"Matt Duchene"}, {n:"546",p:"Sam Steel"}, {n:"547",p:"Jani Hakanpaa"}, {n:"548",p:"Ryan Suter"}, {n:"670",p:"Jason Robertson"}],
  },
  {
    year: "2024-25", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 750,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/431741/team/298/Dallas%20Stars",
    cards: [{n:"61",p:"Jake Oettinger"}, {n:"62",p:"Jason Robertson"}, {n:"63",p:"Wyatt Johnston"}, {n:"64",p:"Jamie Benn"}, {n:"65",p:"Mason Marchment"}, {n:"66",p:"Ryan Suter"}, {n:"215",p:"Mavrik Bourque",yg:true}, {n:"244",p:"Logan Stankoven",yg:true}, {n:"297",p:"Matt Duchene"}, {n:"298",p:"Evgenii Dadonov"}, {n:"299",p:"Tyler Seguin"}, {n:"300",p:"Esa Lindell"}, {n:"301",p:"Nils Lundkvist"}, {n:"302",p:"Sam Steel"}, {n:"303",p:"Thomas Harley"}, {n:"465",p:"Oskar Back",yg:true}, {n:"541",p:"Miro Heiskanen"}, {n:"542",p:"Matt Dumba"}, {n:"543",p:"Roope Hintz"}, {n:"544",p:"Casey DeSmith"}, {n:"545",p:"Ilya Lyubushkin"}, {n:"660",p:"Jake Oettinger"}, {n:"704",p:"Lian Bichsel",yg:true}, {n:"723",p:"Justin Hryckowian",yg:true}, {n:"728",p:"Arttu Hyry",yg:true}, {n:"741",p:"Mavrik Bourque"}],
  },
  {
    year: "2025-26", setName: "Upper Deck", team: "Dallas Stars", baseSetSize: 750,
    sourceUrl: "https://www.tcdb.com/ViewTeams.cfm/sid/515638/team/298/Dallas%20Stars",
    cards: [{n:"50",p:"Matt Dumba"}, {n:"51",p:"Tyler Seguin"}, {n:"52",p:"Ilya Lyubushkin"}, {n:"53",p:"Jason Robertson"}, {n:"54",p:"Roope Hintz"}, {n:"55",p:"Miro Heiskanen"}, {n:"301",p:"Mavrik Bourque"}, {n:"302",p:"Thomas Harley"}, {n:"303",p:"Jamie Benn"}, {n:"304",p:"Casey DeSmith"}, {n:"305",p:"Mikko Rantanen"}, {n:"306",p:"Wyatt Johnston"}, {n:"538",p:"Matt Duchene"}, {n:"539",p:"Esa Lindell"}, {n:"540",p:"Jake Oettinger"}, {n:"541",p:"Radek Faksa"}, {n:"542",p:"Colin Blackwell"}],
  },
];

const CHECKLIST_NOTES = [
  "No Upper Deck NHL hockey base/flagship set was found for 1989-90 (Upper Deck's first hockey products began with 1990-91). Upper Deck appears to have held an NHL license continuously from 1990-91 through 2025-26 (they became the NHL's exclusive trading card licensee starting with 2005-06); there is no true gap year with zero Upper Deck NHL-branded flagship release, contrary to the assumption in the request.",
  "2004-05 Upper Deck Hockey (210-card base set) was released during the 2004-05 NHL lockout season in which no games were played; the set uses prior-season player/team info and is much smaller than adjacent years. Treat this year's checklist with extra caution since the 'season' had no games.",
  "2005-06 onward, Upper Deck's flagship product was typically issued in 'Series 1' and 'Series 2' waves but TCDB (and the hobby generally) catalogs them together as one combined base set/checklist per season (e.g. '2016-17 Upper Deck'); this file follows that convention rather than splitting Series 1/2 into separate entries.",
  "1990-91 through 1992-93 team checklists were pulled under 'Minnesota North Stars' (TCDB team id 324); 1993-94 onward under 'Dallas Stars' (TCDB team id 298), matching the May 1993 franchise relocation/rename.",
  "Card #35 in 1992-93 Upper Deck is documented by TCDB as having a photo/bio mix-up among Kevin Miller, Kelly Miller, and Kip Miller; it is listed here as Kevin Miller (the North Star at the time of the trade) but the true printed name may differ \u2014 flagged as uncertain.",
  "Card #183 in 2000-01 Upper Deck (Keith Aldridge) was verified as a real Dallas Stars player via ESPN/StatMuse; included with confidence despite the unusual card-number placement.",
  "'Checklist' cards that feature a player's photo purely as a set/team checklist card (not a standard player card) were excluded from all sets, e.g. 2008-09 #500 'Young Guns Checklist', 2021-22 #199, 2022-23 #199, 2023-24 #450, and 2024-25 #250 (each a multi-player 'Checklist' card).",
  "All checklists were pulled from TCDB (tradingcarddb.com) team-filtered set-checklist pages (ViewTeams.cfm) for the exact set id of each season's flagship 'Upper Deck' brand product, filtered to the Minnesota North Stars / Dallas Stars team. Card entries with multiple 'VAR' (hologram/back variation) sub-rows in TCDB were collapsed to a single entry per physical card number.",
  "This data was not cross-checked against a second independent source (e.g. Beckett or Cardboard Connection) for every single card; spot-checks were done for a few uncertain entries (1990-91 total count, card #35 in 1992-93, card #183 in 2000-01). Recommend a periodic sanity check against the physical cards as the collection is catalogued.",
  "2026-09-04: Card #547 (Neil Wilkinson, RC) was found missing from the 1990-91 set in this file and added after being spotted directly on TCDB -- a reminder that this data, while sourced from TCDB, has not been exhaustively cross-checked card-by-card and may still have gaps. If you spot another one, the fix is a one-line addition to the matching set entry in CHECKLIST_SETS.",
  "2026-09-12: A physical Roman Turek 'Young Guns' card (1996-97 Upper Deck Collector's Choice #358, confirmed as a Dallas Stars-jersey card by the collector) surfaced a real gap: this file's Young Guns coverage only went back to 2005-06, missing three earlier Young Guns eras entirely -- flagship Upper Deck 1990-91 to 1992-93, the Collector's Choice Young Guns revival in 1995-96/1996-97, and flagship Upper Deck 1999-00 to 2004-05. Backfilled with yg:true flags on 5 already-present Dallas Stars own-team cards (Keith Aldridge #183 2000-01, Marty Turco #428 2000-01, Niko Kapanen #421 2001-02, Antti Miettinen #215 2003-04, Trevor Daley #467 2003-04), a new one-card Collector's Choice entry for Turek himself, and 6 new entries in STARS_ALUMNI_YOUNG_GUNS for Stars alumni whose real rookie Young Guns card was printed under a different team (Kip Miller, Donald Audette, Martin Rucinsky, Radek Dvorak, Patrik Stefan, Jason Spezza). Every card number/team pairing was cross-checked against at least two independent sources (TCDB, Cardboard Connection's Young Guns checklist, or eBay/COMC listings) plus Wikipedia for each alumnus's Dallas Stars tenure. Deliberately NOT included: the 2001-02 Upper Deck 'Young Guns Flashback' #218 Mike Modano card, since it's a nostalgia reprint of an already-veteran player rather than a real rookie card -- can be added if wanted.",
];

// --- Stars alumni Young Guns ---------------------------------------------
// Young Guns rookie cards printed under a DIFFERENT NHL team, for players who at some point
// in their career (before, during, or after that rookie season) also played for the Dallas
// Stars -- e.g. Mikko Rantanen's real rookie card is a 2015-16 Upper Deck Colorado Avalanche
// card, not a Dallas card, even though he later played for Dallas. These are never part of
// CHECKLIST_SETS (which only lists cards actually printed under the Stars/North Stars team),
// so they're tracked as their own list and shown in a separate section of the Young Guns tab.
// Every card number below was verified against a real listing (TCDB, Beckett, ComC, or
// multiple independent dealer/eBay listings agreeing) -- not guessed. This is necessarily a
// snapshot, not exhaustive: if you find another Stars alumnus with a Young Guns card from
// another team, add a line to the matching year below (or a new year block if needed).
const STARS_ALUMNI_YOUNG_GUNS = [
  // 1990-91 through 2002-03: the original/first-revival Young Guns eras (flagship Upper Deck
  // 1990-91 to 1992-93, then Collector's Choice 1995-96 to 1996-97, then flagship again from
  // 1999-00 onward) -- added 2026-09-12 after a gap was spotted; see CHECKLIST_NOTES for sourcing.
  { year: "1990-91", entries: [
    { n: "522", p: "Kip Miller", team: "Quebec Nordiques", note: "Also played for the Minnesota North Stars during his career." },
  ]},
  { year: "1991-92", entries: [
    { n: "585", p: "Donald Audette", team: "Buffalo Sabres", note: "Played for Dallas Stars into the 2001-02 season; traded to Montreal (with Shaun Van Allen) for Martin Rucinsky and Benoit Brunet, Nov 2001." },
  ]},
  { year: "1992-93", entries: [
    { n: "556", p: "Martin Rucinsky", team: "Quebec Nordiques", note: "Traded to Dallas from Montreal (with Benoit Brunet, for Donald Audette and Shaun Van Allen), Nov 2001; played for Dallas through Mar 2002." },
  ]},
  { year: "1995-96", setName: "Collector's Choice", entries: [
    { n: "398", p: "Radek Dvorak", team: "Florida Panthers", note: "Signed with Dallas as a UFA in 2011, played the 2011-12 season." },
  ]},
  { year: "1999-00", entries: [
    { n: "161", p: "Patrik Stefan", team: "Atlanta Thrashers", note: "Traded to Dallas from Atlanta (with Jaroslav Modry, for Niko Kapanen), June 2006; played for Dallas through 2007." },
  ]},
  { year: "2002-03", entries: [
    { n: "443", p: "Jason Spezza", team: "Ottawa Senators", note: "Traded to Dallas from Ottawa, July 2014; played for Dallas through 2019 before signing with Toronto." },
  ]},
  { year: "2005-06", entries: [
    { n: "204", p: "Corey Perry", team: "Anaheim Ducks", note: "Signed with Dallas as a UFA in 2019; played 2019-2021, including the 2020 Stanley Cup Final run." },
  ]},
  { year: "2006-07", entries: [
    { n: "487", p: "Joe Pavelski", team: "San Jose Sharks", note: "Signed with Dallas as a UFA in 2019; team captain, retired as a Star in 2024." },
    { n: "476", p: "Alexander Radulov", team: "Nashville Predators", note: "Signed with Dallas as a UFA in 2017, played through 2020-21." },
    { n: "226", p: "Johnny Oduya", team: "New Jersey Devils", note: "Signed with Dallas as a UFA in 2015, played 2015-2017." },
  ]},
  { year: "2007-08", entries: [
    { n: "489", p: "Martin Hanzal", team: "Phoenix Coyotes", note: "Traded to Dallas from Arizona at the 2017 deadline." },
    { n: "467", p: "Marc Methot", team: "Columbus Blue Jackets", note: "Selected by Vegas in the 2017 expansion draft, immediately re-traded to Dallas." },
    { n: "214", p: "Kris Russell", team: "Columbus Blue Jackets", note: "Acquired mid-season 2015-16; played regular-season and playoff games for Dallas." },
  ]},
  { year: "2009-10", entries: [
    { n: "203", p: "Matt Duchene", team: "Colorado Avalanche", note: "Signed with Dallas as a UFA in July 2023." },
    { n: "499", p: "Braden Holtby", team: "Washington Capitals", note: "Signed with Dallas in 2020, backup goaltender for one season." },
    { n: "215", p: "Jason Demers", team: "San Jose Sharks", note: "Signed with Dallas as a UFA in 2016, played 2016-2018." },
  ]},
  { year: "2010-11", entries: [
    { n: "456", p: "Tyler Seguin", team: "Boston Bruins", note: "Traded to Dallas from Boston in July 2013; long-tenured Star." },
  ]},
  { year: "2011-12", entries: [
    { n: "499", p: "Cody Eakin", team: "Washington Capitals", note: "Traded to Dallas in the Mike Ribeiro deal, June 2012." },
    { n: "225", p: "Craig Smith", team: "Nashville Predators", note: "Signed with Dallas as a UFA in 2023; left for Chicago as a UFA in 2024." },
  ]},
  { year: "2013-14", entries: [
    { n: "474", p: "Mikael Granlund", team: "Minnesota Wild", note: "Traded to Dallas from San Jose, Feb 2025." },
    { n: "475", p: "Cody Ceci", team: "Ottawa Senators", note: "Traded to Dallas from San Jose, Feb 2025 (same trade as Granlund)." },
    { n: "231", p: "Matt Dumba", team: "Minnesota Wild", note: "Signed with Dallas as a UFA in July 2024; traded to Pittsburgh in 2025." },
  ]},
  { year: "2015-16", entries: [
    { n: "206", p: "Mikko Rantanen", team: "Colorado Avalanche", note: "Traded Colorado→Carolina→Dallas at the 2025 deadline; signed a long-term extension with Dallas in 2025." },
  ]},
  { year: "2016-17", entries: [
    { n: "492", p: "Scott Wedgewood", team: "New Jersey Devils", note: "Signed with Dallas, backup/1B goaltender 2023-2025." },
  ]},
  { year: "2018-19", entries: [
    { n: "487", p: "Sam Steel", team: "Anaheim Ducks", note: "Signed with Dallas as a UFA in July 2023." },
  ]},
  { year: "2020-21", entries: [
    { n: "457", p: "Mason Marchment", team: "Florida Panthers", note: "Signed with Dallas as a UFA in 2022." },
  ]},
  { year: "2021-22", entries: [
    { n: "456", p: "Nils Lundkvist", team: "New York Rangers", note: "Traded to Dallas from the Rangers, Sept 2022." },
  ]},
];

// Reshaped into the same { year, setName, cards: [{n, p}], ... } shape CHECKLIST_SETS uses, so
// it can be run through the same buildChecklistMatches()/ChecklistYearSection machinery. Team
// varies per-card here (unlike CHECKLIST_SETS, where it's one team for the whole season), so
// each card keeps its own `team` and `note` instead of the set carrying one team for everybody.
const STARS_ALUMNI_YG_SETS = STARS_ALUMNI_YOUNG_GUNS.map((group) => ({
  year: group.year,
  setName: group.setName || "Upper Deck",
  team: null,
  sourceUrl: null,
  cards: group.entries.map((e) => ({ n: e.n, p: e.p, team: e.team, note: e.note, yg: true })),
}));

// --- Young Guns series/wave lookup --------------------------------------
// Which specific product wave (Series 1/2/3, "Extended Series", "High Series", or a
// redemption-only insert) a card number actually shipped in -- this is what tells a collector
// which packs (and which release date that season) could ever contain a given Young Guns card.
// Added 2026-09-12 at Kaleb's request, so he can compare which packs are worth buying if he's
// chasing a specific card. Only covers seasons that actually have a yg:true/alumni Young Guns
// card in this file (not every CHECKLIST_SETS year) -- extend this table first if a Young Guns
// card from an uncovered season is ever added. Every range below was researched from TCDB set
// pages, cross-checked against a second independent source (Cardboard Connection,
// checklistcenter.com, or a specific eBay/COMC listing quoting the range) -- see the project
// notes doc for the full sourcing writeup.
const YG_SERIES_RANGES = {
  "1990-91": [{ name: "Low Series", min: 1, max: 400 }, { name: "High Series", min: 401, max: 550 }],
  "1991-92": [{ name: "Low Series", min: 1, max: 500 }, { name: "High Series", min: 501, max: 700 }],
  "1992-93": [{ name: "Low Series", min: 1, max: 440 }, { name: "High Series", min: 441, max: 640 }],
  "1995-96": [
    { name: "Base set", min: 1, max: 396 },
    { name: "Young Guns — redemption only, not pack-pullable", min: 397, max: 411 },
  ],
  "1996-97": [
    { name: "Base set", min: 1, max: 348 },
    { name: "Young Guns — redemption only, not pack-pullable", min: 349, max: 363 },
  ],
  "1999-00": [{ name: "Series One", min: 1, max: 170 }, { name: "Series Two", min: 171, max: 335 }],
  "2000-01": [{ name: "Series One", min: 1, max: 230 }, { name: "Series Two", min: 231, max: 440 }],
  "2001-02": [{ name: "Series One", min: 1, max: 231 }, { name: "Series Two", min: 232, max: 441 }],
  "2002-03": [{ name: "Series One", min: 1, max: 246 }, { name: "Series Two", min: 247, max: 456 }],
  "2003-04": [{ name: "Series One", min: 1, max: 245 }, { name: "Series Two", min: 246, max: 475 }],
  "2005-06": [{ name: "Series 1", min: 1, max: 242 }, { name: "Series 2", min: 243, max: 487 }],
  "2006-07": [{ name: "Series 1", min: 1, max: 250 }, { name: "Series 2", min: 251, max: 495 }],
  "2007-08": [{ name: "Series 1", min: 1, max: 250 }, { name: "Series 2", min: 251, max: 500 }],
  "2008-09": [{ name: "Series 1", min: 1, max: 250 }, { name: "Series 2", min: 251, max: 500 }],
  "2009-10": [{ name: "Series 1", min: 1, max: 250 }, { name: "Series 2", min: 251, max: 500 }],
  "2010-11": [{ name: "Series 1", min: 1, max: 250 }, { name: "Series 2", min: 251, max: 500 }],
  "2011-12": [{ name: "Series 1", min: 1, max: 250 }, { name: "Series 2", min: 251, max: 500 }],
  // Lockout-shortened season -- only one series was ever released, unlike every other year.
  "2012-13": [{ name: "Series 1 (only series released this year)", min: 1, max: 250 }],
  "2013-14": [{ name: "Series 1", min: 1, max: 250 }, { name: "Series 2", min: 251, max: 500 }],
  "2014-15": [{ name: "Series 1", min: 1, max: 250 }, { name: "Series 2", min: 251, max: 500 }],
  "2015-16": [{ name: "Series 1", min: 1, max: 250 }, { name: "Series 2", min: 251, max: 500 }],
  "2016-17": [{ name: "Series 1", min: 1, max: 250 }, { name: "Series 2", min: 251, max: 500 }],
  "2017-18": [{ name: "Series 1", min: 1, max: 250 }, { name: "Series 2", min: 251, max: 500 }],
  "2018-19": [{ name: "Series 1", min: 1, max: 250 }, { name: "Series 2", min: 251, max: 500 }],
  "2019-20": [{ name: "Series 1", min: 1, max: 250 }, { name: "Series 2", min: 251, max: 500 }],
  // From 2020-21 on, a third wave ("Extended Series") ships separately, months after Series 2 --
  // genuinely pack-obtainable (hobby/retail/blaster/e-pack), not a redemption program.
  "2020-21": [
    { name: "Series 1", min: 1, max: 250 },
    { name: "Series 2", min: 251, max: 500 },
    { name: "Extended Series", min: 501, max: 730 },
  ],
  "2021-22": [
    { name: "Series 1", min: 1, max: 250 },
    { name: "Series 2", min: 251, max: 500 },
    { name: "Extended Series (base)", min: 501, max: 700 },
    { name: "Extended Series — Young Guns", min: 701, max: 750 },
  ],
  // From 2022-23 on, Extended Series' rookie class itself splits into two named subsets --
  // "Young Guns" and a separate "1st Round Rookies" insert for first-round picks only.
  "2022-23": [
    { name: "Series 1", min: 1, max: 250 },
    { name: "Series 2", min: 251, max: 500 },
    { name: "Extended Series (base)", min: 501, max: 700 },
    { name: "Extended Series — Young Guns", min: 701, max: 730 },
    { name: "Extended Series — 1st Round Rookies", min: 731, max: 750 },
  ],
  "2023-24": [
    { name: "Series 1", min: 1, max: 250 },
    { name: "Series 2", min: 251, max: 500 },
    { name: "Extended Series (base)", min: 501, max: 700 },
    { name: "Extended Series — Young Guns", min: 701, max: 730 },
    { name: "Extended Series — 1st Round Rookies", min: 731, max: 750 },
  ],
  "2024-25": [
    { name: "Series 1", min: 1, max: 250 },
    { name: "Series 2", min: 251, max: 500 },
    { name: "Extended Series (base)", min: 501, max: 700 },
    { name: "Extended Series — Young Guns", min: 701, max: 730 },
    { name: "Extended Series — 1st Round Rookies", min: 731, max: 750 },
  ],
};

function getCardSeries(year, cardNumber) {
  const ranges = YG_SERIES_RANGES[year];
  if (!ranges) return null;
  const n = parseInt(String(cardNumber).replace(/\D/g, ""), 10);
  if (!Number.isFinite(n)) return null;
  const match = ranges.find((r) => n >= r.min && n <= r.max);
  return match ? match.name : null;
}

// --- Checklist matching helpers ---------------------------------------
// A ledger entry is matched against a CHECKLIST_SETS row when: it's a Hockey
// card, its set field mentions "Upper Deck", its team field mentions "Stars"
// (catches both Minnesota North Stars and Dallas Stars), the season implied
// by its year matches, and either the card number or the player name lines up.

function seasonStartYear(y) {
  if (!y) return null;
  const s = String(y);
  const full = s.match(/(19|20)\d{2}/);
  if (full) return parseInt(full[0], 10);
  const two = s.match(/(\d{2})/);
  if (two) {
    const n = parseInt(two[1], 10);
    return n >= 90 ? 1900 + n : 2000 + n;
  }
  return null;
}

function normNum(n) {
  return String(n || "").trim().toLowerCase().replace(/^0+(?=\d)/, "");
}

function normName(n) {
  return String(n || "").trim().toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ");
}

function checklistEntryKey(setYear, cardNumber) {
  return `${setYear}#${cardNumber}`;
}

// Finds the ONE checklist entry (if any) a single ledger card corresponds to, within a
// given season's set. A card number is authoritative and unambiguous, so if the ledger
// card has one, ONLY a number match counts -- it never falls through to name matching
// (that was the bug: e.g. scanning 1990-91 #46 Mike Modano also used to flip #346 Mike
// Modano, a different card, because both share a player name). Name-only matching is a
// fallback for when the number couldn't be read, and only applies when exactly one
// checklist entry that season has that player's name -- otherwise it's ambiguous and no
// match is made rather than guessing.
// Cards saved before the brand field existed have "Upper Deck" baked into the set text
// (e.g. "Upper Deck Series 1"); cards saved after it now carry the brand separately (brand:
// "Upper Deck", set: "Series 1"). Check both so neither old nor new records fall out of the
// Stars/North Stars checklist matching.
function isUpperDeckCard(card) {
  return /upper\s*deck/i.test(card.brand || "") || /upper\s*deck/i.test(card.set || "");
}

function findChecklistEntryForCard(set, card) {
  const hasNumber = !!(card.cardNumber && normNum(card.cardNumber));
  if (hasNumber) {
    return set.cards.find((entry) => entry.n && normNum(entry.n) === normNum(card.cardNumber)) || null;
  }
  const cardName = normName(card.player);
  if (!cardName) return null;
  const nameMatches = set.cards.filter((entry) => normName(entry.p) === cardName);
  return nameMatches.length === 1 ? nameMatches[0] : null;
}

// Returns a Map from "year#number" -> array of ledger card objects that appear to match
// that checklist entry (usually 0 or 1, occasionally more if the same card was logged
// twice). Team isn't checked here: card numbers are unique within an Upper Deck season,
// and CHECKLIST_SETS only lists Stars/North Stars slots, so a number (or unambiguous
// name) hit already pins it to the right team even if the ledger's own "team" field is
// blank, abbreviated, or doesn't say "Stars" verbatim.
function buildChecklistMatches(cards, sets = CHECKLIST_SETS) {
  const map = new Map();
  const candidates = cards.filter((c) => c.sport === "Hockey" && isUpperDeckCard(c));
  if (candidates.length === 0) return map;
  sets.forEach((set) => {
    const setStart = seasonStartYear(set.year);
    const inSeason = candidates.filter((c) => seasonStartYear(c.year) === setStart);
    inSeason.forEach((card) => {
      const entry = findChecklistEntryForCard(set, card);
      if (!entry) return;
      const key = checklistEntryKey(set.year, entry.n);
      const arr = map.get(key) || [];
      arr.push(card);
      map.set(key, arr);
    });
  });
  return map;
}

// Checks a single freshly-saved ledger entry against the checklists, for the
// "this filled a checklist slot" confirmation shown right after saving a card.
function matchSingleCardToChecklist(entry) {
  if (!entry || entry.sport !== "Hockey") return null;
  if (!isUpperDeckCard(entry)) return null;
  const y = seasonStartYear(entry.year);
  if (y == null) return null;
  const set = CHECKLIST_SETS.find((s) => seasonStartYear(s.year) === y);
  if (!set) return null;
  const found = findChecklistEntryForCard(set, entry);
  return found ? { year: set.year, setName: set.setName, team: set.team, number: found.n, player: found.p } : null;
}

const blankForm = {
  player: "",
  team: "",
  sport: "Baseball",
  year: "",
  brand: "",
  set: "",
  cardNumber: "",
  value: "",
  onlineFrontUrl: null,
  onlineBackUrl: null,
  personalFront: null,
  personalBack: null,
  // A "purchase photo" is a phone/camera snapshot (e.g. taken at a card show) that isn't
  // treated as the official scan -- kept for reference until a real scan replaces it.
  purchasePhotoFront: null,
  purchasePhotoBack: null,
  thumbnailSource: "online",
};

function money(n) {
  const v = Number(n) || 0;
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function timeAgo(ts) {
  if (!ts) return "";
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function moneyOrDash(n) {
  if (n === null || n === undefined || n === "") return "—";
  return money(n);
}

function fileToResizedDataUrl(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height / width) * maxDim);
            width = maxDim;
          } else {
            width = Math.round((width / height) * maxDim);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function rotateDataUrl(dataUrl, degrees) {
  return new Promise((resolve, reject) => {
    if (!degrees) { resolve(dataUrl); return; }
    const img = new Image();
    img.onerror = () => reject(new Error("rotate failed"));
    img.onload = () => {
      const rad = (degrees * Math.PI) / 180;
      const swap = degrees === 90 || degrees === 270;
      const canvas = document.createElement("canvas");
      canvas.width = swap ? img.height : img.width;
      canvas.height = swap ? img.width : img.height;
      const ctx = canvas.getContext("2d");
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = dataUrl;
  });
}

// --- Watched scan folder: a directory handle (from the File System Access API) can't be
// JSON-stringified, so it's kept in IndexedDB rather than window.storage. Every call here is
// wrapped by the caller in a feature check (window.showDirectoryPicker + indexedDB both present)
// and a try/catch, since this API is Chromium-only and this app's runtime is not guaranteed to
// support it -- when it's missing, the watch-folder UI just doesn't render at all.
const FS_HANDLE_DB = "card-ledger-fs-handles";
const FS_HANDLE_STORE = "handles";
const FS_HANDLE_KEY = "watchFolder";

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FS_HANDLE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(FS_HANDLE_STORE)) req.result.createObjectStore(FS_HANDLE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveWatchHandle(handle) {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FS_HANDLE_STORE, "readwrite");
    tx.objectStore(FS_HANDLE_STORE).put(handle, FS_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadWatchHandle() {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FS_HANDLE_STORE, "readonly");
    const req = tx.objectStore(FS_HANDLE_STORE).get(FS_HANDLE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function clearWatchHandle() {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FS_HANDLE_STORE, "readwrite");
    tx.objectStore(FS_HANDLE_STORE).delete(FS_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const FIELDS_SCHEMA = `"rotation":0,"player":"","team":"","sport":"","year":"","brand":"","set":"","cardNumber":"","confidence":"","estimatedValue":null,"frontImageUrl":null,"backImageUrl":null`;
const FIELDS_SCHEMA_TWO = `"frontImageIndex":1,"rotation1":0,"rotation2":0,"player":"","team":"","sport":"","year":"","brand":"","set":"","cardNumber":"","confidence":"","estimatedValue":null,"frontImageUrl":null,"backImageUrl":null`;

// Two-pass identification (added to cut cost at scale): the cheap first pass never gets to use
// web search at all, so its prompt has to say so explicitly and give it a graceful way to say
// "not sure" instead of guessing. Only the escalation pass (see identifyCardFromImages) gets
// allowSearch=true and the matching search instructions. Built from a step list rather than one
// fixed string so the numbering stays clean in both modes.
function identifyPromptOne(allowSearch) {
  const steps = [
    `Check the image's orientation: if the card is sideways or upside down, note how many degrees it must be rotated CLOCKWISE to appear upright (0, 90, 180, or 270).`,
    `Look at the image (mentally correcting for any rotation) and identify the card: player name, team, sport, year, card number, the manufacturer/brand (e.g. "Upper Deck", "Topps", "O-Pee-Chee", "Panini", "Score", "Leaf", "Parkhurst" -- whichever company actually printed this card), and the specific set/subset or parallel name separately from the brand (e.g. "Series 1", "Young Guns", "Update", "Chrome", "Black Diamond").`,
    `Any printed year or year-range text (e.g. copyright year, or a range like "89-90") is the single most important detail — read it character by character, very carefully. Do not guess a "round" or common-looking year instead of what is actually printed; double-check similar-looking digits (e.g. 8 vs 9, 0 vs 6) before answering.`,
  ];
  if (allowSearch) {
    steps.push(
      `Use web search sparingly -- a handful of well-chosen searches is enough; you don't need to exhaustively cross-check every source. Prefer the Trading Card Database (tcdb.com) as your primary source — it's the source this app's own checklists are built from, so matching its exact card number and set name keeps this card consistent with the checklist. Fall back to PSA, COMC, or eBay sold listings only if TCDB doesn't turn up the answer.`,
      `From your search, try to find a direct image URL for the front of this exact card, and separately for the back, from a page you actually found (a TCDB card-detail page is ideal). Only include a URL if it appeared in your search results — never invent or guess one. If you cannot confidently find one, use null.`,
      `If your search surfaced recent sale prices or listings for this exact card in typical condition, estimate a rough current market value in USD as a plain number (no currency symbol, no commas). If you have no reasonable basis, use null.`
    );
  } else {
    steps.push(
      `No live web search is available for this pass -- work from the image and your own general trading-card knowledge alone. Leave "frontImageUrl" and "backImageUrl" as null (there's nothing searched to find one from). Give "estimatedValue" a plain USD number only if you're reasonably confident from general knowledge; otherwise use null. If you're not confident about the exact card number or set/subset name, it's fine to answer "confidence":"low" or "medium" rather than guessing -- a second pass with live search will double-check anything uncertain.`
    );
  }
  steps.push(`Rate your overall confidence as "high", "medium", or "low".`);
  const numbered = steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `You are helping identify a sports trading card from a single photo.

${numbered}

Respond with ONLY a raw JSON object, no markdown fences, no commentary, in exactly this shape:
{${FIELDS_SCHEMA}}

"rotation" is the clockwise degrees (0, 90, 180, or 270) needed to make the image upright. "sport" must be one of: Baseball, Basketball, Football, Hockey, Soccer, Other. "brand" should be just the manufacturer name (e.g. "Upper Deck"), not the full product name -- keep the subset/parallel name in "set" instead.`;
}

// Same two-pass treatment as identifyPromptOne, above, for the front+back variant.
function identifyPromptTwoUnordered(allowSearch) {
  const steps = [
    `For each image independently, determine how many degrees it must be rotated CLOCKWISE to appear upright (0, 90, 180, or 270).`,
    `Determine which image (1 or 2) is the front and which is the back.`,
    `Identify the card using both images, mentally correcting for rotation: player name, team, sport, year, card number, the manufacturer/brand (e.g. "Upper Deck", "Topps", "O-Pee-Chee", "Panini", "Score", "Leaf", "Parkhurst" -- whichever company actually printed this card), and the specific set/subset or parallel name separately from the brand (e.g. "Series 1", "Young Guns", "Update", "Chrome", "Black Diamond").`,
    `Any printed year or year-range text on the back (e.g. copyright year, or a range like "89-90") is the single most important detail — read it character by character, very carefully, and treat it as authoritative over any front-only guess. Do not guess a "round" or common-looking year instead of what is actually printed; double-check similar-looking digits (e.g. 8 vs 9, 0 vs 6) before answering.`,
  ];
  if (allowSearch) {
    steps.push(
      `Use web search sparingly -- a handful of well-chosen searches is enough; you don't need to exhaustively cross-check every source. Prefer the Trading Card Database (tcdb.com) as your primary source — it's the source this app's own checklists are built from, so matching its exact card number and set name keeps this card consistent with the checklist. Fall back to PSA, COMC, or eBay sold listings only if TCDB doesn't turn up the answer.`,
      `From your search, try to find a direct image URL for the front of this exact card, and separately for the back, from a page you actually found (a TCDB card-detail page is ideal). Only include a URL if it appeared in your search results — never invent or guess one. If you cannot confidently find one, use null.`,
      `If your search surfaced recent sale prices or listings for this exact card in typical condition, estimate a rough current market value in USD as a plain number (no currency symbol, no commas). If you have no reasonable basis, use null.`
    );
  } else {
    steps.push(
      `No live web search is available for this pass -- work from the two images and your own general trading-card knowledge alone. Leave "frontImageUrl" and "backImageUrl" as null (there's nothing searched to find one from). Give "estimatedValue" a plain USD number only if you're reasonably confident from general knowledge; otherwise use null. If you're not confident about the exact card number or set/subset name, it's fine to answer "confidence":"low" or "medium" rather than guessing -- a second pass with live search will double-check anything uncertain.`
    );
  }
  steps.push(`Rate your overall confidence as "high", "medium", or "low".`);
  const numbered = steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `You are helping identify a sports trading card. Two images follow, labeled "Image 1" and "Image 2". They show the front and back of the same physical card, but NOT necessarily in that order, and either or both may be sideways or upside down — you must work out both which is which AND their correct orientation.

The front of a card typically shows a photo of the player and their name prominently. The back typically shows stats, text, a logo, or a different layout.

${numbered}

Respond with ONLY a raw JSON object, no markdown fences, no commentary, in exactly this shape:
{${FIELDS_SCHEMA_TWO}}

"frontImageIndex" must be 1 or 2, indicating which of the two provided images is the front. "rotation1" and "rotation2" are the clockwise degrees (0, 90, 180, or 270) needed to make Image 1 and Image 2 upright, respectively. "sport" must be one of: Baseball, Basketball, Football, Hockey, Soccer, Other. "brand" should be just the manufacturer name (e.g. "Upper Deck"), not the full product name -- keep the subset/parallel name in "set" instead.`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Shared across every identify/appraise call in the whole app, including every concurrent
// Bulk Add worker. Without this, a big batch (e.g. a long run of Colorado Avalanche cards)
// could trip a rate limit and have EVERY worker's independent per-call retry land back inside
// the same rate-limit window, over and over, failing the entire batch outright even though
// each call individually "retried". Once any call sees a rate-limit response, every other
// call -- already in flight or about to start -- waits out the same cooldown together before
// trying again, instead of each hammering the API on its own uncoordinated schedule.
let sharedApiCooldownUntil = 0;

function noteRateLimitHit(extraMs) {
  sharedApiCooldownUntil = Math.max(sharedApiCooldownUntil, Date.now() + (extraMs || 15000));
}

async function waitForSharedCooldown() {
  const remaining = sharedApiCooldownUntil - Date.now();
  if (remaining > 0) await wait(remaining);
}

// Tells apart two very different kinds of API failure: a transient rate limit (worth waiting out
// and retrying) versus the account's prepaid credit balance actually running out (Anthropic
// returns this as a plain invalid_request_error with a distinctive message, not its own error
// type) -- worth recognizing specifically so a big Bulk Add batch can stop cleanly instead of
// burning through the rest of the queue one guaranteed-to-fail card at a time.
function classifyApiError(response, data) {
  const type = (data && data.error && data.error.type) || "";
  const message = (data && data.error && data.error.message) || "API error";
  const isRateLimit = response.status === 429 || /rate.?limit/i.test(type);
  const isBilling = /credit balance|purchase credits/i.test(message);
  return { isRateLimit, isBilling, message };
}

// Every identify/appraise/price-lookup call uses this one model -- kept as a single constant so
// there's exactly one place to change it (and one place the cost estimate below has to agree
// with). Switched from claude-sonnet-4-6 ($3/$15 per million input/output tokens) to the newer,
// cheaper claude-sonnet-5 ($2/$10 per million) -- a real ~33% cut in per-token cost for the same
// job, at no accuracy cost since it's the newer model.
const MODEL_ID = "claude-sonnet-5";

// USD per token (not per million) for a quick multiply, plus the flat per-search fee Anthropic
// charges for the web_search tool on top of tokens. Kept as a small table (rather than just two
// numbers) so a future model change still produces a sane estimate for calls already logged
// under an older model id.
const PRICING = {
  "claude-sonnet-5": { input: 2 / 1e6, output: 10 / 1e6 },
  "claude-sonnet-4-6": { input: 3 / 1e6, output: 15 / 1e6 },
};
const WEB_SEARCH_COST_USD = 0.01;

// Estimates one API call's cost from the usage figures Anthropic actually returns in the
// response body -- real numbers from that specific call, not a guess. This is an estimate, not
// a bill: it doesn't account for prompt caching, batch pricing, or any account-level discount,
// so treat it as directionally useful rather than exact.
function estimateCallCostUsd(model, data) {
  const usage = data && data.usage;
  if (!usage) return 0;
  const rates = PRICING[model] || PRICING[MODEL_ID];
  const tokenCost = (usage.input_tokens || 0) * rates.input + (usage.output_tokens || 0) * rates.output;
  const searches = (usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0;
  return tokenCost + searches * WEB_SEARCH_COST_USD;
}

// Best-effort running total of estimated spend, persisted so it survives reloads and is visible
// in Bulk Add without having to go check the Anthropic console. Never blocks or fails the actual
// identify/appraise call it's tracking -- a lost usage-log write just means an undercounted
// estimate, not a broken feature.
async function addToLifetimeCost(amountUsd) {
  if (!amountUsd) return;
  try {
    const saved = await window.storage.get(USAGE_LOG_KEY, false);
    const current = saved && saved.value ? JSON.parse(saved.value) : { totalCostUsd: 0, totalCalls: 0 };
    const updated = { totalCostUsd: (current.totalCostUsd || 0) + amountUsd, totalCalls: (current.totalCalls || 0) + 1 };
    await window.storage.set(USAGE_LOG_KEY, JSON.stringify(updated), false);
  } catch (e) {
    // best-effort only -- never let usage logging break the actual API call
  }
}

async function callIdentifyOnce(dataUrls, allowSearch) {
  await waitForSharedCooldown();
  const toBase64 = (dataUrl) => dataUrl.slice(dataUrl.indexOf(",") + 1);
  const content = dataUrls.map((d) => ({
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data: toBase64(d) },
  }));
  content.push({ type: "text", text: dataUrls.length === 2 ? identifyPromptTwoUnordered(allowSearch) : identifyPromptOne(allowSearch) });

  const body = {
    model: MODEL_ID,
    // Raised from 1000, then 2000 -- a card needing several web_search rounds (an uncommon
    // team/year, or a search that takes more than one try to land on the right TCDB page)
    // could still run out of budget mid-loop and come back with no closing JSON, which
    // surfaced as "couldn't identify" even for a perfectly clear scan. Cards for teams this
    // model has less built-in familiarity with (reported: an entire batch of Colorado
    // Avalanche cards) seem to need more search rounds on average than heavily-referenced
    // teams, so the budget needs more headroom, not just retries.
    max_tokens: 3000,
    messages: [{ role: "user", content }],
  };
  if (allowSearch) {
    // max_uses caps how many individual web searches THIS ONE call can rack up -- each search
    // is billed separately ($0.01/search) on top of tokens, and without a cap a stubborn card
    // could quietly run up a surprising number of searches in one go. 5 is generous enough to
    // preserve the multi-round-search reliability fix for less-common teams (see max_tokens
    // comment above) while still putting a hard ceiling on the worst case. This tool is only
    // attached at all on the escalation pass -- see identifyCardFromImages -- so most cards
    // (the ones the cheap first pass is already confident about) never pay for search at all.
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
  } else {
    // claude-sonnet-5 runs adaptive thinking by default when "thinking" is omitted (a change
    // from claude-sonnet-4-6, where omitting it meant thinking-off) -- so this pass started
    // paying for reasoning tokens as an unannounced side effect of the model swap above, not a
    // deliberate choice. This is the cheap, no-search pass on a single clear photo -- extraction,
    // not multi-step reasoning -- so turn it back off here. Left alone on the search-enabled
    // escalation pass above, where the harder cards live and thinking is more likely to help.
    body.thinking = { type: "disabled" };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  const costUsd = estimateCallCostUsd(MODEL_ID, data);
  addToLifetimeCost(costUsd);
  if (data.error) {
    const { isRateLimit, isBilling, message } = classifyApiError(response, data);
    const err = new Error(message);
    err.isRateLimit = isRateLimit;
    err.isBilling = isBilling;
    err.costUsd = costUsd;
    if (isRateLimit) noteRateLimitHit();
    throw err;
  }
  const text = (data.content || [])
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  const jsonStart = clean.indexOf("{");
  const jsonEnd = clean.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    const err = new Error("no JSON in response");
    err.costUsd = costUsd;
    throw err;
  }
  const parsed = JSON.parse(clean.slice(jsonStart, jsonEnd + 1));
  parsed._costUsd = costUsd;
  return parsed;
}

// A big Bulk Add batch fires several of these concurrently and can trip a rate limit, and an
// individual call can also just come back truncated/malformed on occasion -- retry a couple of
// times (longer backoff specifically for a rate-limit-flavored error, and waiting out the shared
// cooldown above at the start of every attempt) before giving up on a card. Dialed back from four
// attempts to three: each attempt is a full paid API call, and the shared cooldown plus the
// higher max_tokens above already handle the common failure modes -- a fourth attempt was mostly
// adding cost on cards that were going to fail anyway, not meaningfully improving success odds.
// Two passes, so most cards only ever pay the cheap price: pass 1 always runs with NO web
// search (no $0.01/search fees, far fewer tokens since there's no multi-round tool-use loop).
// Only if that cheap pass comes back unconfident or missing a field the ledger/checklist
// actually depends on do we spend the money on a second, search-enabled pass to verify/fill it
// in -- so an easy, well-photographed, well-known card costs a fraction of what it used to,
// while a genuinely tricky one (an obscure team/brand) still gets the full search treatment
// that rounds 4-5 fixed reliability with.
async function identifyCardFromImages(dataUrls) {
  let lastErr;
  let spentSoFarUsd = 0;
  let cheapResult = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      cheapResult = await callIdentifyOnce(dataUrls, false);
      spentSoFarUsd += cheapResult._costUsd || 0;
      break;
    } catch (err) {
      spentSoFarUsd += (err && err.costUsd) || 0;
      lastErr = err;
      if (attempt < 2) await wait(err.isRateLimit ? 5000 : 800);
    }
  }
  if (!cheapResult) {
    lastErr.costUsd = spentSoFarUsd;
    throw lastErr;
  }

  const needsSearch =
    cheapResult.confidence === "low" ||
    !cheapResult.confidence ||
    !String(cheapResult.cardNumber || "").trim() ||
    !String(cheapResult.set || "").trim() ||
    !String(cheapResult.player || "").trim();
  if (!needsSearch) {
    cheapResult._costUsd = spentSoFarUsd;
    cheapResult._searched = false;
    return cheapResult;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await callIdentifyOnce(dataUrls, true);
      result._costUsd = (result._costUsd || 0) + spentSoFarUsd;
      result._searched = true;
      return result;
    } catch (err) {
      spentSoFarUsd += (err && err.costUsd) || 0;
      lastErr = err;
      if (attempt < 2) await wait(err.isRateLimit ? 5000 : 800);
    }
  }
  lastErr.costUsd = spentSoFarUsd;
  throw lastErr;
}

async function fetchRecentSales(card) {
  await waitForSharedCooldown();
  const cardDesc = `${card.year || ""} ${card.set || ""} ${card.player || ""}${card.cardNumber ? " #" + card.cardNumber : ""} ${card.sport || ""} card`.replace(/\s+/g, " ").trim();
  const prompt = `Research recent sale prices for this specific sports trading card: ${cardDesc}${card.team ? ` (${card.team})` : ""}.

Use web search to find recent ACTUAL SOLD listings (not just current asking prices) from sources like eBay sold listings, COMC, or similar marketplaces. You can also check the Trading Card Database (tcdb.com) card-detail page for this card, which sometimes lists a price guide value or recent completed transactions — treat that as one more data point alongside marketplace sales, not a replacement for them. List up to 5 real sales/prices you actually found, each with a price (plain number, USD), the source, and an approximate date if shown. Only include sales that appeared in your search results — never invent one. It's fine to return fewer than 5, or zero, if that's all you can confidently find.

Respond with ONLY a raw JSON object, no markdown fences, no commentary, in exactly this shape:
{"sales":[{"price":0,"source":"","date":""}],"note":""}

"note" is one short sentence of caveat if relevant (e.g. condition varies, limited data found, prices are for ungraded copies), or an empty string if not needed.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL_ID,
      max_tokens: 1000,
      // Capped lower than identify's -- a "recent sales" lookup only needs a couple of searches
      // (an eBay sold-listings search, maybe a COMC or TCDB check), not an open-ended crawl.
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  addToLifetimeCost(estimateCallCostUsd(MODEL_ID, data));
  if (data.error) {
    const { isRateLimit, isBilling, message } = classifyApiError(response, data);
    const err = new Error(message);
    err.isRateLimit = isRateLimit;
    err.isBilling = isBilling;
    if (isRateLimit) noteRateLimitHit();
    throw err;
  }
  const text = (data.content || [])
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  const jsonStart = clean.indexOf("{");
  const jsonEnd = clean.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("no JSON in response");
  return JSON.parse(clean.slice(jsonStart, jsonEnd + 1));
}

// --- Phone photo vs. scan detection ------------------------------------
// Reads just enough JPEG/EXIF to tell a phone or camera photo (which embeds a
// Make/Model, e.g. "Google" / "Pixel 9") apart from a flatbed scan (which
// typically carries no camera EXIF at all, or a scanner Software tag instead).
// This is a heuristic, not a certainty -- users can always override it in the UI.

function readJpegExifTags(buf) {
  try {
    const view = new DataView(buf);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        offset += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) break; // EOI or start-of-scan: no more metadata ahead
      const segLength = view.getUint16(offset + 2, false);
      if (marker === 0xe1) {
        const segStart = offset + 4;
        if (
          segStart + 6 <= view.byteLength &&
          view.getUint32(segStart, false) === 0x45786966 &&
          view.getUint16(segStart + 4, false) === 0x0000
        ) {
          return parseTiffMakeModel(view, segStart + 6);
        }
      }
      offset += 2 + segLength;
    }
  } catch (e) {
    // malformed or unsupported image -- treat as unknown rather than throwing
  }
  return null;
}

function parseTiffMakeModel(view, tiffStart) {
  if (tiffStart + 8 > view.byteLength) return null;
  const little = view.getUint8(tiffStart) === 0x49; // "II" = Intel/little-endian, "MM" = big-endian
  const g16 = (o) => view.getUint16(o, little);
  const g32 = (o) => view.getUint32(o, little);
  const ifd0Offset = tiffStart + g32(tiffStart + 4);
  if (ifd0Offset + 2 > view.byteLength) return null;
  const numEntries = g16(ifd0Offset);
  const tags = {};
  for (let i = 0; i < numEntries; i++) {
    const entryOffset = ifd0Offset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;
    const tag = g16(entryOffset);
    if (tag !== 0x010f && tag !== 0x0110 && tag !== 0x0131) continue; // Make, Model, Software
    const count = g32(entryOffset + 4);
    const strOffset = count <= 4 ? entryOffset + 8 : tiffStart + g32(entryOffset + 8);
    let str = "";
    for (let j = 0; j < count - 1 && strOffset + j < view.byteLength; j++) {
      const code = view.getUint8(strOffset + j);
      if (code === 0) break;
      str += String.fromCharCode(code);
    }
    str = str.trim();
    if (tag === 0x010f) tags.make = str;
    if (tag === 0x0110) tags.model = str;
    if (tag === 0x0131) tags.software = str;
  }
  return tags;
}

function classifyPhotoOrigin(tags) {
  if (!tags) return { isLikelyPhone: false, reason: "no-exif" };
  const make = (tags.make || "").toLowerCase();
  const model = (tags.model || "").toLowerCase();
  const software = (tags.software || "").toLowerCase();
  if (/scan/.test(software)) return { isLikelyPhone: false, reason: "scanner-software", make: tags.make, model: tags.model };
  if (/pixel/.test(model) || /google/.test(make)) return { isLikelyPhone: true, reason: "pixel", make: tags.make, model: tags.model };
  if (make || model) return { isLikelyPhone: true, reason: "camera-exif", make: tags.make, model: tags.model };
  return { isLikelyPhone: false, reason: "no-camera-tags" };
}

async function detectPhotoSource(file) {
  try {
    if (!file) return { isLikelyPhone: false, reason: "no-file" };
    const looksJpeg = file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name || "");
    if (!looksJpeg) return { isLikelyPhone: false, reason: "non-jpeg" };
    const buf = await file.arrayBuffer();
    return classifyPhotoOrigin(readJpegExifTags(buf));
  } catch (e) {
    return { isLikelyPhone: false, reason: "error" };
  }
}

// Shared row renderer for one season's worth of checklist entries -- used by both the full
// Stars Checklist tab and the Young Guns tab (which just passes a pre-filtered set of cards).
function ChecklistYearSection({
  set,
  query,
  hideCollected,
  isExpanded,
  onToggleExpand,
  checklistMatches,
  checklistManual,
  onOpenDetail,
  onOpenInfo,
  onToggleManual,
  labelSuffix,
  mixedTeams,
  showSeries,
}) {
  const q = query.trim().toLowerCase();
  let entries = set.cards.filter((entry) => !q || normName(entry.p).includes(q));
  if (hideCollected) {
    entries = entries.filter((entry) => {
      const key = checklistEntryKey(set.year, entry.n);
      return !(checklistMatches.has(key) || checklistManual[key]);
    });
  }
  if (q && entries.length === 0) return null;
  const pct = set.cards.length ? Math.round((set.ownedCount / set.cards.length) * 100) : 0;
  return (
    <div className="checklist-year">
      <button type="button" className="checklist-year-header" onClick={onToggleExpand}>
        <span className="checklist-year-title">
          {set.year} {set.setName}
          {labelSuffix ? ` ${labelSuffix}` : ""}
          {!mixedTeams && <span className="checklist-year-team">— {set.team}</span>}
        </span>
        <span className="checklist-year-right">
          <span className="checklist-year-count">{set.ownedCount} / {set.cards.length}</span>
          <span className="checklist-year-caret">{isExpanded ? "▾" : "▸"}</span>
        </span>
      </button>
      <div className="checklist-progress-bar"><div className="checklist-progress-fill" style={{ width: `${pct}%` }} /></div>
      {isExpanded && (
        <div className="checklist-rows">
          {set.sourceUrl && (
            <a className="checklist-tcdb-link" href={set.sourceUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              View this year's checklist on TCDB ↗
            </a>
          )}
          {entries.length === 0 ? (
            <p className="checklist-empty">{hideCollected ? "All collected for this year." : "No matching cards."}</p>
          ) : (
            entries.map((entry) => {
              const key = checklistEntryKey(set.year, entry.n);
              const auto = checklistMatches.get(key);
              const manual = !!checklistManual[key];
              const owned = !!auto || manual;
              const series = showSeries ? getCardSeries(set.year, entry.n) : null;
              return (
                <div className={`checklist-row${owned ? " owned" : ""}`} key={key}>
                  {auto ? (
                    <button type="button" className="checklist-check auto" title="Matched to a card in your ledger — click to open it" onClick={() => onOpenDetail(auto[0])}>✓</button>
                  ) : (
                    <label className="checklist-check-label">
                      <input type="checkbox" checked={manual} onChange={() => onToggleManual(key)} />
                    </label>
                  )}
                  <span className="checklist-num">#{entry.n}</span>
                  <button
                    type="button"
                    className="checklist-player checklist-player-btn"
                    onClick={() =>
                      auto
                        ? onOpenDetail(auto[0])
                        : onOpenInfo({
                            year: set.year,
                            setName: set.setName,
                            team: entry.team || set.team,
                            number: entry.n,
                            player: entry.p,
                            manual,
                            note: entry.note || null,
                          })
                    }
                  >
                    {entry.p}
                  </button>
                  {mixedTeams && <span className="checklist-year-team checklist-row-team">{entry.team}</span>}
                  {series && <span className="checklist-series-tag" title="Which pack wave/series this card actually shipped in">{set.year} {series}</span>}
                  {auto && <span className="checklist-auto-tag">in ledger</span>}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function CardImage({ src, alt, fallbackLabel, onOrientation }) {
  const [errored, setErrored] = useState(false);
  const imgRef = useRef(null);
  useEffect(() => setErrored(false), [src]);

  // Round 33: a cached image -- the exact same URL already loaded elsewhere on the page, or
  // already sitting in the browser's own HTTP cache from an earlier visit -- can finish loading
  // before React ever attaches the onLoad handler below; some browsers then never fire a `load`
  // event for it at all. When that happens, onOrientation never runs, the tile silently stays
  // classified as portrait regardless of the photo's real shape, and a landscape photo ends up
  // floating in the default portrait-shaped box (object-fit: contain inside a 5:7 box) with a
  // big empty gap above and below it -- matches Kaleb's "big white box" report. This effect
  // catches that case by checking the image's own `.complete`/naturalWidth right after mount
  // (and again whenever `src` changes), so orientation still gets reported even when the onLoad
  // event itself never fires. Calling onOrientation from both this effect and onLoad below is
  // harmless -- markTileOrientation no-ops if the classification hasn't actually changed.
  useEffect(() => {
    if (!onOrientation) return;
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      onOrientation(img.naturalWidth > img.naturalHeight);
    }
  }, [src, onOrientation]);

  if (!src || errored) {
    return (
      <div className="img-fallback">
        <span>{fallbackLabel || "No photo"}</span>
      </div>
    );
  }
  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      onLoad={onOrientation ? (e) => onOrientation(e.target.naturalWidth > e.target.naturalHeight) : undefined}
    />
  );
}

// --- Bulk Auto-Import: point the SERVER at a folder of subfolders (one per card) and let it
// identify, orient, and save with no per-card review, except for the minority the AI genuinely
// isn't confident about -- those land here in a small review queue instead of being saved or
// guessed. Everything actually happens server-side (Anthropic's Batch API, at half the normal
// price, in exchange for taking up to a few hours instead of being instant) so this keeps
// working even if the tab is closed; this panel is just a window onto job status + the review
// queue, polled while it's open.
// Groups a browser-picked folder's files by the directory they're directly in -- e.g. a file
// with webkitRelativePath "ScannedCards/Stars Box 1/IMG_042.jpg" lands in the "Stars Box
// 1" group alongside every other image directly inside that same folder. Deliberately mirrors
// bulk-import.js's server-side findImageGroups (same rule: a folder's own directly-contained
// images form one group, and this naturally covers arbitrarily nested folders-of-folders too,
// since every distinct directory that holds at least one image gets its own group) so a folder
// uploaded straight from the browser gets paired up exactly the same way a folder already on the
// server would.
const AUTO_IMPORT_IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

function buildFolderGroupsFromFileList(fileList) {
  const files = Array.from(fileList).filter((f) => AUTO_IMPORT_IMAGE_EXT.test(f.name));
  const byDir = new Map();
  for (const f of files) {
    const rel = f.webkitRelativePath || f.name;
    const slash = rel.lastIndexOf("/");
    const dir = slash === -1 ? "" : rel.slice(0, slash);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(f);
  }
  const naturalCompare = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  return Array.from(byDir.keys())
    .sort(naturalCompare)
    .map((dir) => ({
      dir,
      files: byDir.get(dir).slice().sort((a, b) => naturalCompare(a.name, b.name)),
    }));
}

// Same 1-2-images-is-a-card / more-than-2-is-sequential-pairs rule as bulk-import.js's
// groupToItems, applied to File objects instead of on-disk paths.
function folderGroupToUploadItems(group) {
  const label = group.dir || "(root)";
  const files = group.files;
  if (files.length <= 2) {
    return [{ folderName: label, frontFile: files[0], backFile: files[1] || null }];
  }
  const items = [];
  for (let i = 0; i < files.length; i += 2) {
    const n = String(items.length + 1).padStart(4, "0");
    items.push({ folderName: `${label}/#${n}`, frontFile: files[i], backFile: files[i + 1] || null });
  }
  return items;
}

function autoImportFolderLabel(fileList) {
  const first = fileList && fileList[0];
  const rel = first && first.webkitRelativePath;
  if (!rel) return "uploaded folder";
  return rel.split("/")[0] || "uploaded folder";
}

function AutoImportPanel({ onCardsMayHaveChanged }) {
  const [folderInput, setFolderInput] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [uploadError, setUploadError] = useState(null);
  const [uploadDone, setUploadDone] = useState(null);
  const [retryingJobId, setRetryingJobId] = useState(null);
  const [retryJobError, setRetryJobError] = useState(null);

  // Round 28: the actual "needs your review" queue moved to its own top-level Review tab
  // (ReviewPanel, below) so it lives in one place alongside manually-flagged gallery cards,
  // instead of being buried inside this tab. This panel now only tracks job status + uploading.
  async function refresh() {
    try {
      const jobsRes = await fetch("/api/bulk-import/jobs").then((r) => r.json());
      setJobs((jobsRes && jobsRes.jobs) || []);
      // A running job can auto-save confident cards straight into the ledger server-side with
      // this tab just sitting here polling -- keep the Gallery in sync without a manual refresh.
      if (onCardsMayHaveChanged) onCardsMayHaveChanged();
    } catch (e) {
      // transient network hiccup while polling -- next poll will just try again
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 6000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Round 32: an errored job (most commonly: the Anthropic account ran out of API credit
  // mid-run) sits stuck forever on its own -- the background tick loop only ever re-processes
  // jobs whose status is 'processing', and nothing else in the app resets that. This just calls
  // the new retry endpoint, which flips the job back to 'processing' server-side so the next
  // background tick picks it back up right where it left off.
  async function retryJob(jobId) {
    setRetryingJobId(jobId);
    setRetryJobError(null);
    try {
      const res = await fetch(`/api/bulk-import/jobs/${jobId}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error((data.error && data.error.message) || "Couldn't retry that import.");
      await refresh();
    } catch (e) {
      setRetryJobError(e.message);
    } finally {
      setRetryingJobId(null);
    }
  }

  async function startImport() {
    if (!folderInput.trim()) {
      setStartError("Enter the folder name (relative to your configured import folder on the server).");
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch("/api/bulk-import/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: folderInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data.error && data.error.message) || "Couldn't start the import.");
      setFolderInput("");
      await refresh();
    } catch (e) {
      setStartError(e.message);
    } finally {
      setStarting(false);
    }
  }

  // Uploads a folder (or folder of folders) picked straight from this device -- no scp, no
  // server-side folder needed. Resizes and reads EXIF client-side (the exact same
  // fileToResizedDataUrl/detectPhotoSource code Bulk Add already uses) a handful of cards at a
  // time, POSTing each small chunk to /api/bulk-import/ingest as it's ready rather than resizing
  // everything up front -- so a folder of a couple thousand images doesn't try to hold every
  // resized copy in memory at once. Once uploaded, identification/saving happens the same way as
  // a server-folder import (the background tickJob loop, Anthropic's Batch API): the browser tab
  // can be closed as soon as the progress bar below finishes.
  async function uploadFolder(fileList) {
    setUploadError(null);
    setUploadDone(null);
    const groups = buildFolderGroupsFromFileList(fileList);
    let items = [];
    for (const g of groups) items = items.concat(folderGroupToUploadItems(g));
    if (!items.length) {
      setUploadError(
        "No image files were found in that folder (looking for .jpg, .jpeg, .png, or .webp files, including inside subfolders)."
      );
      return;
    }
    const folderLabel = autoImportFolderLabel(fileList);
    setUploading(true);
    setUploadProgress({ done: 0, total: items.length });
    let jobId = null;
    const CHUNK_SIZE = 8;
    try {
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const prepared = await Promise.all(
          chunk.map(async (it) => {
            const [frontApi, frontStorage, frontPhoto] = await Promise.all([
              fileToResizedDataUrl(it.frontFile, 1024, 0.85),
              fileToResizedDataUrl(it.frontFile, 1280, 0.85),
              detectPhotoSource(it.frontFile),
            ]);
            let backApi = null;
            let backStorage = null;
            let backPhoto = { isLikelyPhone: false };
            if (it.backFile) {
              [backApi, backStorage, backPhoto] = await Promise.all([
                fileToResizedDataUrl(it.backFile, 1024, 0.85),
                fileToResizedDataUrl(it.backFile, 1280, 0.85),
                detectPhotoSource(it.backFile),
              ]);
            }
            return {
              folderName: it.folderName,
              frontApi,
              backApi,
              frontStorage,
              backStorage,
              frontIsPhone: frontPhoto.isLikelyPhone,
              backIsPhone: backPhoto.isLikelyPhone,
            };
          })
        );
        const res = await fetch("/api/bulk-import/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, folderLabel, items: prepared }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error((data.error && data.error.message) || "Upload failed partway through.");
        jobId = data.jobId;
        setUploadProgress((p) => ({ done: Math.min(p.total, p.done + chunk.length), total: p.total }));
      }
      await refresh();
      setUploadDone(
        `Uploaded all ${items.length} card${items.length === 1 ? "" : "s"} from "${folderLabel}". Look for it under "In progress" below -- ` +
          `identifying and saving happens on the server from here, so this can take anywhere from a few minutes to a couple hours depending ` +
          `on how many cards it is.`
      );
    } catch (e) {
      setUploadError(
        `${e.message} -- cards already uploaded before this happened are safely queued and will still be identified, so you don't need ` +
          `to redo those. If some of the folder never made it up, just pick the same folder again; a card uploaded twice just becomes two ` +
          `entries, easy to spot and delete from the gallery afterward.`
      );
    } finally {
      setUploading(false);
    }
  }

  const activeJobs = jobs.filter((j) => j.status === "processing");
  const pastJobs = jobs.filter((j) => j.status !== "processing");

  return (
    <div className="auto-import-panel">
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <input
          type="file"
          accept="image/*"
          multiple
          webkitdirectory=""
          id="auto-import-upload-input"
          style={{ display: "none" }}
          onChange={(e) => {
            // Copy the selection into a plain array BEFORE touching e.target.value: in at least
            // Chrome, e.target.files is a live FileList tied to the input itself, so resetting
            // the input's value (done here so picking the exact same folder again still fires a
            // fresh onChange) empties that same FileList out from under any reference taken
            // after the reset -- if the length was checked post-reset, it read back 0 and
            // uploadFolder silently never ran at all, which is exactly what looked like the
            // button doing nothing.
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            if (files.length) uploadFolder(files);
          }}
        />
        <label
          htmlFor="auto-import-upload-input"
          className="dropzone"
          style={{ display: "block", textAlign: "center", opacity: uploading ? 0.6 : 1, pointerEvents: uploading ? "none" : "auto" }}
        >
          {uploading ? `Uploading ${uploadProgress.done} of ${uploadProgress.total} cards...` : "Choose a folder to upload"}
        </label>
        {uploading && (
          <div className="auto-import-progress-track" style={{ marginTop: 8 }}>
            <div
              className="auto-import-progress-fill"
              style={{ width: `${uploadProgress.total ? Math.round((uploadProgress.done / uploadProgress.total) * 100) : 0}%` }}
            />
          </div>
        )}
        {uploadError && <p className="identify-error">{uploadError}</p>}
        {uploadDone && <div className="banner banner-success">{uploadDone}</div>}
        <p style={{ fontSize: 13, opacity: 0.75 }}>
          This uploads straight from your browser -- no need to copy scans onto the server yourself first. Keep this tab open until the
          upload finishes; the identifying and saving itself then happens on the server in the background, same as everything else here.
        </p>

        <details style={{ marginTop: 20 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, opacity: 0.85 }}>
            Already copied scans onto the server yourself? Import from a server folder instead
          </summary>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder="folder name (relative to your configured import folder)"
              value={folderInput}
              onChange={(e) => setFolderInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn-primary" onClick={startImport} disabled={starting}>
              {starting ? "Starting..." : "Start import"}
            </button>
          </div>
          {startError && <p className="identify-error">{startError}</p>}
        </details>

        <p style={{ fontSize: 13, opacity: 0.75, marginTop: 20 }}>
          First time using this? Try it on a small test folder (5-10 cards) before pointing it at your whole backlog, since this is new
          and hasn't been run against a real folder yet.
        </p>
      </div>

      {activeJobs.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3>In progress</h3>
          {activeJobs.map((job) => (
            <div key={job.id} className="auto-import-job-card">
              <p style={{ margin: 0, fontWeight: 600 }}>{job.folder_name}</p>
              <p style={{ margin: "4px 0", fontSize: 14 }}>
                {job.auto_added} of {job.total_items} auto-added &middot; {job.needs_review} flagged for review &middot; est. $
                {job.cost_usd.toFixed(2)} so far
              </p>
              <div className="auto-import-progress-track">
                <div
                  className="auto-import-progress-fill"
                  style={{ width: `${Math.min(100, Math.round(((job.auto_added + job.needs_review) / Math.max(1, job.total_items)) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {pastJobs.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3>Recent imports</h3>
          {pastJobs.map((job) => (
            <div key={job.id} className="auto-import-job-card">
              <p style={{ margin: 0, fontWeight: 600 }}>
                {job.folder_name} -- {job.status === "error" ? "error" : "done"}
              </p>
              <p style={{ margin: "4px 0", fontSize: 14 }}>
                {job.auto_added} of {job.total_items} auto-added &middot; {job.needs_review} flagged for review &middot; est. $
                {job.cost_usd.toFixed(2)} total
              </p>
              {job.error_message && <p className="identify-error">{job.error_message}</p>}
              {job.status === "error" && (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => retryJob(job.id)}
                    disabled={retryingJobId === job.id}
                  >
                    {retryingJobId === job.id ? "Retrying..." : "Retry"}
                  </button>
                  <p style={{ fontSize: 12, opacity: 0.7, margin: "4px 0 0" }}>
                    Ran out of API credit or hit a network hiccup? Add credit to your Anthropic account first, then hit Retry -- it'll
                    pick back up right where it stopped, not start over.
                  </p>
                  {retryJobError && retryingJobId === null && <p className="identify-error">{retryJobError}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

// --- Review: cards Kaleb flagged himself from the Gallery/detail view, AND whatever Auto Import
// couldn't confidently identify on its own (moved here from the Auto Import tab, round 28, so
// there's one place to work through everything needing a second look instead of two). ---
function ReviewPanel({ flaggedCards, onToggleNeedsReview, onOpenDetail, onCardsMayHaveChanged, getDisplay }) {
  const [reviewItems, setReviewItems] = useState([]);
  const [drafts, setDrafts] = useState({}); // reviewItemId -> editable form fields
  const [swappedItems, setSwappedItems] = useState({}); // reviewItemId -> true once "Swap front/back" is clicked
  const [photoOverrides, setPhotoOverrides] = useState({}); // reviewItemId -> { front?: dataUrl, back?: dataUrl } from "Replace photo"
  const [replacing, setReplacing] = useState({}); // "<reviewItemId>:<side>" -> true while a replacement photo is being resized
  const [retrying, setRetrying] = useState({}); // reviewItemId -> true while a retry POST is in flight
  const [retryError, setRetryError] = useState({}); // reviewItemId -> error message from a failed retry
  const [zoomSrc, setZoomSrc] = useState(null);

  async function refresh() {
    try {
      const reviewRes = await fetch("/api/bulk-import/review").then((r) => r.json());
      const items = (reviewRes && reviewRes.items) || [];
      setReviewItems(items);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const item of items) {
          if (!next[item.id]) {
            const g = item.guess || {};
            next[item.id] = {
              player: g.player || "",
              team: g.team || "",
              sport: SPORTS.includes(g.sport) ? g.sport : "Hockey",
              year: g.year ? String(g.year) : "",
              brand: g.brand || "",
              set: g.set || "",
              cardNumber: g.cardNumber || "",
              value: g.estimatedValue !== null && g.estimatedValue !== undefined ? String(g.estimatedValue) : "",
              onlineFrontUrl: g.frontImageUrl || null,
              onlineBackUrl: g.backImageUrl || null,
            };
          }
        }
        return next;
      });
    } catch (e) {
      // transient network hiccup while polling -- next poll will just try again
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 6000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateDraft(id, field, value) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  // Resolves what should actually be stored as this card's front/back, folding together both
  // corrections a review card can apply: "Swap front/back" (the two photos are of the SAME
  // physical card, just labeled backwards) and "Replace photo" (one of the two photos is of a
  // completely different card -- e.g. a >2-image folder pairs strictly by position, so a single
  // stray or missing photo earlier in that folder shifts every pairing after it, landing the
  // back of one card next to the front of another -- see groupToItems in bulk-import.js). Always
  // computed fresh here and sent explicitly to the server, rather than sending flags for the
  // server to reinterpret, so what Kaleb sees in the review card is exactly what gets saved.
  function resolveReviewImages(item) {
    const overrides = photoOverrides[item.id] || {};
    const baseFront = overrides.front || item.front_storage || null;
    const baseBack = overrides.back || item.back_storage || null;
    return swappedItems[item.id] ? { front: baseBack, back: baseFront } : { front: baseFront, back: baseBack };
  }

  function clearReviewItemLocalState(id) {
    setSwappedItems((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPhotoOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function saveReviewItem(id) {
    const draft = drafts[id];
    const item = reviewItems.find((r) => r.id === id);
    if (!draft || !draft.player.trim() || !item) return;
    const { front, back } = resolveReviewImages(item);
    await fetch(`/api/bulk-import/review/${id}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, frontImage: front, backImage: back }),
    });
    setReviewItems((prev) => prev.filter((r) => r.id !== id));
    clearReviewItemLocalState(id);
    if (onCardsMayHaveChanged) onCardsMayHaveChanged();
  }

  async function discardReviewItem(id) {
    await fetch(`/api/bulk-import/review/${id}/discard`, { method: "POST" });
    setReviewItems((prev) => prev.filter((r) => r.id !== id));
    clearReviewItemLocalState(id);
  }

  function toggleSwapReviewItem(id) {
    setSwappedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // "Replace photo" -- for when Swap alone won't fix it because the paired photo isn't just
  // upside-down/mislabeled, it's a photo of an entirely different physical card. Resizes exactly
  // like every other photo intake path in this app (fileToResizedDataUrl, 1280px) and stashes the
  // result locally; nothing is sent to the server until Save or Retry is clicked.
  async function replaceReviewPhoto(id, side, file) {
    if (!file) return;
    const key = `${id}:${side}`;
    setReplacing((prev) => ({ ...prev, [key]: true }));
    try {
      const dataUrl = await fileToResizedDataUrl(file, 1280, 0.85);
      setPhotoOverrides((prev) => ({ ...prev, [id]: { ...prev[id], [side]: dataUrl } }));
    } catch (e) {
      setRetryError((prev) => ({ ...prev, [id]: "Couldn't read that photo -- try a different file." }));
    } finally {
      setReplacing((prev) => ({ ...prev, [key]: false }));
    }
  }

  // Sends the item back through identification instead of fixing it by hand -- see the
  // server-side route for why this is a real second attempt and not a no-op. If a photo was
  // replaced above, the corrected photo (not the original) is what gets re-identified. Not
  // instant: it rejoins the same background import job, so it can take a few minutes or more to
  // resolve (either landing straight in the collection, or coming back to this list if it's still
  // not confident) rather than updating in place right away.
  async function retryReviewItem(id) {
    const item = reviewItems.find((r) => r.id === id);
    if (!item) return;
    const { front, back } = resolveReviewImages(item);
    setRetrying((prev) => ({ ...prev, [id]: true }));
    setRetryError((prev) => ({ ...prev, [id]: null }));
    try {
      const res = await fetch(`/api/bulk-import/review/${id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frontImage: front, backImage: back }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.error && data.error.message) || "Couldn't retry this one.");
      setReviewItems((prev) => prev.filter((r) => r.id !== id));
      clearReviewItemLocalState(id);
      await refresh();
    } catch (e) {
      setRetryError((prev) => ({ ...prev, [id]: e.message }));
    } finally {
      setRetrying((prev) => ({ ...prev, [id]: false }));
    }
  }

  const hasAnything = flaggedCards.length > 0 || reviewItems.length > 0;

  return (
    <div className="auto-import-panel">
      {!hasAnything && (
        <p style={{ fontSize: 14, opacity: 0.7, textAlign: "center", marginTop: 40 }}>Nothing needs review right now.</p>
      )}

      {flaggedCards.length > 0 && (
        <div>
          <h3>Flagged by you ({flaggedCards.length})</h3>
          {flaggedCards.map((c) => {
            const pair = getDisplay(c);
            const shown = pair.front || pair.back;
            return (
              <div key={c.id} className="auto-import-review-card review-flagged-card">
                <div className="photo-pair-row">
                  <div style={{ flex: "0 0 90px" }}>
                    <CardImage src={shown} alt={c.player} fallbackLabel="No photo yet" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="tile-player">{c.player}</div>
                    <div className="tile-sub">{[c.year, c.brand, c.set].filter(Boolean).join(" · ")}</div>
                    <div className="tile-value">{moneyOrDash(c.value)}</div>
                  </div>
                </div>
                <div className="form-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="btn-secondary" onClick={() => onToggleNeedsReview(c.id)}>Remove from review</button>
                  <div className="form-actions-right">
                    <button type="button" className="btn-primary" onClick={() => onOpenDetail(c)}>Open</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {reviewItems.length > 0 && (
        <div style={{ marginTop: flaggedCards.length > 0 ? 32 : 0 }}>
          <h3>From Auto Import ({reviewItems.length})</h3>
          {reviewItems.map((item) => {
            const draft = drafts[item.id] || {};
            const swapped = !!swappedItems[item.id];
            const { front: frontSrc, back: backSrc } = resolveReviewImages(item);
            const isRetrying = !!retrying[item.id];
            const replacingFront = !!replacing[`${item.id}:front`];
            const replacingBack = !!replacing[`${item.id}:back`];
            return (
              <div key={item.id} className="auto-import-review-card">
                <div className="photo-pair-row">
                  <div className="photo-pair-col">
                    {frontSrc && <img src={frontSrc} alt="front" className="review-thumb" onClick={() => setZoomSrc(frontSrc)} />}
                    <span className="review-thumb-label">Front</span>
                    <input
                      type="file"
                      accept="image/*"
                      id={`replace-front-${item.id}`}
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files && e.target.files[0];
                        e.target.value = "";
                        if (file) replaceReviewPhoto(item.id, "front", file);
                      }}
                    />
                    <label htmlFor={`replace-front-${item.id}`} className="review-replace-link">
                      {replacingFront ? "Reading..." : "Replace photo"}
                    </label>
                  </div>
                  <div className="photo-pair-col">
                    {backSrc && <img src={backSrc} alt="back" className="review-thumb" onClick={() => setZoomSrc(backSrc)} />}
                    <span className="review-thumb-label">Back</span>
                    <input
                      type="file"
                      accept="image/*"
                      id={`replace-back-${item.id}`}
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files && e.target.files[0];
                        e.target.value = "";
                        if (file) replaceReviewPhoto(item.id, "back", file);
                      }}
                    />
                    <label htmlFor={`replace-back-${item.id}`} className="review-replace-link">
                      {replacingBack ? "Reading..." : "Replace photo"}
                    </label>
                  </div>
                </div>
                <p style={{ fontSize: 13, opacity: 0.75, margin: "4px 0" }}>
                  {item.reason === "api_error" ? "Couldn't identify this one automatically" : "Not confident enough to auto-add"}
                  {item.folder_name ? ` -- from "${item.folder_name}"` : ""}
                  {(photoOverrides[item.id] && (photoOverrides[item.id].front || photoOverrides[item.id].back)) ? " -- photo replaced, not yet saved" : ""}
                </p>
                <div className="verify-fields">
                  <input placeholder="Player" value={draft.player || ""} onChange={(e) => updateDraft(item.id, "player", e.target.value)} />
                  <input placeholder="Team" value={draft.team || ""} onChange={(e) => updateDraft(item.id, "team", e.target.value)} />
                  <select value={draft.sport || "Hockey"} onChange={(e) => updateDraft(item.id, "sport", e.target.value)}>
                    {SPORTS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <input placeholder="Year" value={draft.year || ""} onChange={(e) => updateDraft(item.id, "year", e.target.value)} />
                  <input placeholder="Brand" value={draft.brand || ""} onChange={(e) => updateDraft(item.id, "brand", e.target.value)} />
                  <input placeholder="Set" value={draft.set || ""} onChange={(e) => updateDraft(item.id, "set", e.target.value)} />
                  <input placeholder="Card #" value={draft.cardNumber || ""} onChange={(e) => updateDraft(item.id, "cardNumber", e.target.value)} />
                  <input placeholder="Value ($)" value={draft.value || ""} onChange={(e) => updateDraft(item.id, "value", e.target.value)} />
                </div>
                {retryError[item.id] && <p className="identify-error">{retryError[item.id]}</p>}
                <div className="form-actions" style={{ marginTop: 8 }}>
                  <div className="form-actions-right">
                    <button type="button" className="btn-secondary" onClick={() => toggleSwapReviewItem(item.id)}>
                      {swapped ? "Undo swap" : "Swap front/back"}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => retryReviewItem(item.id)} disabled={isRetrying}>
                      {isRetrying ? "Sending..." : "Retry identification"}
                    </button>
                  </div>
                  <div className="form-actions-right">
                    <button type="button" className="btn-secondary" onClick={() => discardReviewItem(item.id)}>Discard</button>
                    <button type="button" className="btn-primary" onClick={() => saveReviewItem(item.id)} disabled={!draft.player || !draft.player.trim()}>
                      Save to ledger
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {zoomSrc && (
        <div className="overlay zoom-overlay" onClick={() => setZoomSrc(null)}>
          <img src={zoomSrc} alt="zoomed card" className="zoom-overlay-img" />
          <button type="button" className="zoom-overlay-close" onClick={() => setZoomSrc(null)}>Close ✕</button>
        </div>
      )}
    </div>
  );
}

// Splits one team's cards into as many equal-size packs as they'll fill (Kaleb's own eBay
// convention: packs of a fixed size, 20 by default), balancing approximate value across those
// packs so no single pack is stuck with all the cheap commons or all the expensive hits.
// Greedy LPT (longest-processing-time-first) bin-balancing: sort cards richest-first, then always
// drop the next card into whichever pack (that still has room) currently holds the least value.
// This doesn't guarantee perfectly equal totals, but it's the standard cheap heuristic for
// balanced-partition problems like this and gets close in practice. Any cards left over once
// every pack is full (count isn't an exact multiple of the pack size) come out lowest-value-first,
// since those are exactly the cards a value-first sort processes last -- so what's left behind is
// naturally "the extras," not an arbitrary bite taken out of the good stuff.
function buildSellerBundles(teamCards, bundleSize) {
  const numBundles = Math.floor(teamCards.length / bundleSize);
  if (numBundles === 0) return { bundles: [], leftover: teamCards.slice() };
  const sorted = [...teamCards].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
  const bundles = Array.from({ length: numBundles }, () => ({ cards: [], total: 0 }));
  const leftover = [];
  sorted.forEach((card) => {
    let target = null;
    bundles.forEach((bin) => {
      if (bin.cards.length >= bundleSize) return;
      if (!target || bin.total < target.total) target = bin;
    });
    if (target) {
      target.cards.push(card);
      target.total += Number(card.value) || 0;
    } else {
      leftover.push(card);
    }
  });
  return { bundles, leftover };
}

// Groups every sellable card by team into balanced packs (buildSellerBundles above), then pools
// whatever's left over from each team together and bundles THAT into "mixed teams" packs of the
// same size -- so a team with too few cards on its own for a full pack still gets its cards onto
// a listing eventually, instead of just sitting unbundled forever. Returns one "listing" per pack
// (team packs first, then mixed), sorted richest-first, plus whatever's left after even the mixed
// pass (too little of everything to fill one more pack).
function buildSellerListings(sellableCards, bundleSize) {
  const byTeam = new Map();
  sellableCards.forEach((c) => {
    const team = c.team || "Unlisted team";
    if (!byTeam.has(team)) byTeam.set(team, []);
    byTeam.get(team).push(c);
  });
  const listings = [];
  const pooledLeftover = [];
  byTeam.forEach((teamCards, team) => {
    const { bundles, leftover } = buildSellerBundles(teamCards, bundleSize);
    bundles.forEach((b) => listings.push({ kind: "team", team, cards: b.cards, total: b.total }));
    pooledLeftover.push(...leftover);
  });
  const mixed = buildSellerBundles(pooledLeftover, bundleSize);
  mixed.bundles.forEach((b) => listings.push({ kind: "mixed", cards: b.cards, total: b.total }));
  listings.sort((a, b) => b.total - a.total);
  return { listings, finalLeftover: mixed.leftover };
}

// A generic, eBay-ready draft title -- not tied to any specific team's branding, just what's
// actually in the pack: how many cards, which brand(s), which year(s). Kaleb can always tweak the
// wording himself before actually posting; this just saves starting from a blank field every time.
function suggestedListingTitle(listing) {
  const years = listing.cards
    .map((c) => parseInt(String(c.year || "").match(/\d{4}/)?.[0] || "", 10))
    .filter((n) => !isNaN(n));
  const yearLabel = years.length
    ? Math.min(...years) === Math.max(...years)
      ? String(Math.min(...years))
      : `${Math.min(...years)}-${Math.max(...years)}`
    : "Mixed Years";
  const brands = Array.from(new Set(listing.cards.map((c) => c.brand).filter(Boolean)));
  const brandLabel = brands.length === 1 ? brands[0] : brands.length > 1 ? "Mixed Brands" : "";
  const subject = listing.kind === "mixed" ? "Mixed NHL Teams" : listing.team;
  return `${subject} Hockey Card Lot — ${listing.cards.length} Cards${brandLabel ? ` — ${brandLabel}` : ""} — ${yearLabel}`;
}

function listingTeamBreakdown(listing) {
  const counts = new Map();
  listing.cards.forEach((c) => {
    const t = c.team || "Unlisted team";
    counts.set(t, (counts.get(t) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function buildListingCopyText(listing, discountPct) {
  const suggested = listing.total * (1 - discountPct / 100);
  const lines = [
    suggestedListingTitle(listing),
    "",
    `Suggested price: ${money(suggested)}  (book value ${money(listing.total)}, ${discountPct}% off)`,
    listing.kind === "mixed"
      ? `${listing.cards.length} cards — ${listingTeamBreakdown(listing).map(([t, n]) => `${t} (${n})`).join(", ")}`
      : `${listing.cards.length} cards — ${listing.team}`,
    "",
    "Cards included:",
    ...listing.cards.map((c) => `${[c.year, c.brand, c.set].filter(Boolean).join(" ")} ${c.player}${c.cardNumber ? ` #${c.cardNumber}` : ""} — ${moneyOrDash(c.value)}`),
  ];
  return lines.join("\n");
}

function SellerPanel({ cards, bundles, foundIds, cantFindIds, getDisplay, onOpenDetail, onCreateBundle, onDissolveBundle, onMarkBundleSold, onReturnBundleToGallery, onToggleSold, onToggleFound, onToggleCantFind }) {
  const [bundleSize, setBundleSize] = useState(20);
  const [discountPct, setDiscountPct] = useState(50);
  const [copiedKey, setCopiedKey] = useState(null);
  // Round 36: which "Suggested listings" cards are expanded to show photos, keyed the same way
  // as each listing's own React key below. Collapsed by default -- these packs can run to 20+
  // cards, and Kaleb only wants the photos once he's actually about to work on a specific pack.
  const [expandedListingKeys, setExpandedListingKeys] = useState(() => new Set());
  function toggleListingExpanded(key) {
    setExpandedListingKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const safeBundleSize = Math.max(1, Math.round(Number(bundleSize) || 20));
  const safeDiscount = Math.min(100, Math.max(0, Math.round(Number(discountPct) || 0)));

  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const bundledIds = useMemo(() => new Set(bundles.flatMap((b) => b.cardIds)), [bundles]);

  // Reconstructs each persisted bundle into the same {kind, team, cards, total} shape a freshly
  // suggested listing has, looking its cards up live in the current `cards` array so a price or
  // photo edit made after bundling still shows correctly -- only the GROUPING (which card ids
  // belong together) is what's actually locked in and immune to future re-bundling.
  const bundleListings = useMemo(
    () =>
      bundles.map((b) => {
        const bundleCards = b.cardIds.map((id) => cardById.get(id)).filter(Boolean);
        const total = bundleCards.reduce((s, c) => s + (Number(c.value) || 0), 0);
        return { id: b.id, kind: b.kind, team: b.team, cards: bundleCards, total, sold: b.sold, createdAt: b.createdAt };
      }),
    [bundles, cardById]
  );
  const activeBundleListings = useMemo(
    () => bundleListings.filter((b) => !b.sold).sort((a, b) => b.createdAt - a.createdAt),
    [bundleListings]
  );
  const soldBundleListings = useMemo(
    () => bundleListings.filter((b) => b.sold).sort((a, b) => b.createdAt - a.createdAt),
    [bundleListings]
  );

  // "available" is what's actually eligible for a NEW suggested pack: not on Kaleb's own
  // Stars/checklist (already filtered out before "cards" ever reaches this component), not
  // already sold, not waiting on review, not already locked into an existing bundle, and (round
  // 39) not flagged "can't find" -- so scanning in a few hundred new cards never reshuffles a
  // bundle Kaleb's already physically made, and a card he's given up looking for stops getting
  // suggested until he clears the flag. Excluding it here (rather than never handing it to this
  // component at all) is what lets buildSellerListings naturally fill that card's old slot with a
  // different one on the very next render -- no separate "replace" logic needed for the
  // not-yet-bundled case, it falls straight out of the existing bin-packing.
  const available = useMemo(
    () => cards.filter((c) => !c.sold && !c.needsReview && !bundledIds.has(c.id) && !cantFindIds.has(c.id)),
    [cards, bundledIds, cantFindIds]
  );
  const individualSoldCards = useMemo(() => cards.filter((c) => c.sold && !bundledIds.has(c.id)), [cards, bundledIds]);
  // Round 39: cards currently flagged "can't find" that are still otherwise in play (not sold,
  // not sitting in some bundle) -- shown in their own section below so flagging one doesn't just
  // make it vanish without a way back; "Found it after all" there clears the flag.
  const cantFindCards = useMemo(
    () => cards.filter((c) => cantFindIds.has(c.id) && !c.sold && !bundledIds.has(c.id)),
    [cards, cantFindIds, bundledIds]
  );

  const { listings, finalLeftover } = useMemo(
    () => buildSellerListings(available, safeBundleSize),
    [available, safeBundleSize]
  );

  function copyListing(listing, key) {
    try {
      navigator.clipboard.writeText(buildListingCopyText(listing, safeDiscount));
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch (e) {
      // Clipboard access can be blocked in some contexts -- the listing text is still fully
      // visible on screen either way, so this is a convenience, not something the feature depends on.
    }
  }

  const individualSoldTotal = individualSoldCards.reduce((s, c) => s + (Number(c.value) || 0), 0);
  const soldBundleCardCount = soldBundleListings.reduce((s, b) => s + b.cards.length, 0);
  const soldBundleTotal = soldBundleListings.reduce((s, b) => s + b.total, 0);

  if (available.length === 0 && bundleListings.length === 0 && individualSoldCards.length === 0 && cantFindCards.length === 0) {
    return (
      <div className="empty-state">
        <p>Nothing to sell right now. Cards on your Dallas Stars/North Stars checklist, the Young Guns checklist, and Pro Set cards are never included here -- once you've got some other teams' cards scanned in, suggested packs will show up on this tab.</p>
      </div>
    );
  }

  return (
    <div className="seller-panel">
      <p className="seller-note">
        Cards on your Dallas Stars/North Stars checklist or the Young Guns checklist are left out of everything below -- those aren't for sale. Pro Set cards are left out too -- you keep those in a separate pile.
      </p>

      <div className="controls seller-controls">
        <label className="seller-size-label">
          Pack size
          <input type="number" min="1" value={bundleSize} onChange={(e) => setBundleSize(e.target.value)} />
          cards
        </label>
        <label className="seller-discount-label">
          Discount off book value
          <input type="range" min="0" max="90" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
          <span className="seller-discount-value">{safeDiscount}%</span>
        </label>
      </div>

      {activeBundleListings.length > 0 && (
        <div className="seller-section">
          <h3 className="seller-section-heading">Your bundles ({activeBundleListings.length})</h3>
          {activeBundleListings.map((listing) => {
            const key = `bundle-${listing.id}`;
            const suggested = listing.total * (1 - safeDiscount / 100);
            const isExpanded = expandedListingKeys.has(key);
            // Round 39: same found-progress pill Suggested listings got in round 38 -- a bundle
            // being physically packed up is exactly when Kaleb still cares about this count.
            const foundCount = listing.cards.reduce((n, c) => n + (foundIds.has(c.id) ? 1 : 0), 0);
            return (
              <div className="seller-bundle-card" key={key}>
                <button
                  type="button"
                  className="seller-listing-title seller-listing-toggle"
                  onClick={() => toggleListingExpanded(key)}
                  aria-expanded={isExpanded}
                >
                  <span className={isExpanded ? "seller-expand-caret seller-expand-caret-open" : "seller-expand-caret"}>▸</span>
                  <span>{suggestedListingTitle(listing)}</span>
                  <span className="seller-status-pill seller-status-bundled">Bundled</span>
                  {foundCount > 0 && (
                    <span className={foundCount === listing.cards.length ? "seller-found-progress seller-found-progress-complete" : "seller-found-progress"}>
                      {foundCount === listing.cards.length ? "All found" : `${foundCount}/${listing.cards.length} found`}
                    </span>
                  )}
                </button>
                <div className="seller-bundle-header">
                  <div className="seller-price-block">
                    <div className="seller-bundle-value">{money(suggested)}</div>
                    <div className="tile-sub">book {money(listing.total)}</div>
                  </div>
                  <div className="seller-bundle-actions">
                    <button type="button" className="link-btn" onClick={() => copyListing(listing, key)}>
                      {copiedKey === key ? "Copied!" : "Copy listing"}
                    </button>
                    <button type="button" className="link-btn" onClick={() => onDissolveBundle(listing.id)}>Un-bundle</button>
                    <button type="button" className="btn-secondary" onClick={() => onMarkBundleSold(listing.id)}>Mark sold</button>
                  </div>
                </div>
                {listing.kind === "mixed" && (
                  <div className="seller-mixed-breakdown">
                    {listingTeamBreakdown(listing).map(([t, n]) => `${t} (${n})`).join(", ")}
                  </div>
                )}
                {isExpanded && (
                  <div className="seller-photo-grid">
                    {listing.cards.map((c) => {
                      const pair = getDisplay(c);
                      const shown = pair.front || pair.back;
                      const isFound = foundIds.has(c.id);
                      return (
                        <div className={isFound ? "seller-photo-item seller-photo-item-found" : "seller-photo-item"} key={c.id}>
                          <button
                            type="button"
                            className="seller-photo-found-toggle"
                            onClick={() => onToggleFound(c.id)}
                            aria-pressed={isFound}
                            title={isFound ? "Found -- click to unmark" : "Mark as found"}
                          >
                            <div className="seller-photo-wrap">
                              <CardImage src={shown} alt={c.player} fallbackLabel="No photo yet" />
                              {isFound && <span className="seller-found-badge">✓</span>}
                            </div>
                          </button>
                          <button
                            type="button"
                            className="seller-photo-cantfind-toggle"
                            onClick={() => onToggleCantFind(c.id)}
                            title="Can't find this one -- swap it out for a different card"
                          >
                            Can't find it
                          </button>
                          <div className="seller-photo-caption" onClick={() => onOpenDetail(c)}>
                            <span className="seller-bundle-player">{c.player}</span>
                            <span className="tile-sub">
                              {[c.year, c.brand, c.set].filter(Boolean).join(" · ")}
                              {listing.kind === "mixed" ? ` · ${c.team || "Unlisted team"}` : ""}
                            </span>
                            <span className="value-cell">{moneyOrDash(c.value)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="seller-section">
        <h3 className="seller-section-heading">Suggested listings</h3>
        {listings.length === 0 ? (
          <p className="checklist-empty">Not enough sellable cards yet for a full pack of {safeBundleSize}.</p>
        ) : (
          listings.map((listing, idx) => {
            const key = `suggested-${listing.kind}-${listing.team || "mixed"}-${idx}`;
            const suggested = listing.total * (1 - safeDiscount / 100);
            const isExpanded = expandedListingKeys.has(key);
            // Round 38: how many of THIS listing's cards Kaleb has already found/pulled -- shown
            // next to the title so progress is visible even while the listing is collapsed.
            const foundCount = listing.cards.reduce((n, c) => n + (foundIds.has(c.id) ? 1 : 0), 0);
            return (
              <div className="seller-bundle-card" key={key}>
                <button
                  type="button"
                  className="seller-listing-title seller-listing-toggle"
                  onClick={() => toggleListingExpanded(key)}
                  aria-expanded={isExpanded}
                >
                  <span className={isExpanded ? "seller-expand-caret seller-expand-caret-open" : "seller-expand-caret"}>▸</span>
                  <span>{suggestedListingTitle(listing)}</span>
                  {foundCount > 0 && (
                    <span className={foundCount === listing.cards.length ? "seller-found-progress seller-found-progress-complete" : "seller-found-progress"}>
                      {foundCount === listing.cards.length ? "All found" : `${foundCount}/${listing.cards.length} found`}
                    </span>
                  )}
                </button>
                <div className="seller-bundle-header">
                  <div className="seller-price-block">
                    <div className="seller-bundle-value">{money(suggested)}</div>
                    <div className="tile-sub">book {money(listing.total)}</div>
                  </div>
                  <div className="seller-bundle-actions">
                    <button type="button" className="link-btn" onClick={() => copyListing(listing, key)}>
                      {copiedKey === key ? "Copied!" : "Copy listing"}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => onCreateBundle(listing)}>Mark as bundled</button>
                  </div>
                </div>
                {listing.kind === "mixed" && (
                  <div className="seller-mixed-breakdown">
                    {listingTeamBreakdown(listing).map(([t, n]) => `${t} (${n})`).join(", ")}
                  </div>
                )}
                {/* Round 36: collapsed by default -- expanding shows a photo of each card (not
                    just its name) so Kaleb can actually recognize the physical card while he's
                    pulling a pack together, rather than having to match text against his boxes. */}
                {isExpanded && (
                  <div className="seller-photo-grid">
                    {listing.cards.map((c) => {
                      const pair = getDisplay(c);
                      const shown = pair.front || pair.back;
                      const isFound = foundIds.has(c.id);
                      return (
                        <div className={isFound ? "seller-photo-item seller-photo-item-found" : "seller-photo-item"} key={c.id}>
                          {/* Round 38: a dedicated "found it" toggle, separate from clicking the photo
                              itself (which still opens the full detail popup, unchanged) -- clicking
                              anywhere on the thumbnail marks/unmarks it as physically pulled for this
                              pack, so Kaleb can track progress while going through his boxes. */}
                          <button
                            type="button"
                            className="seller-photo-found-toggle"
                            onClick={() => onToggleFound(c.id)}
                            aria-pressed={isFound}
                            title={isFound ? "Found -- click to unmark" : "Mark as found"}
                          >
                            <div className="seller-photo-wrap">
                              <CardImage src={shown} alt={c.player} fallbackLabel="No photo yet" />
                              {isFound && <span className="seller-found-badge">✓</span>}
                            </div>
                          </button>
                          {/* Round 39: gives up looking for this specific card -- it's pulled out of
                              this (still-just-suggested) listing immediately, and buildSellerListings
                              fills the gap with a different eligible card on the very next render, so
                              the pack stays at its target size instead of just coming up one short. */}
                          <button
                            type="button"
                            className="seller-photo-cantfind-toggle"
                            onClick={() => onToggleCantFind(c.id)}
                            title="Can't find this one -- swap it out for a different card"
                          >
                            Can't find it
                          </button>
                          <div className="seller-photo-caption" onClick={() => onOpenDetail(c)}>
                            <span className="seller-bundle-player">{c.player}</span>
                            <span className="tile-sub">
                              {[c.year, c.brand, c.set].filter(Boolean).join(" · ")}
                              {listing.kind === "mixed" ? ` · ${c.team || "Unlisted team"}` : ""}
                            </span>
                            <span className="value-cell">{moneyOrDash(c.value)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {cantFindCards.length > 0 && (
        <div className="seller-section seller-missing-section">
          <h3 className="seller-section-heading">Can't find ({cantFindCards.length})</h3>
          <p className="seller-note">Flagged as missing while pulling a pack together -- excluded from every suggested listing until you clear it here.</p>
          <ul className="seller-bundle-list">
            {cantFindCards.map((c) => (
              <li key={c.id} onClick={() => onOpenDetail(c)}>
                <span className="seller-bundle-player">{c.player}</span>
                <span className="tile-sub">{[c.year, c.brand, c.set].filter(Boolean).join(" · ")} · {c.team || "Unlisted team"}</span>
                <span className="value-cell">{moneyOrDash(c.value)}</span>
                <button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); onToggleCantFind(c.id); }}>Found it after all</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {finalLeftover.length > 0 && (
        <div className="seller-leftover">
          <h4>{finalLeftover.length} card{finalLeftover.length === 1 ? "" : "s"} not yet enough for another pack</h4>
          <ul className="seller-bundle-list">
            {finalLeftover.map((c) => (
              <li key={c.id} onClick={() => onOpenDetail(c)}>
                <span className="seller-bundle-player">{c.player}</span>
                <span className="tile-sub">{[c.year, c.brand, c.set].filter(Boolean).join(" · ")} · {c.team || "Unlisted team"}</span>
                <span className="value-cell">{moneyOrDash(c.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(soldBundleListings.length > 0 || individualSoldCards.length > 0) && (
        <div className="seller-sold-section">
          <h3>Sold ({soldBundleCardCount + individualSoldCards.length}) — {money(soldBundleTotal + individualSoldTotal)}</h3>
          {soldBundleListings.map((listing) => (
            <div className="seller-sold-bundle" key={`soldbundle-${listing.id}`}>
              <div className="seller-sold-bundle-header">
                <strong>{suggestedListingTitle(listing)}</strong>
                <span className="value-cell">{money(listing.total)}</span>
                <button type="button" className="link-btn" onClick={() => onReturnBundleToGallery(listing.id)}>Return to gallery</button>
              </div>
              <ul className="seller-bundle-list">
                {listing.cards.map((c) => (
                  <li key={c.id} onClick={() => onOpenDetail(c)}>
                    <span className="seller-bundle-player">{c.player}</span>
                    <span className="tile-sub">{[c.year, c.brand, c.set].filter(Boolean).join(" · ")} · {c.team || "Unlisted team"}</span>
                    <span className="value-cell">{moneyOrDash(c.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {individualSoldCards.length > 0 && (
            <ul className="seller-bundle-list">
              {individualSoldCards.map((c) => (
                <li key={c.id} onClick={() => onOpenDetail(c)}>
                  <span className="seller-bundle-player">{c.player}</span>
                  <span className="tile-sub">{[c.year, c.brand, c.set].filter(Boolean).join(" · ")} · {c.team || "Unlisted team"}</span>
                  <span className="value-cell">{moneyOrDash(c.value)}</span>
                  <button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); onToggleSold(c.id); }}>Return to gallery</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function CardLedger() {
  const [cards, setCards] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const [showScan, setShowScan] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [detailCard, setDetailCard] = useState(null);
  const [detailFlipped, setDetailFlipped] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankForm);

  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState(null);
  const [salesData, setSalesData] = useState(null);

  const [identifying, setIdentifying] = useState(false);
  const [identifyError, setIdentifyError] = useState(null);
  const [identifyRawPreviews, setIdentifyRawPreviews] = useState([]);
  const [identifyFrontPreview, setIdentifyFrontPreview] = useState(null);
  const [identifyBackPreview, setIdentifyBackPreview] = useState(null);
  const [identifyConfidence, setIdentifyConfidence] = useState(null);
  const [identifySearched, setIdentifySearched] = useState(false);
  const [phoneOriginNote, setPhoneOriginNote] = useState(null); // { frontIsPhone, backIsPhone } | null

  const [query, setQuery] = useState("");
  const [sportFilter, setSportFilter] = useState("All");
  const [brandFilter, setBrandFilter] = useState("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [sortBy, setSortBy] = useState("dateAdded");
  const [viewMode, setViewMode] = useState("gallery");
  // Round 33: split the old single "Gallery" tab into two -- "home" (new default landing tab,
  // Dallas Stars/North Stars cards only) and "collection" (unchanged key/behavior, now labeled
  // "Gallery" in the tab bar, showing every card regardless of team). Both reuse the exact same
  // search/sort/filter/gallery-list/fix-rotation UI block below, just scoped to a different pool
  // of cards -- see homeCards/the `activeTab === "home" ? homeCards : cards` branches in
  // `filtered`/`usedTeams`/`usedBrands`.
  const [activeTab, setActiveTab] = useState("home"); // home | collection | review | checklist | yg | autoimport | appraise | sellers
  const [flipped, setFlipped] = useState({});
  // "Fix rotation" mode: shows both of a card's own photos on its gallery tile with a rotate
  // button on each, so a batch of bulk-scanned cards that came in sideways/upside-down can be
  // straightened out a click at a time without opening the full detail/edit view for each one.
  const [galleryEditMode, setGalleryEditMode] = useState(false);
  // Which gallery tiles' actual photo turned out to be landscape (wider than tall) once loaded --
  // detected client-side from the real image, since the app doesn't store photo dimensions. A
  // landscape card gets a shorter image box (see .tile-img-wrap-landscape) instead of the default
  // portrait-card box, which otherwise leaves a large empty gap above/below the photo.
  const [landscapeCardIds, setLandscapeCardIds] = useState(() => new Set());
  function markTileOrientation(id, isLandscape) {
    setLandscapeCardIds((prev) => {
      if (isLandscape === prev.has(id)) return prev;
      const next = new Set(prev);
      if (isLandscape) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  const [rotatingImage, setRotatingImage] = useState(null); // `${cardId}-${face}` while a rotate is in flight

  const [checklistManual, setChecklistManual] = useState({});
  const [sellerBundles, setSellerBundles] = useState([]);
  const [sellerFoundIds, setSellerFoundIds] = useState(() => new Set());
  const [sellerCantFindIds, setSellerCantFindIds] = useState(() => new Set());
  const [checklistQuery, setChecklistQuery] = useState("");
  const [checklistHideCollected, setChecklistHideCollected] = useState(false);
  const [expandedYears, setExpandedYears] = useState({});
  const [ygQuery, setYgQuery] = useState("");
  const [ygHideCollected, setYgHideCollected] = useState(false);
  const [expandedYgYears, setExpandedYgYears] = useState({});
  const [expandedAlumniYgYears, setExpandedAlumniYgYears] = useState({});
  const [justMatched, setJustMatched] = useState(null);
  const [checklistInfoEntry, setChecklistInfoEntry] = useState(null); // {year, setName, team, number, player, manual} | null, for a not-yet-owned checklist row

  // Re-reads the card list from storage without touching loaded/error state -- used by the Auto
  // Import tab (whose new cards are saved directly by the SERVER, not through this component's
  // own persist() below) so the Gallery reflects auto-added cards without needing a full reload.
  async function reloadCardsFromStorage() {
    try {
      const result = await window.storage.get(STORAGE_KEY, false);
      if (result && result.value) setCards(JSON.parse(result.value));
    } catch (e) {
      // best-effort refresh -- a failed poll just means the next one will pick up the change
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(STORAGE_KEY, false);
        if (result && result.value) setCards(JSON.parse(result.value));
      } catch (e) {
        setLoadError(true);
      }
      try {
        const manualResult = await window.storage.get(CHECKLIST_MANUAL_KEY, false);
        if (manualResult && manualResult.value) setChecklistManual(JSON.parse(manualResult.value));
      } catch (e) {
        // manual checklist overrides are a nice-to-have; fail silently
      }
      try {
        const bundlesResult = await window.storage.get(SELLER_BUNDLES_KEY, false);
        if (bundlesResult && bundlesResult.value) setSellerBundles(JSON.parse(bundlesResult.value));
      } catch (e) {
        // seller bundles are a nice-to-have; fail silently
      }
      try {
        const foundResult = await window.storage.get(SELLER_FOUND_KEY, false);
        if (foundResult && foundResult.value) setSellerFoundIds(new Set(JSON.parse(foundResult.value)));
      } catch (e) {
        // "found" progress is a nice-to-have; fail silently
      }
      try {
        const cantFindResult = await window.storage.get(SELLER_CANT_FIND_KEY, false);
        if (cantFindResult && cantFindResult.value) setSellerCantFindIds(new Set(JSON.parse(cantFindResult.value)));
      } catch (e) {
        // "can't find" flags are a nice-to-have; fail silently
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // The actual network save, split out from persist() below so the gallery rotate-fix flow can
  // debounce just this part -- the collection round-trips as one JSON blob (every card, every
  // embedded photo) on every save, so firing it on every single click is what was making rapid
  // rotate-clicking feel like it hung on each one. Ordinary saves elsewhere still go through
  // persist(), unchanged.
  async function saveCollectionToServer(next) {
    try {
      const res = await window.storage.set(STORAGE_KEY, JSON.stringify(next), false);
      setSaveError(!res);
    } catch (e) {
      setSaveError(true);
    }
  }

  async function persist(next) {
    setCards(next);
    await saveCollectionToServer(next);
  }

  // Rotate-fix debounce: rapid clicks update the on-screen cards instantly (a pure local state
  // update, no network wait), while the actual full-collection save is delayed until clicking
  // has paused for a beat -- so ten quick rotates cost one save, not ten. `pendingRotateSaveRef`
  // always holds the latest not-yet-sent `cards` array so nothing gets dropped if the user closes
  // the tab or leaves edit mode mid-debounce (see flushPendingRotateSave / the edit-mode toggle).
  const rotateSaveTimeoutRef = useRef(null);
  const pendingRotateSaveRef = useRef(null);
  function scheduleRotateSave(next) {
    pendingRotateSaveRef.current = next;
    if (rotateSaveTimeoutRef.current) clearTimeout(rotateSaveTimeoutRef.current);
    rotateSaveTimeoutRef.current = setTimeout(() => {
      rotateSaveTimeoutRef.current = null;
      const toSave = pendingRotateSaveRef.current;
      pendingRotateSaveRef.current = null;
      if (toSave) saveCollectionToServer(toSave);
    }, 700);
  }
  function flushPendingRotateSave() {
    if (rotateSaveTimeoutRef.current) {
      clearTimeout(rotateSaveTimeoutRef.current);
      rotateSaveTimeoutRef.current = null;
    }
    const toSave = pendingRotateSaveRef.current;
    pendingRotateSaveRef.current = null;
    if (toSave) saveCollectionToServer(toSave);
  }

  // Rotates one already-saved card's own front or back photo directly from the gallery's "Fix
  // rotation" mode -- same "rotate whichever local field is actually populated" logic as
  // nudgeRotate (which operates on the scan/edit form's `form` state instead), applied straight
  // to the saved `cards` array and persisted immediately, so there's no separate save step. Only
  // ever called on a card's own personal/purchase photo, never an online reference image (a
  // remote URL can't be rotated via canvas -- CORS -- and the gallery only offers this button
  // next to a local thumbnail to begin with).
  async function rotateGalleryImage(cardId, face) {
    const key = `${cardId}-${face}`;
    setRotatingImage(key);
    try {
      const card = cards.find((c) => c.id === cardId);
      if (!card) return;
      const scanKey = face === "front" ? "personalFront" : "personalBack";
      const purchaseKey = face === "front" ? "purchasePhotoFront" : "purchasePhotoBack";
      const current = card[scanKey] || card[purchaseKey];
      if (!current) return;
      const rotated = await rotateDataUrl(current, 90);
      // Functional update (not a plain `cards.map` off the outer closure) so rotating a second
      // card before the first one's state has re-rendered still lands on top of that first
      // rotation instead of silently reverting it -- the whole point of making this fast is
      // clicking through many cards back to back, so this has to hold up under that.
      setCards((prevCards) => {
        const next = prevCards.map((c) =>
          c.id === cardId
            ? { ...c, [scanKey]: c[scanKey] ? rotated : c[scanKey], [purchaseKey]: c[purchaseKey] ? rotated : c[purchaseKey] }
            : c
        );
        scheduleRotateSave(next);
        return next;
      });
    } finally {
      setRotatingImage((prev) => (prev === key ? null : prev));
    }
  }

  async function persistChecklistManual(next) {
    setChecklistManual(next);
    try {
      await window.storage.set(CHECKLIST_MANUAL_KEY, JSON.stringify(next), false);
    } catch (e) {
      // best-effort; the gallery/list save error banner already covers the main storage path
    }
  }

  function toggleManualOwned(key) {
    const next = { ...checklistManual };
    if (next[key]) delete next[key];
    else next[key] = true;
    persistChecklistManual(next);
  }

  async function persistSellerBundles(next) {
    setSellerBundles(next);
    try {
      await window.storage.set(SELLER_BUNDLES_KEY, JSON.stringify(next), false);
    } catch (e) {
      // best-effort; the gallery/list save error banner already covers the main storage path
    }
  }

  async function persistSellerFoundIds(nextSet) {
    setSellerFoundIds(nextSet);
    try {
      await window.storage.set(SELLER_FOUND_KEY, JSON.stringify(Array.from(nextSet)), false);
    } catch (e) {
      // best-effort; the gallery/list save error banner already covers the main storage path
    }
  }

  // Round 38: toggles whether Kaleb has physically found/pulled one card for a Suggested listing
  // he's in the middle of assembling. Purely a tracking aid -- doesn't affect which pack a card
  // belongs to or whether it's eligible to be bundled/sold.
  function toggleSellerFound(cardId) {
    const next = new Set(sellerFoundIds);
    if (next.has(cardId)) next.delete(cardId);
    else next.add(cardId);
    persistSellerFoundIds(next);
  }

  async function persistSellerCantFindIds(nextSet) {
    setSellerCantFindIds(nextSet);
    try {
      await window.storage.set(SELLER_CANT_FIND_KEY, JSON.stringify(Array.from(nextSet)), false);
    } catch (e) {
      // best-effort; the gallery/list save error banner already covers the main storage path
    }
  }

  // Round 39: "Can't find it" -- toggles the flag, and if the card was already locked into a
  // bundle, immediately swaps in a different eligible card (closest in value, same team when the
  // bundle is a single-team pack) so that bundle stays at its original size instead of quietly
  // shrinking by one. A not-yet-bundled ("suggested") card needs no swap here at all -- excluding
  // it from `available` (see SellerPanel) is enough for buildSellerListings to naturally pull a
  // different card into its old slot on the very next render. If no replacement candidate exists,
  // the card is simply dropped from the bundle -- better a smaller pack than a silently wrong one.
  function toggleSellerCantFind(cardId) {
    const alreadyFlagged = sellerCantFindIds.has(cardId);
    const next = new Set(sellerCantFindIds);
    if (alreadyFlagged) {
      next.delete(cardId);
      persistSellerCantFindIds(next);
      return;
    }
    next.add(cardId);
    persistSellerCantFindIds(next);

    // No longer meaningful to also show this card as "found" once it's flagged missing.
    if (sellerFoundIds.has(cardId)) {
      const nextFound = new Set(sellerFoundIds);
      nextFound.delete(cardId);
      persistSellerFoundIds(nextFound);
    }

    const bundle = sellerBundles.find((b) => !b.sold && b.cardIds.includes(cardId));
    if (!bundle) return; // just a suggested-listing card -- the algorithm reflows on its own.

    const alreadyBundledIds = new Set(sellerBundles.flatMap((b) => b.cardIds));
    const candidates = cards.filter(
      (c) =>
        c.id !== cardId &&
        !c.sold &&
        !c.needsReview &&
        !alreadyBundledIds.has(c.id) &&
        !next.has(c.id) &&
        !isStarsCollectionCard(c) &&
        !isProSetCard(c)
    );
    let replacement = null;
    if (candidates.length > 0) {
      const sameTeamOnly = bundle.kind === "team" ? candidates.filter((c) => (c.team || "Unlisted team") === bundle.team) : candidates;
      const pool = sameTeamOnly.length > 0 ? sameTeamOnly : candidates;
      const missingCard = cards.find((c) => c.id === cardId);
      const missingValue = Number(missingCard && missingCard.value) || 0;
      const best = pool.reduce((acc, c) => {
        const diff = Math.abs((Number(c.value) || 0) - missingValue);
        return !acc || diff < acc.diff ? { card: c, diff } : acc;
      }, null);
      replacement = best ? best.card : null;
    }

    const nextBundles = sellerBundles.map((b) => {
      if (b.id !== bundle.id) return b;
      const ids = b.cardIds.filter((id) => id !== cardId);
      if (replacement) ids.push(replacement.id);
      return { ...b, cardIds: ids };
    });
    persistSellerBundles(nextBundles);
  }

  // "Mark as bundled" on a suggested (still-ephemeral) Sellers listing: locks in exactly that set
  // of card ids as a real, persisted group. From this point on those cards are excluded from
  // every future auto-generated suggestion (see bundledCardIds/sellerEligibleCards below) even as
  // Kaleb keeps scanning in new cards -- the whole point being that a bundle he's already
  // physically taped/bagged together doesn't get quietly reshuffled by the next refresh.
  function createSellerBundle(listing) {
    const bundle = {
      id: (Date.now() + Math.random()).toString(36),
      kind: listing.kind,
      team: listing.kind === "team" ? listing.team : null,
      cardIds: listing.cards.map((c) => c.id),
      createdAt: Date.now(),
      sold: false,
    };
    persistSellerBundles([...sellerBundles, bundle]);
    // Round 38: once a listing is actually locked in as a bundle, its cards are done being
    // "hunted for" -- clear their found-flags so they don't carry stale checkmarks into whatever
    // gets suggested next, and so the found-tracking storage doesn't grow forever.
    if (sellerFoundIds.size > 0) {
      const bundledSet = new Set(bundle.cardIds);
      const hasAny = bundle.cardIds.some((id) => sellerFoundIds.has(id));
      if (hasAny) {
        const next = new Set(sellerFoundIds);
        bundledSet.forEach((id) => next.delete(id));
        persistSellerFoundIds(next);
      }
    }
  }

  // Undoes a not-yet-sold bundle -- Kaleb changed his mind before actually taping it together, or
  // wants to reshuffle it differently. Just forgets the grouping; the cards themselves are
  // untouched and fall right back into the normal available-for-suggestion pool.
  function dissolveSellerBundle(id) {
    persistSellerBundles(sellerBundles.filter((b) => b.id !== id));
  }

  // A bundle that's actually sold: flip the bundle record itself AND every card in it (reusing
  // markCardsSold so Gallery/List/the top stat strip all behave exactly like an individually
  // sold card already does).
  function markSellerBundleSold(id) {
    const bundle = sellerBundles.find((b) => b.id === id);
    if (!bundle) return;
    persistSellerBundles(sellerBundles.map((b) => (b.id === id ? { ...b, sold: true } : b)));
    markCardsSold(bundle.cardIds);
  }

  // Full undo of a sold bundle: dissolves the grouping entirely and un-sells every card in it, so
  // everything lands back in the normal available pool exactly as if it had never been bundled --
  // mirrors what "Return to gallery" already does for a single sold card.
  function returnSellerBundleToGallery(id) {
    const bundle = sellerBundles.find((b) => b.id === id);
    if (!bundle) return;
    persistSellerBundles(sellerBundles.filter((b) => b.id !== id));
    const idSet = new Set(bundle.cardIds);
    persist(cards.map((c) => (idSet.has(c.id) ? { ...c, sold: false } : c)));
  }

  function toggleYearExpanded(year) {
    setExpandedYears((prev) => ({ ...prev, [year]: !prev[year] }));
  }

  function toggleYgYearExpanded(year) {
    setExpandedYgYears((prev) => ({ ...prev, [year]: !prev[year] }));
  }

  function toggleAlumniYgYearExpanded(year) {
    setExpandedAlumniYgYears((prev) => ({ ...prev, [year]: !prev[year] }));
  }

  const checklistMatches = useMemo(() => buildChecklistMatches(cards), [cards]);

  const checklistProgress = useMemo(() => {
    let totalCards = 0;
    let totalOwned = 0;
    const perSet = CHECKLIST_SETS.map((set) => {
      let owned = 0;
      set.cards.forEach((entry) => {
        const key = checklistEntryKey(set.year, entry.n);
        if (checklistMatches.has(key) || checklistManual[key]) owned++;
      });
      totalCards += set.cards.length;
      totalOwned += owned;
      return { ...set, ownedCount: owned };
    });
    return { perSet, totalCards, totalOwned };
  }, [checklistMatches, checklistManual]);

  // Shared HTML/print helper behind every "Export PDF" button in the app. Renders a clean,
  // print-friendly page (via the browser's own print dialog -- no PDF library needed) then opens
  // it in a new tab and triggers Print immediately, so "Save as PDF" is one click away in the
  // destination picker. Every export is a missing-cards-only "shopping list" -- blank checkboxes
  // throughout (there's nothing to un-check on paper at a card show), and a season/subsection
  // with nothing missing is dropped entirely rather than printed empty. `sections` lets a single
  // PDF cover more than one checklist (Young Guns' own list plus its separate alumni list) while
  // keeping one shared header/summary line for the whole export.
  function exportMissingChecklistPdf({ docTitle, heading, missingCount, sections, showSeries }) {
    const escapeHtml = (s) =>
      String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    const sectionsHtml = sections
      .map((section) => {
        const seasonsHtml = section.perSet
          .map((set) => {
            const missing = set.cards.filter((entry) => !section.isOwned(set.year, entry.n));
            if (missing.length === 0) return "";
            const rows = missing
              .map((entry) => {
                const num = entry.n !== null && entry.n !== undefined && entry.n !== "" ? `#${escapeHtml(entry.n)}` : "";
                const series = showSeries ? getCardSeries(set.year, entry.n) : null;
                const seriesHtml = series ? `<span class="series">${escapeHtml(set.year)} ${escapeHtml(series)}</span>` : "";
                return `<div class="card-row missing"><span class="mark">☐</span><span class="num">${num}</span><span class="name">${escapeHtml(entry.p)}</span>${seriesHtml}</div>`;
              })
              .join("");
            return `<section class="season"><h2><span>${escapeHtml(set.year)} ${escapeHtml(set.setName)} <span class="team">— ${escapeHtml(set.team)}</span></span><span class="season-count">${missing.length} missing</span></h2><div class="card-grid${showSeries ? " with-series" : ""}">${rows}</div></section>`;
          })
          .join("");
        if (!seasonsHtml) return "";
        return (section.heading ? `<h2 class="section-heading">${escapeHtml(section.heading)}</h2>` : "") + seasonsHtml;
      })
      .join("");

    const generatedOn = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(docTitle)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; margin: 0; padding: 28px; }
  h1 { font-size: 19px; margin: 0 0 4px; }
  .subtitle { font-size: 12px; color: #555; margin: 0 0 14px; }
  .summary { font-size: 14px; font-weight: bold; margin: 0 0 22px; padding: 8px 12px; background: #f2efe6; border: 1px solid #cfc9b8; display: inline-block; }
  .section-heading { font-size: 15px; margin: 22px 0 10px; padding-top: 10px; border-top: 2px solid #1a1a1a; }
  .season { break-inside: avoid; page-break-inside: avoid; margin-bottom: 16px; }
  .season h2 { font-size: 13.5px; border-bottom: 1px solid #999; padding-bottom: 3px; margin: 0 0 6px; display: flex; justify-content: space-between; align-items: baseline; font-weight: 600; }
  .season h2 .team { font-weight: normal; color: #555; font-size: 12px; }
  .season h2 .season-count { font-weight: normal; font-size: 12px; color: #555; white-space: nowrap; margin-left: 10px; }
  .card-grid { column-count: 3; column-gap: 18px; font-size: 11px; }
  .card-grid.with-series { column-count: 2; }
  .card-row { break-inside: avoid; display: flex; gap: 5px; padding: 1.5px 0; }
  .card-row .num { flex-shrink: 0; color: #555; width: 32px; }
  .card-row .name { flex: 1; }
  .card-row .series { flex-shrink: 0; color: #777; font-size: 9.5px; white-space: nowrap; padding-left: 6px; }
  @media print {
    @page { margin: 0.5in; size: letter; }
  }
</style>
</head>
<body>
  <h1>${escapeHtml(heading)}</h1>
  <p class="subtitle">Exported from Bench on ${generatedOn} -- take this to a card show and check off what you pick up</p>
  <div class="summary">${missingCount} card${missingCount === 1 ? "" : "s"} still needed</div>
  ${sectionsHtml}
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) {
      window.alert("Your browser blocked the export tab from opening -- allow pop-ups for this page and try again.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  function isStarsCardOwned(year, n) {
    const key = checklistEntryKey(year, n);
    return checklistMatches.has(key) || !!checklistManual[key];
  }

  function isAlumniYgCardOwned(year, n) {
    const key = checklistEntryKey(year, n);
    return alumniChecklistMatches.has(key) || !!checklistManual[key];
  }

  function exportStarsChecklistPdf() {
    exportMissingChecklistPdf({
      docTitle: "Dallas Stars Checklist",
      heading: "Dallas Stars / Minnesota North Stars — Upper Deck Base Checklist (Missing Cards)",
      missingCount: checklistProgress.totalCards - checklistProgress.totalOwned,
      sections: [{ perSet: checklistProgress.perSet, isOwned: isStarsCardOwned }],
    });
  }

  function exportYoungGunsChecklistPdf() {
    const missingCount =
      youngGunsProgress.totalCards - youngGunsProgress.totalOwned + (alumniYgProgress.totalCards - alumniYgProgress.totalOwned);
    exportMissingChecklistPdf({
      docTitle: "Dallas Stars Young Guns Checklist",
      heading: "Dallas Stars / Minnesota North Stars — Young Guns Checklist (Missing Cards)",
      missingCount,
      sections: [
        { perSet: youngGunsProgress.perSet, isOwned: isStarsCardOwned },
        { heading: "Stars alumni — Young Guns from other teams", perSet: alumniYgProgress.perSet, isOwned: isAlumniYgCardOwned },
      ],
      showSeries: true,
    });
  }

  // Young Guns is just the base checklist filtered down to cards flagged yg:true --
  // Upper Deck's marquee rookie-card subset, numbered at the tail of each series.
  const youngGunsProgress = useMemo(() => {
    let totalCards = 0;
    let totalOwned = 0;
    const perSet = CHECKLIST_SETS.map((set) => {
      const ygCards = set.cards.filter((entry) => entry.yg);
      let owned = 0;
      ygCards.forEach((entry) => {
        const key = checklistEntryKey(set.year, entry.n);
        if (checklistMatches.has(key) || checklistManual[key]) owned++;
      });
      totalCards += ygCards.length;
      totalOwned += owned;
      return { ...set, cards: ygCards, ownedCount: owned };
    }).filter((set) => set.cards.length > 0);
    return { perSet, totalCards, totalOwned };
  }, [checklistMatches, checklistManual]);

  // Stars-alumni Young Guns: rookie cards printed under some OTHER team, for players who at
  // some point also played for the Stars (see STARS_ALUMNI_YOUNG_GUNS above). Matched with the
  // same buildChecklistMatches() logic, just against that separate list of "sets" instead of
  // CHECKLIST_SETS, and sharing the same manual-checkbox storage (card numbers never collide
  // between the two lists since each number belongs to exactly one physical card per season).
  const alumniChecklistMatches = useMemo(() => buildChecklistMatches(cards, STARS_ALUMNI_YG_SETS), [cards]);

  const alumniYgProgress = useMemo(() => {
    let totalCards = 0;
    let totalOwned = 0;
    const perSet = STARS_ALUMNI_YG_SETS.map((set) => {
      let owned = 0;
      set.cards.forEach((entry) => {
        const key = checklistEntryKey(set.year, entry.n);
        if (alumniChecklistMatches.has(key) || checklistManual[key]) owned++;
      });
      totalCards += set.cards.length;
      totalOwned += owned;
      return { ...set, ownedCount: owned };
    });
    return { perSet, totalCards, totalOwned };
  }, [alumniChecklistMatches, checklistManual]);

  // Round 25: which owned cards actually belong to Kaleb's Dallas Stars collection, for gallery
  // coloring -- NOT the same question as "what team is printed on this card." A Tyler Seguin
  // rookie card says "Boston Bruins" on the front, but it's tracked here specifically because
  // Seguin later played for Dallas (see STARS_ALUMNI_YOUNG_GUNS) -- Kaleb wants that card colored
  // as a Stars card regardless of which team it originally shipped under. Reuses the exact same
  // matching this app already does for the Stars Checklist/Young Guns tabs (checklistMatches +
  // alumniChecklistMatches) rather than re-deriving anything -- a card counts as Stars-related if
  // it's matched into either the main Stars/North Stars checklist or the alumni-Young-Guns list.
  const starsRelatedCardIds = useMemo(() => {
    const ids = new Set();
    for (const arr of checklistMatches.values()) arr.forEach((c) => ids.add(c.id));
    for (const arr of alumniChecklistMatches.values()) arr.forEach((c) => ids.add(c.id));
    return ids;
  }, [checklistMatches, alumniChecklistMatches]);

  // True if a card should be colored/treated as part of the Dallas Stars collection: its own
  // team field literally says Dallas Stars or Minnesota North Stars (same franchise, pre/post the
  // 1993 relocation), or it's matched into the checklist/alumni data above regardless of what
  // team is actually printed on it.
  function isStarsCollectionCard(c) {
    return c.team === "Dallas Stars" || c.team === "Minnesota North Stars" || starsRelatedCardIds.has(c.id);
  }

  // Round 38: Kaleb physically keeps his Pro Set cards in a separate pile from everything he
  // actually bundles for sale, so they need to never appear in the Sellers tab at all -- not
  // grouped into a suggested pack, not counted in a total, nothing. Matched on the `brand` field,
  // normalized (lowercased, punctuation/spaces stripped) so "Pro Set", "Pro-Set", "PROSET", etc.
  // all match regardless of exactly how that brand got typed/identified for a given card.
  function isProSetCard(c) {
    return String(c.brand || "").toLowerCase().replace(/[^a-z0-9]/g, "") === "proset";
  }

  // Round 30: the Sellers tab is only ever for cards Kaleb actually intends to sell -- anything
  // that's part of his own Dallas Stars/North Stars checklist or the Young Guns checklist
  // (isStarsCollectionCard, same predicate the gallery theming already uses) is excluded
  // entirely, never counted toward a suggested pack and never up for "mark sold." Round 38 adds
  // Pro Set cards to that same exclusion, for the physical-pile reason above.
  const sellerEligibleCards = useMemo(
    () => cards.filter((c) => !isStarsCollectionCard(c) && !isProSetCard(c)),
    [cards, starsRelatedCardIds]
  );

  // Round 33: the "Home" tab's card pool -- the exact same predicate as isStarsCollectionCard
  // above (and Sellers' exclusion, just inverted), so "Stars collection" means the same thing
  // everywhere in the app: printed Dallas Stars/Minnesota North Stars, or a tracked Stars-alumnus
  // Young Guns card regardless of what team is actually printed on it.
  const homeCards = useMemo(
    () => cards.filter((c) => isStarsCollectionCard(c)),
    [cards, starsRelatedCardIds]
  );

  // Round 31: every card id that's part of ANY persisted seller bundle (bundled-not-sold or
  // already sold) -- used to keep a locked-in bundle's cards out of every future auto-generated
  // suggestion, and to hide the single-card "Mark sold" toggle in the detail modal for a card
  // that's already accounted for at the bundle level.
  const bundledCardIds = useMemo(() => {
    const ids = new Set();
    sellerBundles.forEach((b) => b.cardIds.forEach((id) => ids.add(id)));
    return ids;
  }, [sellerBundles]);

  // Round 25: group the currently-filtered/sorted gallery list by "same physical card" (player +
  // year + brand + set + card number) so Kaleb's duplicate copies show as one tile with an "x2"/
  // "x3" badge instead of cluttering the grid with repeats. Deliberately only used for the plain
  // gallery view, not "Fix rotation" mode (each physical copy's own photo still needs its own
  // rotate control there) and not the List/table view (each row stays its own line -- he only
  // asked for this in the gallery). Groups can't just collapse adjacent entries since sort order
  // (e.g. "Recently added") can interleave duplicates with unrelated cards -- this does a real
  // group-by keyed on first-seen order instead.
  function duplicateGroupKey(c) {
    return [normName(c.player), (c.year || "").trim().toLowerCase(), (c.brand || "").trim().toLowerCase(), (c.set || "").trim().toLowerCase(), normNum(c.cardNumber)].join("|");
  }

  function resetIdentifyState() {
    setIdentifyRawPreviews([]);
    setIdentifyFrontPreview(null);
    setIdentifyBackPreview(null);
    setIdentifyError(null);
    setIdentifyConfidence(null);
    setIdentifySearched(false);
    setIdentifying(false);
    setPhoneOriginNote(null);
  }

  function openDetail(card) {
    setDetailCard(card);
    setDetailFlipped(false);
    setShowDetail(true);
    setSalesError(null);
    setSalesLoading(false);
    // Recent-sales lookups cost a real, billed web search -- no longer fired automatically on
    // every open (see loadSales below). If this card's already been looked up, show that
    // cached result for free; otherwise leave it blank until the person actually asks.
    setSalesData(card.salesLookup || null);
  }

  function closeDetail() {
    setShowDetail(false);
    setDetailCard(null);
    setSalesData(null);
    setSalesError(null);
    setSalesLoading(false);
  }

  // With a collection numbering in the thousands, re-running a paid web search every single
  // time a card's detail view is opened -- even for a card looked up five minutes ago -- adds
  // up fast for no reason. So this only actually calls the API on an explicit request (first
  // lookup, or the "Refresh" button); the result is cached on the card record itself
  // (card.salesLookup) so every later view of that same card is free until refreshed.
  async function loadSales(card, force) {
    if (!force && card.salesLookup) {
      setSalesData(card.salesLookup);
      setSalesError(null);
      return;
    }
    setSalesLoading(true);
    setSalesError(null);
    try {
      const result = await fetchRecentSales(card);
      const withTimestamp = { ...result, fetchedAt: Date.now() };
      setSalesData(withTimestamp);
      const next = cards.map((c) => (c.id === card.id ? { ...c, salesLookup: withTimestamp } : c));
      persist(next);
      setDetailCard((cur) => (cur && cur.id === card.id ? { ...cur, salesLookup: withTimestamp } : cur));
    } catch (err) {
      setSalesError("Couldn't look up recent sales right now. Try again in a moment.");
    } finally {
      setSalesLoading(false);
    }
  }

  function openScan() {
    setEditingId(null);
    setForm(blankForm);
    resetIdentifyState();
    setFormError(null);
    setShowScan(true);
  }

  function closeScan() {
    setShowScan(false);
    resetIdentifyState();
  }

  function openEditForm(card) {
    setForm({
      player: card.player,
      team: card.team,
      sport: card.sport,
      year: card.year,
      brand: card.brand || "",
      set: card.set,
      cardNumber: card.cardNumber,
      value: card.value === null || card.value === undefined ? "" : String(card.value),
      onlineFrontUrl: card.onlineFrontUrl || null,
      onlineBackUrl: card.onlineBackUrl || null,
      personalFront: card.personalFront || null,
      personalBack: card.personalBack || null,
      purchasePhotoFront: card.purchasePhotoFront || null,
      purchasePhotoBack: card.purchasePhotoBack || null,
      thumbnailSource: card.thumbnailSource || "online",
    });
    setEditingId(card.id);
    resetIdentifyState();
    setFormError(null);
    setShowEdit(true);
  }

  function closeEdit() {
    setShowEdit(false);
    setEditingId(null);
    setForm(blankForm);
    resetIdentifyState();
    setFormError(null);
  }

  async function handleIdentifyFilesChange(e, { forNewCard = false } = {}) {
    const files = Array.from(e.target.files).slice(0, 2);
    if (files.length === 0) return;
    setIdentifyError(null);
    setIdentifyConfidence(null);
    setIdentifyFrontPreview(null);
    setIdentifyBackPreview(null);
    setPhoneOriginNote(null);
    try {
      // higher-res copies sent to the model for better text legibility (year, set, etc.)
      const hiResUrls = await Promise.all(files.map((f) => fileToResizedDataUrl(f, 1568, 0.92)));
      // smaller copies kept for on-screen previews and long-term storage
      const storageUrls = await Promise.all(files.map((f) => fileToResizedDataUrl(f, 480, 0.78)));
      setIdentifyRawPreviews(storageUrls);
      const sources = await Promise.all(files.map((f) => detectPhotoSource(f)));
      const ok = await runIdentify(hiResUrls, storageUrls, sources);
      if (ok && forNewCard) {
        setFormError(null);
        setShowScan(false);
        setShowEdit(true);
      }
    } catch (err) {
      setIdentifyError("Couldn't read one of those images. Try different files.");
    }
  }

  async function runIdentify(hiResUrls, storageUrls, photoSources) {
    const forIdentify = hiResUrls || identifyRawPreviews;
    const forStorage = storageUrls || hiResUrls || identifyRawPreviews;
    const sources = photoSources || forStorage.map(() => ({ isLikelyPhone: false }));
    if (forIdentify.length === 0) return false;
    setIdentifying(true);
    setIdentifyError(null);
    try {
      const result = await identifyCardFromImages(forIdentify);

      let rotated = forStorage;
      try {
        rotated = forStorage.length === 2
          ? await Promise.all([
              rotateDataUrl(forStorage[0], Number(result.rotation1) || 0),
              rotateDataUrl(forStorage[1], Number(result.rotation2) || 0),
            ])
          : [await rotateDataUrl(forStorage[0], Number(result.rotation) || 0)];
      } catch (rotateErr) {
        rotated = forStorage;
      }

      let front = rotated[0];
      let back = rotated[1] || null;
      let frontIsPhone = !!sources[0]?.isLikelyPhone;
      let backIsPhone = !!sources[1]?.isLikelyPhone;
      if (rotated.length === 2) {
        const frontIsSecond = Number(result.frontImageIndex) === 2;
        front = frontIsSecond ? rotated[1] : rotated[0];
        back = frontIsSecond ? rotated[0] : rotated[1];
        frontIsPhone = frontIsSecond ? !!sources[1]?.isLikelyPhone : !!sources[0]?.isLikelyPhone;
        backIsPhone = frontIsSecond ? !!sources[0]?.isLikelyPhone : !!sources[1]?.isLikelyPhone;
      }

      const cleanValueMatch = result.estimatedValue !== null && result.estimatedValue !== undefined
        ? String(result.estimatedValue).match(/[\d.]+/)
        : null;

      const anyPhone = frontIsPhone || backIsPhone;
      const identified = {
        player: result.player || "",
        team: result.team || "",
        sport: SPORTS.includes(result.sport) ? result.sport : "Other",
        year: result.year ? String(result.year) : "",
        brand: result.brand || "",
        set: result.set || "",
        cardNumber: result.cardNumber || "",
        value: cleanValueMatch ? cleanValueMatch[0] : "",
        onlineFrontUrl: result.frontImageUrl || null,
        onlineBackUrl: result.backImageUrl || null,
        personalFront: frontIsPhone ? null : front,
        personalBack: backIsPhone ? null : back,
        purchasePhotoFront: frontIsPhone ? front : null,
        purchasePhotoBack: backIsPhone ? back : null,
        thumbnailSource: anyPhone && result.frontImageUrl ? "online" : "personal",
      };

      setIdentifyFrontPreview(front);
      setIdentifyBackPreview(back);
      setIdentifyConfidence(result.confidence || null);
      setIdentifySearched(!!result._searched);
      setPhoneOriginNote(anyPhone ? { frontIsPhone, backIsPhone } : null);
      setForm((prev) => ({ ...prev, ...identified }));
      return true;
    } catch (err) {
      setIdentifyError("Couldn't identify that card automatically. Try a clearer, well-lit photo, or fill in the details below by hand.");
      return false;
    } finally {
      setIdentifying(false);
    }
  }

  function useMyPhotoAsScanAnyway() {
    setForm((prev) => ({
      ...prev,
      personalFront: prev.personalFront || prev.purchasePhotoFront,
      personalBack: prev.personalBack || prev.purchasePhotoBack,
      purchasePhotoFront: null,
      purchasePhotoBack: null,
      thumbnailSource: "personal",
    }));
    setPhoneOriginNote(null);
  }

  function swapIdentifiedFrontBack() {
    setIdentifyFrontPreview(identifyBackPreview);
    setIdentifyBackPreview(identifyFrontPreview);
    setForm((prev) => ({
      ...prev,
      personalFront: prev.personalBack,
      personalBack: prev.personalFront,
      purchasePhotoFront: prev.purchasePhotoBack,
      purchasePhotoBack: prev.purchasePhotoFront,
      onlineFrontUrl: prev.onlineBackUrl,
      onlineBackUrl: prev.onlineFrontUrl,
    }));
    setPhoneOriginNote((prev) => (prev ? { frontIsPhone: prev.backIsPhone, backIsPhone: prev.frontIsPhone } : prev));
  }

  async function nudgeRotate(face) {
    // The rotate button only ever appears next to a LOCAL image (a scan or a purchase
    // photo, both already data: URLs) -- never next to an online reference image, since
    // that's a remote URL and drawing it to a canvas to rotate would fail on CORS grounds.
    // identifyFrontPreview/Back hold the freshest copy during an active scan; once editing
    // an already-saved card those are empty, so fall back to whatever's on the form.
    const isFront = face === "front";
    const scanKey = isFront ? "personalFront" : "personalBack";
    const purchaseKey = isFront ? "purchasePhotoFront" : "purchasePhotoBack";
    const livePreview = isFront ? identifyFrontPreview : identifyBackPreview;
    const current = livePreview || form[scanKey] || form[purchaseKey];
    if (!current) return;
    const rotated = await rotateDataUrl(current, 90);
    if (isFront) {
      if (livePreview) setIdentifyFrontPreview(rotated);
      setForm((prev) => ({
        ...prev,
        personalFront: prev.personalFront ? rotated : prev.personalFront,
        purchasePhotoFront: prev.purchasePhotoFront ? rotated : prev.purchasePhotoFront,
      }));
    } else {
      if (livePreview) setIdentifyBackPreview(rotated);
      setForm((prev) => ({
        ...prev,
        personalBack: prev.personalBack ? rotated : prev.personalBack,
        purchasePhotoBack: prev.purchasePhotoBack ? rotated : prev.purchasePhotoBack,
      }));
    }
  }

  async function handlePersonalUpload(face, e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file, 480, 0.75);
      const source = await detectPhotoSource(file);
      const scanKey = face === "front" ? "personalFront" : "personalBack";
      const purchaseKey = face === "front" ? "purchasePhotoFront" : "purchasePhotoBack";
      setForm((prev) => ({
        ...prev,
        [scanKey]: source.isLikelyPhone ? null : dataUrl,
        [purchaseKey]: source.isLikelyPhone ? dataUrl : null,
      }));
      if (source.isLikelyPhone) {
        setPhoneOriginNote((prev) => ({
          frontIsPhone: face === "front" ? true : !!prev?.frontIsPhone,
          backIsPhone: face === "back" ? true : !!prev?.backIsPhone,
        }));
      }
    } catch (err) {
      setIdentifyError("Couldn't read that photo. Try a different file.");
    }
  }

  const [formError, setFormError] = useState(null);

  function saveCard() {
    if (!form.player.trim()) {
      setFormError("Add a player name before saving — this is the one field that can't be blank.");
      return;
    }
    try {
      setFormError(null);
      const entry = {
        id: editingId ?? (Date.now() + Math.random()).toString(36),
        dateAdded: editingId ? (cards.find((c) => c.id === editingId)?.dateAdded ?? Date.now()) : Date.now(),
        player: form.player.trim(),
        team: form.team.trim(),
        sport: form.sport,
        year: form.year.trim(),
        brand: form.brand.trim(),
        set: form.set.trim(),
        cardNumber: form.cardNumber.trim(),
        value: form.value === "" || form.value === null || form.value === undefined || isNaN(Number(form.value)) ? null : Number(form.value),
        onlineFrontUrl: form.onlineFrontUrl || null,
        onlineBackUrl: form.onlineBackUrl || null,
        personalFront: form.personalFront || null,
        personalBack: form.personalBack || null,
        purchasePhotoFront: form.purchasePhotoFront || null,
        purchasePhotoBack: form.purchasePhotoBack || null,
        thumbnailSource: form.thumbnailSource || "online",
      };
      const next = editingId ? cards.map((c) => (c.id === editingId ? entry : c)) : [...cards, entry];
      persist(next);
      const checklistHit = matchSingleCardToChecklist(entry);
      if (checklistHit) {
        setJustMatched(checklistHit);
        setTimeout(() => setJustMatched((cur) => (cur === checklistHit ? null : cur)), 6000);
      }
      closeEdit();
    } catch (err) {
      console.error("Save failed:", err);
      setFormError("Something went wrong saving this card: " + err.message);
    }
  }

  function handleDelete(id) {
    persist(cards.filter((c) => c.id !== id));
    closeEdit();
  }

  function setThumbnailSource(id, source) {
    persist(cards.map((c) => (c.id === id ? { ...c, thumbnailSource: source } : c)));
  }

  // Manual "flag for review" -- a card the AI identified fine but Kaleb himself isn't sure about
  // (wrong value, questionable identification, wants a better photo, etc). Flagging pulls it out
  // of the normal Gallery/List view (see filtered above) into the Review tab, alongside whatever
  // Auto Import itself flagged; un-flagging sends it right back.
  function toggleNeedsReview(id) {
    persist(cards.map((c) => (c.id === id ? { ...c, needsReview: !c.needsReview } : c)));
  }

  // "Sold" is scoped to cards Kaleb actually sells (see sellerEligibleCards -- never his own
  // Dallas Stars/North Stars checklist or Young Guns cards, those aren't for sale). A sold card
  // drops out of the normal Gallery/List view (see filtered above) and out of Sellers' suggested
  // packs, landing in the Sellers tab's own "Sold" section instead; toggling again undoes it.
  function toggleSold(id) {
    persist(cards.map((c) => (c.id === id ? { ...c, sold: !c.sold } : c)));
  }

  // Marks every card in a whole suggested pack sold at once, for the Sellers tab's "Mark pack
  // sold" button -- the common case, since Kaleb lists and sells a pack as a unit, not one card
  // at a time.
  function markCardsSold(ids) {
    const idSet = new Set(ids);
    persist(cards.map((c) => (idSet.has(c.id) ? { ...c, sold: true } : c)));
  }

  function toggleFlip(id) {
    setFlipped((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function getPair(card, source) {
    if (source === "personal") return { front: card.personalFront, back: card.personalBack };
    if (source === "purchase") return { front: card.purchasePhotoFront, back: card.purchasePhotoBack };
    return { front: card.onlineFrontUrl, back: card.onlineBackUrl };
  }

  function getDisplay(card) {
    const chosen = getPair(card, card.thumbnailSource || "online");
    if (chosen.front || chosen.back) return chosen;
    const fallback = getPair(card, card.thumbnailSource === "online" ? "personal" : "online");
    if (fallback.front || fallback.back) return fallback;
    // Last resort: a phone/show photo that was kept as a reference rather than the official scan.
    return getPair(card, "purchase");
  }

  // Mirrors getDisplay's own fallback chain, but returns which source won instead of the
  // image pair itself -- lets callers (e.g. the detail popup's rotate button) know whether
  // what's currently on screen is a local photo (safe to rotate) or an online reference image
  // (a remote URL we don't own and can't draw to a canvas).
  function getDisplaySource(card) {
    const primary = card.thumbnailSource || "online";
    const chosen = getPair(card, primary);
    if (chosen.front || chosen.back) return primary;
    const fallback = primary === "online" ? "personal" : "online";
    if (getPair(card, fallback).front || getPair(card, fallback).back) return fallback;
    return "purchase";
  }

  // Rotates whichever local image (personal scan or purchase photo) is currently shown in the
  // detail popup, 90 degrees clockwise. Only ever called next to a local data: URL -- never an
  // online reference image, same restriction as the edit form's nudgeRotate (see its comment).
  async function rotateDetailImage() {
    if (!detailCard) return;
    const isFront = !detailFlipped;
    const scanKey = isFront ? "personalFront" : "personalBack";
    const purchaseKey = isFront ? "purchasePhotoFront" : "purchasePhotoBack";
    const current = detailCard[scanKey] || detailCard[purchaseKey];
    if (!current) return;
    const rotated = await rotateDataUrl(current, 90);
    const updated = {
      ...detailCard,
      [scanKey]: detailCard[scanKey] ? rotated : detailCard[scanKey],
      [purchaseKey]: detailCard[purchaseKey] ? rotated : detailCard[purchaseKey],
    };
    persist(cards.map((c) => (c.id === detailCard.id ? updated : c)));
    setDetailCard(updated);
  }

  const filtered = useMemo(() => {
    // Cards flagged "needs review" (manually, or via Auto Import landing in the review queue)
    // are hidden from the normal Gallery/List browsing entirely -- they live in the Review tab
    // until dealt with. Still counted in stats/checklist progress below, since a flagged card is
    // still a real, owned card that just needs a second look, not one that's been removed.
    // Sold cards (round 30) are hidden the same way -- once sold it's no longer part of the
    // active collection to browse -- but unlike needsReview, sold cards are also left out of the
    // stats strip below, since "cards in the collection" / "estimated value" should reflect what
    // Kaleb actually still owns.
    // Round 33: "Home" browses only the Stars/North Stars pool, "Gallery" (the old single tab,
    // key unchanged) browses everything -- see homeCards above.
    const basePool = activeTab === "home" ? homeCards : cards;
    let list = basePool.filter((c) => !c.needsReview && !c.sold);
    if (sportFilter !== "All") list = list.filter((c) => c.sport === sportFilter);
    if (brandFilter !== "All") list = list.filter((c) => (c.brand || "") === brandFilter);
    if (teamFilter !== "All") list = list.filter((c) => (c.team || "") === teamFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      // Round 33 bug fix: these used to assume player/team/set/year were always non-empty
      // strings. A card missing one of those fields (e.g. an incompletely-identified Auto Import
      // card) made `.toLowerCase()` throw the moment a search that didn't already match on
      // `player` alone reached it -- since `||` short-circuits, this only ever surfaced once the
      // player-name check failed to match first, which is exactly what made it look like it came
      // out of nowhere. This was a real, reproducible whole-app crash (confirmed via a disposable
      // preview build with a card seeded with an undefined `team` field), not just a hunch --
      // matches Kaleb's "gallery crashes" report. Every field now falls back to "" like `brand`
      // already did.
      list = list.filter(
        (c) =>
          (c.player || "").toLowerCase().includes(q) ||
          (c.team || "").toLowerCase().includes(q) ||
          (c.brand || "").toLowerCase().includes(q) ||
          (c.set || "").toLowerCase().includes(q) ||
          (c.year || "").toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    switch (sortBy) {
      case "valueDesc":
        sorted.sort((a, b) => (b.value || 0) - (a.value || 0));
        break;
      case "player":
        sorted.sort((a, b) => a.player.localeCompare(b.player));
        break;
      case "team":
        sorted.sort((a, b) => (a.team || "").localeCompare(b.team || "") || b.dateAdded - a.dateAdded);
        break;
      case "year":
        sorted.sort((a, b) => (seasonStartYear(b.year) ?? -1) - (seasonStartYear(a.year) ?? -1));
        break;
      case "yearAsc":
        sorted.sort((a, b) => (seasonStartYear(a.year) ?? 9999) - (seasonStartYear(b.year) ?? 9999));
        break;
      default:
        sorted.sort((a, b) => b.dateAdded - a.dateAdded);
    }
    return sorted;
  }, [cards, homeCards, activeTab, query, sportFilter, brandFilter, teamFilter, sortBy]);

  // Round 25: group the currently-filtered/sorted gallery list by "same physical card" (player +
  // year + brand + set + card number) so Kaleb's duplicate copies show as one tile with an "x2"/
  // "x3" badge instead of cluttering the grid with repeats. Deliberately only used for the plain
  // gallery view, not "Fix rotation" mode (each physical copy's own photo still needs its own
  // rotate control there) and not the List/table view (each row stays its own line -- he only
  // asked for this in the gallery). Groups can't just collapse adjacent entries since sort order
  // (e.g. "Recently added") can interleave duplicates with unrelated cards -- this does a real
  // group-by keyed on first-seen order instead. Must come after `filtered` is declared above (an
  // earlier version of this lived higher up in the component and referenced `filtered` before its
  // own declaration -- a real "cannot access before initialization" crash, caught by an actual
  // render/screenshot check rather than node --check, which can't see this kind of ordering bug).
  const groupedGalleryCards = useMemo(() => {
    const groups = new Map();
    const order = [];
    filtered.forEach((c) => {
      const key = duplicateGroupKey(c);
      let group = groups.get(key);
      if (!group) {
        group = { key, card: c, count: 0, copies: [] };
        groups.set(key, group);
        order.push(group);
      }
      group.count += 1;
      group.copies.push(c);
    });
    return order;
  }, [filtered]);

  const stats = useMemo(() => {
    const active = cards.filter((c) => !c.sold);
    const totalValue = active.reduce((s, c) => s + (Number(c.value) || 0), 0);
    return { totalCards: active.length, totalValue };
  }, [cards]);

  // Subtotal for whatever's currently on screen after search/sport/brand/team filters --
  // this is what answers "what are just my <team> cards worth" when teamFilter narrows the
  // view to one team, without changing the always-whole-collection numbers in the stat strip.
  const filteredStats = useMemo(() => {
    const totalValue = filtered.reduce((s, c) => s + (Number(c.value) || 0), 0);
    return { totalCards: filtered.length, totalValue };
  }, [filtered]);

  // Every team actually present in the collection, for the team filter dropdown -- sorted
  // alphabetically, same pattern as usedBrands below.
  const usedTeams = useMemo(() => {
    const seen = new Set();
    const pool = activeTab === "home" ? homeCards : cards;
    pool.forEach((c) => { if (c.team) seen.add(c.team); });
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [cards, homeCards, activeTab]);

  // Active team-color theme for the Collection tab, only while a specific team is filtered in
  // (Kaleb's call -- not an app-wide re-theme). Falls back to null (the app's normal look) for
  // "All teams" and for any team not in TEAM_THEMES.
  const teamTheme = useMemo(() => {
    if (teamFilter === "All") return null;
    return TEAM_THEMES[teamFilter] || null;
  }, [teamFilter]);

  // Every brand actually present in the collection, for the datalist suggestions and the
  // brand filter dropdown -- combined with the starter KNOWN_BRANDS list so a fresh collection
  // still gets sensible suggestions before anything's been tagged with a brand yet.
  const brandOptions = useMemo(() => {
    const seen = new Set(KNOWN_BRANDS);
    cards.forEach((c) => { if (c.brand) seen.add(c.brand); });
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [cards]);

  const usedBrands = useMemo(() => {
    const seen = new Set();
    const pool = activeTab === "home" ? homeCards : cards;
    pool.forEach((c) => { if (c.brand) seen.add(c.brand); });
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [cards, homeCards, activeTab]);

  return (
    <div
      className={`ledger-root${teamTheme ? " team-themed" : ""}`}
      style={
        teamTheme
          ? { "--team-primary": teamTheme.primary, "--team-accent": teamTheme.accent, "--team-ink": teamTheme.ink }
          : undefined
      }
    >
      <datalist id="brand-options">
        {brandOptions.map((b) => <option key={b} value={b} />)}
      </datalist>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&display=swap');

        .ledger-root {
          --paper: #F2EEE2; --paper-line: #D8D0BC; --ink: #1F2A24;
          --navy: #1E3448; --green: #2F4B3C; --gold: #A97D1F; --brick: #8C3B2E; --muted: #6B6555;
          --ice: #E4F1F4; --rink-line: #4F7FA6;
          /* Team-color theming (round 21) defaults to the ledger's own palette so every rule
             below that reads var(--team-*) looks identical to the untouched design until a
             team filter is active on the Collection tab -- see teamTheme/TEAM_THEMES above. */
          --team-primary: var(--navy); --team-accent: var(--gold); --team-ink: var(--ink);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: var(--paper); color: var(--ink); min-height: 100%;
          padding: 28px 20px 60px; box-sizing: border-box;
        }
        .ledger-root * { box-sizing: border-box; }
        .ledger-inner { max-width: 960px; margin: 0 auto; }
        .header-row {
          position: relative; display: flex; justify-content: space-between; align-items: flex-end;
          flex-wrap: wrap; gap: 16px; padding-bottom: 18px; margin-bottom: 22px;
          border-bottom: 2px solid var(--ink);
        }
        /* A thin three-bar "rink line" flourish (blue / red / blue) under the header -- an
           original, generic nod to hockey-rink markings, not any team's actual branding. */
        .header-row::after {
          content: ""; position: absolute; left: 0; right: 0; bottom: -2px; height: 4px;
          background: linear-gradient(90deg, var(--rink-line) 0 38%, var(--brick) 38% 62%, var(--rink-line) 62% 100%);
          opacity: 0.55;
        }
        .wordmark-row { display: flex; align-items: baseline; gap: 10px; }
        .wordmark { font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif; font-size: 34px; font-weight: 700; margin: 0; color: var(--navy); }
        .wordmark-tag {
          font-family: "Oswald", -apple-system, sans-serif; font-size: 11px; font-weight: 600;
          letter-spacing: 0.11em; text-transform: uppercase; color: var(--paper);
          background: var(--green); padding: 3px 8px; border-radius: 2px; transform: translateY(-3px);
        }

        .scan-cta { display: flex; align-items: center; gap: 10px; background: var(--green); color: var(--paper); border: none; padding: 12px 20px; font-size: 15px; font-weight: 600; cursor: pointer; border-radius: 4px; font-family: inherit; box-shadow: 0 2px 0 rgba(0,0,0,0.18); transition: transform 0.1s ease, box-shadow 0.1s ease; }
        .scan-cta:hover { background: #24392d; transform: translateY(-1px); box-shadow: 0 3px 0 rgba(0,0,0,0.2); }
        .scan-cta:active { transform: translateY(0); box-shadow: 0 1px 0 rgba(0,0,0,0.18); }
        .scan-cta:focus-visible { outline: 2px solid var(--navy); outline-offset: 2px; }
        .scan-cta svg { flex-shrink: 0; }

        .stat-strip { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--paper-line); border-bottom: 1px solid var(--paper-line); margin-bottom: 22px; }
        .stat { padding: 14px 16px; border-left: 1px solid var(--paper-line); position: relative; display: flex; align-items: center; gap: 10px; }
        .stat:first-child { border-left: none; }
        .stat-icon { flex-shrink: 0; opacity: 0.8; }
        .stat-num { font-family: "Oswald", Georgia, serif; font-size: 27px; font-weight: 700; color: var(--navy); line-height: 1.1; letter-spacing: 0.01em; font-variant-numeric: tabular-nums; }
        .stat-label { font-size: 11.5px; color: var(--muted); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.06em; }
        .stat-clickable { cursor: pointer; }
        .stat-clickable:hover { background: rgba(30,52,72,0.04); }

        .controls { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; }
        .team-subtotal {
          display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: #fff;
          background: linear-gradient(100deg, var(--team-primary), var(--team-ink));
          border-left: 5px solid var(--team-accent); border-radius: 4px;
          padding: 9px 14px; margin: -8px 0 16px; text-shadow: 0 1px 1px rgba(0,0,0,0.35);
        }
        .team-subtotal strong { font-weight: 700; }
        .controls input[type="text"], .controls select { font-family: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--paper-line); background: #fff; border-radius: 3px; color: var(--ink); }
        .controls input[type="text"] { flex: 1; min-width: 160px; }
        .controls input:focus-visible, .controls select:focus-visible { outline: 2px solid var(--navy); outline-offset: 1px; }
        .view-toggle { display: flex; border: 1px solid var(--paper-line); border-radius: 3px; overflow: hidden; }
        .view-toggle button { background: #fff; border: none; padding: 8px 14px; font-size: 13px; cursor: pointer; font-family: inherit; color: var(--muted); }
        .view-toggle button.active { background: var(--navy); color: var(--paper); }

        .tab-bar { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--paper-line); margin-bottom: 18px; }
        .tab-bar button {
          background: none; border: none; border-bottom: 3px solid transparent; padding: 9px 3px; margin-right: 20px;
          font-family: "Oswald", -apple-system, sans-serif; font-size: 13.5px; font-weight: 600;
          letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); cursor: pointer;
        }
        .tab-bar button:hover { color: var(--ink); }
        .tab-bar button.active { color: var(--navy); border-bottom-color: var(--gold); }


        .hide-collected-toggle { display: flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--muted); cursor: pointer; white-space: nowrap; }

        .auto-import-panel input[type="text"] { font-family: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--paper-line); background: #fff; border-radius: 3px; color: var(--ink); }
        .auto-import-job-card { border: 1px solid var(--paper-line); border-radius: 4px; padding: 10px 14px; background: #fff; margin-bottom: 8px; }
        .auto-import-progress-track { width: 100%; height: 6px; border-radius: 3px; background: #EDE7D6; overflow: hidden; }
        .auto-import-progress-fill { height: 100%; background: var(--green); }
        .auto-import-review-card { border: 1px solid var(--paper-line); border-radius: 4px; padding: 12px 14px; background: #fff; margin-bottom: 14px; max-width: 640px; }
        .review-flagged-card .photo-pair-row { gap: 12px; align-items: flex-start; }
        .review-flagged-card .tile-value { color: var(--green); }
        .review-thumb { width: 100%; aspect-ratio: 5/7; object-fit: contain; background: #EDE7D6; border-radius: 2px; cursor: zoom-in; }
        .review-thumb-label { display: block; text-align: center; font-size: 11px; color: var(--muted); margin-top: 3px; letter-spacing: 0.03em; text-transform: uppercase; }
        .review-replace-link { display: block; text-align: center; font-size: 12px; color: var(--gold); text-decoration: underline; cursor: pointer; margin-top: 2px; }
        .verify-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
        .verify-fields input, .verify-fields select { font-family: inherit; font-size: 13.5px; padding: 6px 8px; border: 1px solid var(--paper-line); background: #fff; border-radius: 3px; color: var(--ink); }

        .seller-note { font-size: 13px; color: var(--muted); font-style: italic; font-family: Georgia, serif; margin: 0 0 16px; }
        .seller-controls { margin-bottom: 22px; }
        .seller-size-label { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--muted); }
        .seller-size-label input[type="number"] { width: 64px; font-family: inherit; font-size: 14px; padding: 7px 8px; border: 1px solid var(--paper-line); background: #fff; border-radius: 3px; color: var(--ink); }
        .seller-discount-label { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--muted); }
        .seller-discount-label input[type="range"] { width: 130px; }
        .seller-discount-value { font-family: Georgia, serif; font-weight: 700; color: var(--navy); width: 34px; }
        .seller-section { margin-bottom: 30px; }
        .seller-section-heading { font-family: Georgia, serif; color: var(--navy); font-size: 17px; margin: 0 0 12px; }
        .seller-bundle-card { border: 1px solid var(--paper-line); border-radius: 4px; background: #fff; margin-bottom: 16px; max-width: 620px; overflow: hidden; }
        .seller-listing-title { display: flex; align-items: center; gap: 8px; font-family: Georgia, serif; font-weight: 700; color: var(--navy); font-size: 15px; padding: 12px 14px 0; }
        /* Round 36: "Suggested listings" titles are now also a collapse/expand toggle button --
           reset the button chrome so it still reads as the same title style as "Your bundles"'
           plain (non-clickable) title just above. */
        .seller-listing-toggle { width: 100%; text-align: left; background: none; border: none; cursor: pointer; font-family: inherit; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .seller-expand-caret { display: inline-block; transition: transform 0.15s ease; color: var(--muted); font-size: 12px; }
        .seller-expand-caret-open { transform: rotate(90deg); }
        .seller-found-progress { font-size: 11px; font-weight: 600; color: var(--muted); background: #EDE7D6; border-radius: 10px; padding: 2px 8px; }
        .seller-found-progress-complete { color: #fff; background: #2E7D46; }
        .seller-photo-grid { display: flex; flex-wrap: wrap; gap: 12px; padding: 10px 14px 14px; }
        .seller-photo-item { width: 96px; }
        .seller-photo-found-toggle { display: block; width: 100%; padding: 0; border: none; background: none; cursor: pointer; font: inherit; }
        .seller-photo-wrap { position: relative; width: 96px; aspect-ratio: 5 / 7; background: #EDE7D6; border-radius: 3px; overflow: hidden; margin-bottom: 4px; }
        .seller-photo-wrap img, .seller-photo-wrap .img-fallback { width: 100%; height: 100%; object-fit: contain; }
        .seller-photo-item-found .seller-photo-wrap { outline: 2px solid #2E7D46; outline-offset: -2px; }
        .seller-photo-item-found .seller-photo-wrap img { opacity: 0.55; }
        .seller-found-badge { position: absolute; top: 3px; right: 3px; width: 20px; height: 20px; border-radius: 50%; background: #2E7D46; color: #fff; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.35); }
        .seller-photo-cantfind-toggle { display: block; width: 100%; margin: 3px 0 4px; padding: 2px 0; border: 1px solid #C0392B; border-radius: 3px; background: none; color: #C0392B; font-size: 10px; font-weight: 600; cursor: pointer; font-family: inherit; }
        .seller-photo-cantfind-toggle:hover { background: #C0392B; color: #fff; }
        .seller-missing-section .seller-bundle-list .link-btn { margin-left: 10px; flex-shrink: 0; }
        .seller-photo-caption { display: flex; flex-direction: column; gap: 1px; cursor: pointer; }
        .seller-photo-caption .seller-bundle-player { font-size: 11.5px; line-height: 1.25; }
        .seller-photo-caption .tile-sub { font-size: 10.5px; line-height: 1.25; }
        .seller-photo-caption .value-cell { font-size: 11.5px; font-weight: 600; }
        .seller-photo-caption:hover .seller-bundle-player { text-decoration: underline; color: var(--navy); }
        .seller-status-pill { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 10.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; border-radius: 10px; padding: 2px 9px; }
        .seller-status-bundled { color: var(--gold); border: 1px solid var(--gold); }
        .seller-bundle-header { display: flex; align-items: center; gap: 14px; padding: 8px 14px 10px; border-bottom: 1px solid var(--paper-line); flex-wrap: wrap; }
        .seller-price-block { display: flex; flex-direction: column; }
        .seller-bundle-value { font-family: Georgia, serif; font-weight: 700; color: var(--green); font-size: 17px; }
        .seller-bundle-actions { display: flex; align-items: center; gap: 12px; margin-left: auto; }
        .seller-mixed-breakdown { font-size: 12px; color: var(--muted); padding: 8px 14px 0; }
        .seller-bundle-list { list-style: none; margin: 0; padding: 4px 14px; }
        .seller-bundle-list li { display: flex; align-items: baseline; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--paper-line); cursor: pointer; }
        .seller-bundle-list li:last-child { border-bottom: none; }
        .seller-bundle-list li:hover .seller-bundle-player { text-decoration: underline; color: var(--navy); }
        .seller-bundle-player { font-weight: 600; font-size: 13.5px; }
        .seller-bundle-list .value-cell { margin-left: auto; flex-shrink: 0; }
        .seller-leftover { margin-top: 6px; margin-bottom: 20px; max-width: 620px; }
        .seller-leftover h4 { font-size: 13.5px; color: var(--muted); margin: 0 0 6px; font-weight: 600; }
        .seller-leftover .seller-bundle-list { border: 1px dashed var(--paper-line); border-radius: 4px; padding: 4px 14px; }
        .seller-sold-section { margin-top: 30px; border-top: 1px solid var(--paper-line); padding-top: 18px; max-width: 620px; }
        .seller-sold-section h3 { font-family: Georgia, serif; color: var(--navy); font-size: 17px; margin: 0 0 10px; }
        .seller-sold-section .seller-bundle-list { border: 1px solid var(--paper-line); border-radius: 4px; background: #fff; }
        .seller-sold-section .seller-bundle-list .link-btn { margin-left: 10px; flex-shrink: 0; }
        .seller-sold-bundle { border: 1px solid var(--paper-line); border-radius: 4px; background: #fff; margin-bottom: 10px; overflow: hidden; }
        .seller-sold-bundle-header { display: flex; align-items: center; gap: 12px; padding: 9px 14px; background: #F7F4EA; border-bottom: 1px solid var(--paper-line); font-size: 13.5px; }
        .seller-sold-bundle-header .value-cell { margin-left: auto; }
        .seller-sold-bundle .seller-bundle-list { border: none; }

        .banner-good { border-color: var(--green); color: var(--green); background: #EAF1EC; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .banner-dismiss { background: none; border: none; color: inherit; text-decoration: underline; cursor: pointer; font-family: inherit; font-size: 12.5px; flex-shrink: 0; }

        .checklist-wrap { display: flex; flex-direction: column; gap: 4px; }
        .checklist-intro { font-size: 13px; color: var(--muted); margin: 0 0 14px; font-style: italic; font-family: Georgia, serif; }
        .checklist-year { border: 1px solid var(--paper-line); border-radius: 4px; margin-bottom: 8px; background: #fff; overflow: hidden; }
        .checklist-year-header { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 10px; background: none; border: none; padding: 11px 14px; cursor: pointer; font-family: inherit; text-align: left; }
        .checklist-year-header:hover { background: rgba(30,52,72,0.04); }
        .checklist-year-title { font-weight: 600; font-size: 14.5px; color: var(--navy); }
        .checklist-year-team { font-weight: 400; color: var(--muted); font-size: 13px; }
        .checklist-year-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .checklist-year-count { font-family: Georgia, serif; font-weight: 700; font-size: 13.5px; color: var(--navy); }
        .checklist-year-caret { color: var(--muted); font-size: 12px; width: 10px; text-align: center; }
        .checklist-progress-bar { height: 3px; background: var(--paper-line); }
        .checklist-progress-fill { height: 100%; background: var(--gold); }
        .checklist-rows { padding: 4px 14px 10px; }
        .checklist-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--paper-line); font-size: 13.5px; }
        .checklist-row:last-child { border-bottom: none; }
        .checklist-row.owned { color: var(--ink); }
        .checklist-row:not(.owned) { color: var(--muted); }
        .checklist-check { width: 20px; height: 20px; border-radius: 3px; border: 1px solid var(--paper-line); background: var(--green); color: #fff; cursor: pointer; font-size: 12px; flex-shrink: 0; font-family: inherit; }
        .checklist-check-label { display: flex; flex-shrink: 0; }
        .checklist-check-label input { width: 17px; height: 17px; cursor: pointer; }
        .checklist-num { font-family: Georgia, serif; color: var(--muted); font-size: 12.5px; width: 40px; flex-shrink: 0; }
        .checklist-player { flex: 1; }
        .checklist-player-btn { background: none; border: none; padding: 0; text-align: left; font-family: inherit; font-size: inherit; color: inherit; cursor: pointer; }
        .checklist-player-btn:hover { text-decoration: underline; color: var(--navy); }
        .checklist-info-card { max-width: 380px; }
        .checklist-info-note { font-size: 13px; color: var(--muted); margin: 4px 0 0; line-height: 1.5; }
        .checklist-auto-tag { font-size: 10.5px; color: var(--green); border: 1px solid var(--green); border-radius: 10px; padding: 1px 7px; flex-shrink: 0; }
        .checklist-series-tag { font-size: 10.5px; color: var(--muted); border: 1px solid var(--paper-line); border-radius: 10px; padding: 1px 7px; flex-shrink: 0; white-space: nowrap; }
        .checklist-alumni-heading { margin: 28px 0 4px; font-size: 16px; }
        .checklist-row-team { font-size: 11.5px; flex-shrink: 0; }
        .checklist-empty { font-size: 13px; color: var(--muted); padding: 6px 0; margin: 0; }
        .checklist-tcdb-link { display: block; font-size: 11.5px; color: var(--navy); text-decoration: underline; margin: 2px 0 8px; }
        .checklist-intro a { color: var(--navy); }
        .checklist-notes { margin-top: 14px; font-size: 12.5px; color: var(--muted); }
        .checklist-notes summary { cursor: pointer; font-weight: 600; color: var(--navy); }
        .checklist-notes ul { margin: 8px 0 0; padding-left: 18px; }
        .checklist-notes li { margin-bottom: 6px; line-height: 1.4; }

        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        thead th { text-align: left; padding: 8px 10px; border-bottom: 2px solid var(--ink); font-weight: 600; color: var(--navy); font-size: 12.5px; }
        tbody tr { border-bottom: 1px solid var(--paper-line); cursor: pointer; }
        tbody tr:hover { background: rgba(30,52,72,0.04); }
        tbody td { padding: 9px 10px; vertical-align: middle; }
        .thumb-cell { width: 42px; height: 58px; border-radius: 2px; overflow: hidden; background: #EDE7D6; }
        .thumb-cell img, .thumb-cell .img-fallback { width: 100%; height: 100%; object-fit: contain; }
        .player-cell { font-weight: 600; }
        .sub-cell { color: var(--muted); font-size: 12.5px; }
        .value-cell { font-family: Georgia, serif; font-weight: 700; color: var(--green); }

        .empty-state { padding: 56px 20px; text-align: center; color: var(--muted); border: 1px dashed var(--paper-line); }
        .empty-state p { margin: 0 0 16px; font-size: 15px; }

        /* align-items (round 34, tuned round 35) -- without an explicit value, CSS Grid's default
           "stretch" makes every tile in a row match the height of the TALLEST tile in that row. A
           landscape tile's own image box correctly shrinks (see .tile-img-wrap-landscape below),
           but the surrounding .tile itself was still being stretched to match its taller portrait
           neighbors, leaving the now-correctly-sized image pinned at the top with a big empty gap
           below it. Round 34 fixed that with align-items: start, which stopped the stretch but
           left every shorter tile pinned to the TOP of its row -- round 35 switches to "center" so
           a landscape tile instead sits centered against its taller portrait neighbors, per
           Kaleb's request. */
        .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; align-items: center; }
        .tile {
          border: 1px solid var(--paper-line); border-top: 4px solid var(--card-team-primary, var(--team-primary));
          background: #fff; border-radius: 6px; overflow: hidden; cursor: pointer;
          display: flex; flex-direction: column; box-shadow: 0 1px 2px rgba(0,0,0,0.06);
          transition: transform 0.12s ease, box-shadow 0.12s ease;
        }
        .tile:hover { transform: translateY(-2px); box-shadow: 0 6px 14px rgba(0,0,0,0.14); }
        .tile-img-wrap { position: relative; aspect-ratio: 5 / 7; background: #EDE7D6; }
        .tile-img-wrap img, .img-fallback { width: 100%; height: 100%; object-fit: contain; display: flex; align-items: center; justify-content: center; }
        /* A landscape (wider-than-tall) photo left a big empty gap in the default portrait-shaped
           box -- detected client-side once the image loads (see markTileOrientation) and swapped
           to a landscape-shaped box instead, which the image fills properly with object-fit:
           contain instead of floating in a mostly-empty tall rectangle. */
        .tile-img-wrap-landscape { aspect-ratio: 7 / 5; }
        .tile-flag-btn { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; background: rgba(30,52,72,0.75); color: #fff; border: none; border-radius: 50%; font-size: 12px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .tile-flag-btn:hover { background: rgba(140,59,46,0.9); }
        .img-fallback { color: var(--muted); font-family: Georgia, serif; font-style: italic; font-size: 13px; text-align: center; padding: 10px; }
        .tile-flip-btn { position: absolute; top: 6px; right: 6px; background: rgba(30,52,72,0.75); color: #fff; border: none; border-radius: 3px; padding: 3px 7px; font-size: 11px; cursor: pointer; font-family: inherit; }
        .tile-rotate-btn { position: absolute; top: 6px; left: 6px; background: rgba(30,52,72,0.75); color: #fff; border: none; border-radius: 3px; padding: 3px 8px; font-size: 14px; line-height: 1; cursor: pointer; font-family: inherit; }
        .tile-source-toggle { position: absolute; bottom: 6px; left: 6px; right: 6px; display: flex; border-radius: 3px; overflow: hidden; font-size: 10.5px; }
        .tile-source-toggle button { flex: 1; border: none; padding: 4px 2px; cursor: pointer; font-family: inherit; background: rgba(255,255,255,0.85); color: var(--muted); }
        .tile-source-toggle button.active { background: var(--gold); color: #fff; }
        .tile-info { padding: 8px 9px 10px; position: relative; }
        .tile-dupe-badge { position: absolute; right: 9px; bottom: 10px; font-size: 11.5px; font-weight: 700; color: var(--muted); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .tile-player { font-weight: 600; font-size: 13.5px; line-height: 1.25; }
        .tile-sub { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
        .tile-value { font-family: Georgia, serif; font-weight: 700; color: var(--green); font-size: 13px; margin-top: 4px; }
        .tile-editmode { cursor: default; }
        .tile-rotate-row { display: flex; }
        .tile-rotate-col { flex: 1; min-width: 0; }
        .tile-rotate-col + .tile-rotate-col { border-left: 1px solid var(--paper-line); }
        .tile-rotate-col .tile-img-wrap { aspect-ratio: 5 / 7; }
        .tile-rotate-label { text-align: center; font-size: 10.5px; color: var(--muted); padding: 3px 0; background: #F7F4EA; }
        .tile-rotate-btn { position: absolute; top: 6px; right: 6px; width: 26px; height: 26px; background: rgba(30,52,72,0.8); color: #fff; border: none; border-radius: 50%; font-size: 15px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .tile-rotate-btn:disabled { opacity: 0.6; cursor: default; }

        .overlay { position: fixed; inset: 0; background: rgba(20,20,15,0.45); display: flex; align-items: center; justify-content: center; padding: 30px 16px; z-index: 10; overflow-y: auto; }
        .overlay.align-top { align-items: flex-start; padding-top: 40px; }

        .scan-card { background: var(--paper); border: 1px solid var(--ink); max-width: 380px; width: 100%; padding: 28px 24px; border-radius: 6px; text-align: center; }
        .scan-card h2 { font-family: Georgia, serif; margin: 0 0 6px; font-size: 22px; color: var(--navy); }
        .scan-card .form-sub { margin: 0 0 20px; font-size: 13.5px; color: var(--muted); }
        .dropzone { display: flex; flex-direction: column; align-items: center; gap: 10px; border: 2px dashed var(--paper-line); border-radius: 6px; padding: 30px 16px; cursor: pointer; color: var(--navy); font-weight: 600; font-size: 14.5px; transition: border-color 0.15s; }
        .dropzone:hover { border-color: var(--gold); }
        .dropzone svg { flex-shrink: 0; }
        .scan-preview-row { display: flex; justify-content: center; gap: 10px; margin-bottom: 14px; }
        .scan-preview { width: 60px; height: 82px; border-radius: 3px; overflow: hidden; background: #EDE7D6; }
        .scan-preview img { width: 100%; height: 100%; object-fit: contain; }
        .scan-status { font-size: 13.5px; color: var(--muted); margin-top: 14px; }
        .identify-error { font-size: 12.5px; color: var(--brick); margin: 14px 0 0; }
        .scan-cancel { margin-top: 18px; background: none; border: none; color: var(--muted); text-decoration: underline; cursor: pointer; font-family: inherit; font-size: 13px; }

        .form-card { background: var(--paper); border: 1px solid var(--ink); max-width: 560px; width: 100%; padding: 24px; border-radius: 4px; }

        .detail-card { background: var(--paper); border: 1px solid var(--ink); max-width: 420px; width: 100%; padding: 24px; border-radius: 4px; }
        .detail-img-wrap { position: relative; width: 100%; aspect-ratio: 5 / 7; background: #EDE7D6; border-radius: 4px; overflow: hidden; margin-bottom: 16px; }
        .detail-img-wrap img, .detail-img-wrap .img-fallback { width: 100%; height: 100%; object-fit: contain; }
        .detail-player { font-family: Georgia, serif; font-size: 22px; color: var(--navy); margin: 0; }
        .detail-team { font-size: 13.5px; color: var(--muted); margin: 3px 0 16px; }
        .detail-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; padding: 14px 0; border-top: 1px solid var(--paper-line); border-bottom: 1px solid var(--paper-line); margin-bottom: 4px; }
        .detail-fact { display: flex; flex-direction: column; font-size: 14px; }
        .detail-fact-label { font-size: 11.5px; color: var(--muted); margin-bottom: 2px; }
        .sales-box { border: 1px dashed var(--paper-line); border-radius: 4px; padding: 12px; }
        .sales-list { list-style: none; margin: 0 0 8px; padding: 0; }
        .sales-list li { display: flex; justify-content: space-between; align-items: baseline; padding: 5px 0; border-bottom: 1px solid var(--paper-line); font-size: 13.5px; }
        .sales-list li:last-child { border-bottom: none; }
        .sales-price { font-family: Georgia, serif; font-weight: 700; color: var(--navy); }
        .sales-meta { color: var(--muted); font-size: 12px; }
        .sales-note { font-size: 12px; color: var(--muted); margin: 0 0 8px; font-style: italic; }
        .form-card h2 { font-family: Georgia, serif; margin: 0 0 4px; font-size: 20px; color: var(--navy); }
        .form-card .form-sub { margin: 0 0 18px; font-size: 13px; color: var(--muted); }
        .section-label { font-size: 13px; font-weight: 600; color: var(--navy); margin: 18px 0 8px; padding-top: 14px; border-top: 1px solid var(--paper-line); }
        .section-label:first-of-type { margin-top: 0; padding-top: 0; border-top: none; }

        .identify-box { border: 1px dashed var(--paper-line); border-radius: 4px; padding: 12px; display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
        .identify-preview-pair { display: flex; gap: 8px; flex-shrink: 0; }
        .preview-col { display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .identify-preview { width: 60px; height: 82px; border-radius: 3px; overflow: hidden; background: #EDE7D6; flex-shrink: 0; }
        .identify-preview.zoomable { cursor: zoom-in; width: 90px; height: 123px; }
        .zoom-hint { font-size: 11px; color: var(--muted); margin: 4px 0 0; }
        .zoom-overlay { flex-direction: column; gap: 14px; z-index: 20; cursor: zoom-out; }
        .zoom-overlay-img { max-width: min(90vw, 600px); max-height: 80vh; object-fit: contain; border-radius: 4px; background: #EDE7D6; }
        .zoom-overlay-close { background: rgba(255,255,255,0.9); border: none; border-radius: 4px; padding: 8px 16px; cursor: pointer; font-family: inherit; font-size: 13px; }
        .identify-preview img { width: 100%; height: 100%; object-fit: contain; }
        .rotate-btn { background: none; border: 1px solid var(--paper-line); border-radius: 3px; font-size: 10.5px; padding: 2px 6px; cursor: pointer; color: var(--muted); font-family: inherit; }
        .rotate-btn:hover { color: var(--ink); border-color: var(--ink); }
        .identify-controls { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 180px; }
        .identify-btn { background: var(--gold); color: #fff; border: none; padding: 8px 14px; border-radius: 3px; cursor: pointer; font-size: 13px; font-family: inherit; align-self: flex-start; display: inline-block; }
        .identify-btn:disabled { opacity: 0.5; cursor: default; }
        .identify-note { font-size: 12px; color: var(--muted); margin: 0; }
        .confidence-badge { font-size: 12px; padding: 2px 8px; border-radius: 10px; background: var(--green); color: #fff; display: inline-block; width: fit-content; }
        .phone-photo-tag { font-size: 10px; color: var(--brick); margin-top: 2px; }
        .phone-photo-note { font-size: 12px; color: var(--muted); margin: 4px 0 0; line-height: 1.5; background: #FBF3E4; border: 1px dashed var(--gold); border-radius: 4px; padding: 8px; }
        .link-btn { background: none; border: none; padding: 0; font-size: 12.5px; color: var(--navy); text-decoration: underline; cursor: pointer; font-family: inherit; align-self: flex-start; }
        .link-btn:hover { color: var(--brick); }

        .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .field { display: flex; flex-direction: column; gap: 4px; }
        .field.full { grid-column: 1 / -1; }
        .field label { font-size: 12px; color: var(--muted); }
        .field input, .field select { font-family: inherit; font-size: 14px; padding: 8px 9px; border: 1px solid var(--paper-line); border-radius: 3px; background: #fff; color: var(--ink); }
        .field input:focus-visible, .field select:focus-visible { outline: 2px solid var(--navy); outline-offset: 1px; }

        .photo-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .photo-slot h4 { font-size: 12.5px; margin: 0 0 6px; color: var(--muted); font-weight: 600; }
        .photo-pair-row { display: flex; gap: 8px; }
        .photo-thumb { width: 58px; height: 80px; border-radius: 3px; overflow: hidden; background: #EDE7D6; flex-shrink: 0; }
        .photo-thumb img, .photo-thumb .img-fallback { width: 100%; height: 100%; object-fit: contain; }
        .photo-thumb .img-fallback { font-size: 10px; padding: 4px; }
        .photo-label { font-size: 11px; color: var(--muted); margin: 0 0 3px; }
        .photo-pair-col { flex: 1; }
        .photo-pair-col input[type="file"] { font-size: 11.5px; width: 100%; }

        .source-toggle { display: flex; border: 1px solid var(--paper-line); border-radius: 3px; overflow: hidden; width: fit-content; margin-top: 10px; }
        .source-toggle button { background: #fff; border: none; padding: 7px 14px; font-size: 12.5px; cursor: pointer; font-family: inherit; color: var(--muted); }
        .source-toggle button.active { background: var(--gold); color: #fff; }

        .form-actions { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
        .form-actions-right { display: flex; gap: 10px; }
        .form-actions-left { display: flex; gap: 10px; }
        .btn-secondary { background: none; border: 1px solid var(--paper-line); padding: 9px 16px; border-radius: 3px; cursor: pointer; font-family: inherit; font-size: 14px; color: var(--ink); }
        .btn-danger { background: none; border: none; color: var(--brick); text-decoration: underline; cursor: pointer; font-family: inherit; font-size: 13.5px; }
        .btn-primary { background: var(--navy); color: var(--paper); border: none; padding: 9px 18px; border-radius: 3px; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 600; }
        .btn-primary:hover { background: #14232f; }

        .banner { font-size: 13px; padding: 8px 12px; border: 1px solid var(--brick); color: var(--brick); background: #FBEDEA; border-radius: 3px; margin-bottom: 16px; }
        .banner-success { border-color: var(--green); color: var(--green); background: #E9F0EA; margin-top: 12px; margin-bottom: 0; }

        @media (max-width: 620px) {
          .stat-strip { grid-template-columns: 1fr; }
          .stat { border-left: none; border-top: 1px solid var(--paper-line); }
          .stat:first-child { border-top: none; }
          .field-grid, .photo-pair { grid-template-columns: 1fr; }
          table, thead, tbody, tr, td, th { font-size: 13px; }
          .sub-cell { display: none; }
        }
      `}</style>

      <div className="ledger-inner">
        <div className="header-row">
          <div>
            <div className="wordmark-row">
              <p className="wordmark">Bench</p>
              <span className="wordmark-tag">Hockey Card Ledger</span>
            </div>
          </div>
          <button className="scan-cta" onClick={openScan}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="14" height="18" rx="2" transform="rotate(-8 10 13)" />
              <circle cx="18" cy="18" r="4" />
              <path d="M18 16.5v3M16.5 18h3" />
            </svg>
            Scan a card
          </button>
        </div>

        <div className="tab-bar">
          <button
            className={activeTab === "home" ? "active" : ""}
            onClick={() => {
              // Switching between Home and the full Gallery resets the team/brand filters (round
              // 33) -- otherwise a team filter picked while browsing the full database could carry
              // over and make Home look empty ("nothing matches") the moment it lands on a team
              // that isn't Dallas Stars/Minnesota North Stars.
              setTeamFilter("All");
              setBrandFilter("All");
              setActiveTab("home");
            }}
          >
            Home
          </button>
          <button
            className={activeTab === "collection" ? "active" : ""}
            onClick={() => {
              setTeamFilter("All");
              setBrandFilter("All");
              setActiveTab("collection");
            }}
          >
            Gallery
          </button>
          <button className={activeTab === "review" ? "active" : ""} onClick={() => setActiveTab("review")}>
            Review{cards.some((c) => c.needsReview) ? ` (${cards.filter((c) => c.needsReview).length})` : ""}
          </button>
          <button className={activeTab === "checklist" ? "active" : ""} onClick={() => setActiveTab("checklist")}>Stars Checklist</button>
          <button className={activeTab === "yg" ? "active" : ""} onClick={() => setActiveTab("yg")}>Young Guns</button>
          <button className={activeTab === "autoimport" ? "active" : ""} onClick={() => setActiveTab("autoimport")}>Auto Import</button>
          <button className={activeTab === "sellers" ? "active" : ""} onClick={() => setActiveTab("sellers")}>Selling</button>
        </div>

        {loadError && <div className="banner">Couldn't load your saved collection. Starting from an empty ledger — anything you add now will still be saved going forward.</div>}
        {saveError && <div className="banner">Your last change didn't save. Try again before scanning more cards.</div>}
        {justMatched && (
          <div className="banner banner-good">
            ✓ Checked off the Stars checklist — {justMatched.year} {justMatched.setName} #{justMatched.number} {justMatched.player}.
            <button type="button" className="banner-dismiss" onClick={() => setJustMatched(null)}>Dismiss</button>
          </div>
        )}

        <div className="stat-strip">
          <div className="stat">
            <svg className="stat-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="3" width="12" height="16" rx="2" />
              <rect x="8" y="6" width="12" height="16" rx="2" fill="var(--paper)" />
            </svg>
            <div><div className="stat-num">{stats.totalCards}</div><div className="stat-label">cards in the collection</div></div>
          </div>
          <div className="stat">
            <svg className="stat-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v10M9 9.5c0-1.4 1.3-2.5 3-2.5s3 .9 3 2.1c0 2.9-6 1.6-6 4.5 0 1.2 1.3 2.1 3 2.1s3-1.1 3-2.5" />
            </svg>
            <div><div className="stat-num">{money(stats.totalValue)}</div><div className="stat-label">estimated value</div></div>
          </div>
          <div className="stat stat-clickable" onClick={() => setActiveTab("checklist")}>
            <svg className="stat-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l2.4 5 5.6.6-4.2 3.8 1.2 5.5L12 15l-5 2.9 1.2-5.5-4.2-3.8 5.6-.6z" />
            </svg>
            <div>
              <div className="stat-num">{checklistProgress.totalOwned} / {checklistProgress.totalCards}</div>
              <div className="stat-label">Stars base cards collected</div>
            </div>
          </div>
        </div>

        {activeTab === "checklist" && (
          <div className="controls">
            <input type="text" placeholder="Search checklist by player" value={checklistQuery} onChange={(e) => setChecklistQuery(e.target.value)} />
            <label className="hide-collected-toggle">
              <input type="checkbox" checked={checklistHideCollected} onChange={(e) => setChecklistHideCollected(e.target.checked)} />
              Hide collected
            </label>
            <button type="button" className="link-btn" onClick={() => setExpandedYears(Object.fromEntries(CHECKLIST_SETS.map((s) => [s.year, true])))}>Expand all</button>
            <button type="button" className="link-btn" onClick={() => setExpandedYears({})}>Collapse all</button>
            <button type="button" className="link-btn" onClick={exportStarsChecklistPdf}>Export PDF</button>
          </div>
        )}

        {activeTab === "yg" && (
          <div className="controls">
            <input type="text" placeholder="Search Young Guns by player" value={ygQuery} onChange={(e) => setYgQuery(e.target.value)} />
            <label className="hide-collected-toggle">
              <input type="checkbox" checked={ygHideCollected} onChange={(e) => setYgHideCollected(e.target.checked)} />
              Hide collected
            </label>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setExpandedYgYears(Object.fromEntries(youngGunsProgress.perSet.map((s) => [s.year, true])));
                setExpandedAlumniYgYears(Object.fromEntries(alumniYgProgress.perSet.map((s) => [s.year, true])));
              }}
            >
              Expand all
            </button>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setExpandedYgYears({});
                setExpandedAlumniYgYears({});
              }}
            >
              Collapse all
            </button>
            <button type="button" className="link-btn" onClick={exportYoungGunsChecklistPdf}>Export PDF</button>
          </div>
        )}

        {(activeTab === "collection" || activeTab === "home") && (
          <div className="controls">
            <input
              type="text"
              placeholder={activeTab === "home" ? "Search your Stars cards by player, brand, set, or year" : "Search player, team, brand, set, or year"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select value={sportFilter} onChange={(e) => setSportFilter(e.target.value)}>
              <option value="All">All sports</option>
              {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {usedBrands.length > 0 && (
              <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
                <option value="All">All brands</option>
                {usedBrands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            )}
            {usedTeams.length > 0 && (
              <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
                <option value="All">All teams</option>
                {usedTeams.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="dateAdded">Recently added</option>
              <option value="valueDesc">Highest value</option>
              <option value="player">Player name</option>
              <option value="team">Team name</option>
              <option value="year">Year (newest first)</option>
              <option value="yearAsc">Year (oldest first)</option>
            </select>
            <div className="view-toggle">
              <button className={viewMode === "gallery" ? "active" : ""} onClick={() => setViewMode("gallery")}>Gallery</button>
              <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>List</button>
            </div>
            {viewMode === "gallery" && (
              <button
                type="button"
                className={galleryEditMode ? "btn-primary" : "btn-secondary"}
                onClick={() => {
                  // Leaving edit mode is the natural "I'm done" moment -- flush any rotate save
                  // still waiting out its debounce instead of leaving it to fire on its own timer.
                  if (galleryEditMode) flushPendingRotateSave();
                  setGalleryEditMode((v) => !v);
                }}
              >
                {galleryEditMode ? "Done fixing rotation" : "Fix rotation"}
              </button>
            )}
          </div>
        )}

        {(activeTab === "collection" || activeTab === "home") && teamFilter !== "All" && (
          <div className="team-subtotal">
            <strong>{teamFilter}</strong>: {filteredStats.totalCards} card{filteredStats.totalCards === 1 ? "" : "s"} · {money(filteredStats.totalValue)} estimated value
          </div>
        )}

        {activeTab === "checklist" ? (
          <div className="checklist-wrap">
            <p className="checklist-intro">
              Every Upper Deck base-set Minnesota North Stars / Dallas Stars card, {CHECKLIST_SETS[0].year}–{CHECKLIST_SETS[CHECKLIST_SETS.length - 1].year}, sourced from the{" "}
              <a href="https://www.tcdb.com" target="_blank" rel="noreferrer">Trading Card Database</a>. Cards you've scanned or logged are checked off automatically by year, set, and card number
              (or player name); tick the box yourself for anything else you already own. Each year links back to its TCDB checklist if you want to double-check it yourself.
            </p>
            {checklistProgress.perSet.map((set) => (
              <ChecklistYearSection
                key={set.year}
                set={set}
                query={checklistQuery}
                hideCollected={checklistHideCollected}
                isExpanded={!!expandedYears[set.year]}
                onToggleExpand={() => toggleYearExpanded(set.year)}
                checklistMatches={checklistMatches}
                checklistManual={checklistManual}
                onOpenDetail={openDetail}
                onOpenInfo={setChecklistInfoEntry}
                onToggleManual={toggleManualOwned}
              />
            ))}
            <details className="checklist-notes">
              <summary>About this checklist's data</summary>
              <ul>
                {CHECKLIST_NOTES.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </details>
          </div>
        ) : activeTab === "yg" ? (
          <div className="checklist-wrap">
            <p className="checklist-intro">
              Every Dallas Stars / Minnesota North Stars Upper Deck <strong>Young Guns</strong> rookie card, pulled out of the full Stars Checklist above and sourced the same way from the{" "}
              <a href="https://www.tcdb.com" target="_blank" rel="noreferrer">Trading Card Database</a>. Young Guns is Upper Deck's marquee rookie subset, numbered at the tail of each
              series (roughly #201–250 and #451–500 in a standard 500-card year, with a third high-number block added from 2020-21 on) — this list is just those specific cards. Owned/collected
              status stays in sync with the main checklist automatically. Each card shows which specific series/wave (Series 1, Series 2, Extended Series, etc.) it actually shipped in — that's
              what tells you which packs have a chance of containing it.
            </p>
            {youngGunsProgress.perSet.length === 0 ? (
              <p className="checklist-empty">No Young Guns identified yet.</p>
            ) : (
              youngGunsProgress.perSet.map((set) => (
                <ChecklistYearSection
                  key={set.year}
                  set={set}
                  query={ygQuery}
                  hideCollected={ygHideCollected}
                  isExpanded={!!expandedYgYears[set.year]}
                  onToggleExpand={() => toggleYgYearExpanded(set.year)}
                  checklistMatches={checklistMatches}
                  checklistManual={checklistManual}
                  onOpenDetail={openDetail}
                  onOpenInfo={setChecklistInfoEntry}
                  onToggleManual={toggleManualOwned}
                  labelSuffix="Young Guns"
                  showSeries
                />
              ))
            )}

            <h3 className="checklist-alumni-heading">Stars alumni — Young Guns from other teams</h3>
            <p className="checklist-intro">
              Young Guns rookie cards printed under a different NHL team, for players who at some point in their
              career also played for the Dallas Stars — for example Mikko Rantanen's actual rookie card is a
              2015-16 Upper Deck <strong>Colorado Avalanche</strong> card. Click a player for the Dallas Stars
              connection. This list is hand-researched and verified card-by-card rather than pulled from a single
              team-filtered TCDB page, so it's more likely to have gaps than the checklist above — if you spot a
              Stars alumnus with a Young Guns card from another team that isn't listed here, it can be added.
            </p>
            {alumniYgProgress.perSet.length === 0 ? (
              <p className="checklist-empty">No alumni Young Guns identified yet.</p>
            ) : (
              alumniYgProgress.perSet.map((set) => (
                <ChecklistYearSection
                  key={`alumni-${set.year}`}
                  set={set}
                  query={ygQuery}
                  hideCollected={ygHideCollected}
                  isExpanded={!!expandedAlumniYgYears[set.year]}
                  onToggleExpand={() => toggleAlumniYgYearExpanded(set.year)}
                  checklistMatches={alumniChecklistMatches}
                  checklistManual={checklistManual}
                  onOpenDetail={openDetail}
                  onOpenInfo={setChecklistInfoEntry}
                  onToggleManual={toggleManualOwned}
                  labelSuffix="Young Guns"
                  mixedTeams
                  showSeries
                />
              ))
            )}
          </div>
        ) : activeTab === "review" ? (
          <ReviewPanel
            flaggedCards={cards.filter((c) => c.needsReview)}
            onToggleNeedsReview={toggleNeedsReview}
            onOpenDetail={openDetail}
            onCardsMayHaveChanged={reloadCardsFromStorage}
            getDisplay={getDisplay}
          />
        ) : activeTab === "autoimport" ? (
          <AutoImportPanel onCardsMayHaveChanged={reloadCardsFromStorage} />
        ) : activeTab === "sellers" ? (
          <SellerPanel
            cards={sellerEligibleCards}
            bundles={sellerBundles}
            foundIds={sellerFoundIds}
            cantFindIds={sellerCantFindIds}
            getDisplay={getDisplay}
            onOpenDetail={openDetail}
            onCreateBundle={createSellerBundle}
            onDissolveBundle={dissolveSellerBundle}
            onMarkBundleSold={markSellerBundleSold}
            onReturnBundleToGallery={returnSellerBundleToGallery}
            onToggleSold={toggleSold}
            onToggleFound={toggleSellerFound}
            onToggleCantFind={toggleSellerCantFind}
          />
        ) : !loaded ? (
          <div className="empty-state"><p>Loading your collection...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>{cards.length === 0 ? "No cards yet. Scan your first card to start the ledger." : "Nothing matches that search or filter."}</p>
            {cards.length === 0 && (
              <button className="scan-cta" style={{ margin: "0 auto" }} onClick={openScan}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="14" height="18" rx="2" transform="rotate(-8 10 13)" />
                  <circle cx="18" cy="18" r="4" />
                  <path d="M18 16.5v3M16.5 18h3" />
                </svg>
                Scan a card
              </button>
            )}
          </div>
        ) : viewMode === "gallery" ? (
          <div className="gallery-grid">
            {(galleryEditMode
              ? filtered.map((c) => ({ card: c, count: 1, key: c.id }))
              : groupedGalleryCards.map((g) => ({ card: g.card, count: g.count, key: g.key }))
            ).map(({ card: c, count, key }) => {
              if (galleryEditMode) {
                return (
                  <div className="tile tile-editmode" key={key}>
                    <div className="tile-rotate-row">
                      {["front", "back"].map((face) => {
                        const localImg = face === "front" ? c.personalFront || c.purchasePhotoFront : c.personalBack || c.purchasePhotoBack;
                        const onlineImg = face === "front" ? c.onlineFrontUrl : c.onlineBackUrl;
                        const rotKey = `${c.id}-${face}`;
                        const isRotating = rotatingImage === rotKey;
                        return (
                          <div className="tile-rotate-col" key={face}>
                            <div className="tile-img-wrap">
                              <CardImage src={localImg || onlineImg} alt={`${c.player} ${face}`} fallbackLabel={face === "front" ? "No front photo" : "No back photo"} />
                              {localImg && (
                                <button
                                  type="button"
                                  className="tile-rotate-btn"
                                  disabled={isRotating}
                                  onClick={() => rotateGalleryImage(c.id, face)}
                                  title={`Rotate ${face} 90° clockwise`}
                                >
                                  {isRotating ? "…" : "⟳"}
                                </button>
                              )}
                            </div>
                            <div className="tile-rotate-label">{face === "front" ? "Front" : "Back"}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="tile-info">
                      <div className="tile-player">{c.player}</div>
                      <div className="tile-sub">{[c.year, c.brand, c.set].filter(Boolean).join(" · ")}</div>
                    </div>
                  </div>
                );
              }
              const pair = getDisplay(c);
              const shown = pair.front || pair.back;
              const hasBoth = (c.onlineFrontUrl || c.onlineBackUrl) && (c.personalFront || c.personalBack);
              // Each tile shows its own card's team colors, always -- not only while the team
              // filter narrows the view to one team (that's a separate, additional highlight --
              // see teamTheme/the subtotal banner). Dallas Stars / Minnesota North Stars cards,
              // AND any card that's actually tracked as a Stars alumnus's Young Guns card (see
              // isStarsCollectionCard/starsRelatedCardIds above), always render in Stars green --
              // Kaleb wants that regardless of which team is actually printed on the card itself.
              // Everything else falls back to that card's own printed team, or the app's default
              // navy/gold accent if that team isn't in TEAM_THEMES either.
              const cardTheme = isStarsCollectionCard(c) ? TEAM_THEMES["Dallas Stars"] : TEAM_THEMES[c.team] || null;
              const cardThemeStyle = cardTheme ? { "--card-team-primary": cardTheme.primary } : undefined;
              return (
                <div className="tile" key={key} style={cardThemeStyle} onClick={() => openDetail(c)}>
                  <div className={landscapeCardIds.has(c.id) ? "tile-img-wrap tile-img-wrap-landscape" : "tile-img-wrap"}>
                    <CardImage src={shown} alt={c.player} fallbackLabel="No photo yet" onOrientation={(isLandscape) => markTileOrientation(c.id, isLandscape)} />
                    <button
                      type="button"
                      className="tile-flag-btn"
                      onClick={(e) => { e.stopPropagation(); toggleNeedsReview(c.id); }}
                      title="Flag for review"
                    >
                      ⚑
                    </button>
                    {hasBoth && (
                      <div className="tile-source-toggle">
                        <button className={c.thumbnailSource !== "personal" ? "active" : ""} onClick={(e) => { e.stopPropagation(); setThumbnailSource(c.id, "online"); }}>Online</button>
                        <button className={c.thumbnailSource === "personal" ? "active" : ""} onClick={(e) => { e.stopPropagation(); setThumbnailSource(c.id, "personal"); }}>Mine</button>
                      </div>
                    )}
                  </div>
                  <div className="tile-info">
                    <div className="tile-player">{c.player}</div>
                    <div className="tile-sub">{[c.year, c.brand, c.set].filter(Boolean).join(" · ")}</div>
                    <div className="tile-value">{moneyOrDash(c.value)}</div>
                    {count > 1 && <span className="tile-dupe-badge" title={`${count} copies of this card in your ledger`}>×{count}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <table>
            <thead><tr><th></th><th>Player</th><th>Sport / Year</th><th>Brand</th><th>Set</th><th>Value</th></tr></thead>
            <tbody>
              {filtered.map((c) => {
                const pair = getDisplay(c);
                const cardTheme = isStarsCollectionCard(c) ? TEAM_THEMES["Dallas Stars"] : TEAM_THEMES[c.team] || null;
                return (
                  <tr key={c.id} style={cardTheme ? { "--card-team-primary": cardTheme.primary } : undefined} onClick={() => openDetail(c)}>
                    <td><div className="thumb-cell"><CardImage src={pair.front || pair.back} alt={c.player} fallbackLabel="—" /></div></td>
                    <td><div className="player-cell">{c.player}</div>{c.team && <div className="sub-cell">{c.team}</div>}</td>
                    <td><div>{c.sport}</div><div className="sub-cell">{c.year}</div></td>
                    <td>{c.brand || "—"}</td>
                    <td><div>{c.set}{c.cardNumber ? ` #${c.cardNumber}` : ""}</div></td>
                    <td className="value-cell">{moneyOrDash(c.value)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {checklistInfoEntry && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setChecklistInfoEntry(null); }}>
          <div className="detail-card checklist-info-card">
            <h2 className="detail-player">{checklistInfoEntry.player}</h2>
            <p className="detail-team">{checklistInfoEntry.team}</p>
            <div className="detail-facts">
              <div className="detail-fact"><span className="detail-fact-label">Year</span><span>{checklistInfoEntry.year}</span></div>
              <div className="detail-fact"><span className="detail-fact-label">Brand / set</span><span>{checklistInfoEntry.setName}</span></div>
              <div className="detail-fact"><span className="detail-fact-label">Card number</span><span>#{checklistInfoEntry.number}</span></div>
              <div className="detail-fact"><span className="detail-fact-label">In your ledger?</span><span>{checklistInfoEntry.manual ? "Marked owned by hand" : "Not yet"}</span></div>
            </div>
            {checklistInfoEntry.note && <p className="checklist-info-note">{checklistInfoEntry.note}</p>}
            <p className="checklist-info-note">
              {checklistInfoEntry.manual
                ? "You've checked this off by hand -- there's no scanned card behind it yet, so there's nothing more to show. Scan it any time to file the real thing."
                : "This one hasn't been matched to anything in your ledger yet. Scan it (or bring it in through Auto Import) and it'll check itself off automatically."}
            </p>
            <div className="form-actions">
              <span />
              <div className="form-actions-right">
                <button type="button" className="btn-secondary" onClick={() => setChecklistInfoEntry(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showScan && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) closeScan(); }}>
          <div className="scan-card">
            <h2>Scan a card</h2>
            <p className="form-sub">Upload the front and back — I'll identify the card and file it for you.</p>

            {identifyRawPreviews.length > 0 && (
              <div className="scan-preview-row">
                {identifyRawPreviews.map((src, i) => (
                  <div className="scan-preview" key={i}><img src={src} alt={`upload ${i + 1}`} /></div>
                ))}
              </div>
            )}

            <input type="file" accept="image/*" id="scan-files-input" multiple style={{ display: "none" }} onChange={(e) => handleIdentifyFilesChange(e, { forNewCard: true })} />
            <label htmlFor="scan-files-input" className="dropzone">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
                <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
              </svg>
              {identifying ? "Reading your card..." : "Choose front & back photos"}
            </label>

            {identifying && <p className="scan-status">This takes a few seconds — identifying and searching for reference images.</p>}
            {identifyError && <p className="identify-error">{identifyError}</p>}

            <button className="scan-cancel" onClick={closeScan}>Cancel</button>
          </div>
        </div>
      )}

      {showDetail && detailCard && (() => {
        const pair = getDisplay(detailCard);
        const shown = detailFlipped ? (pair.back || pair.front) : (pair.front || pair.back);
        const hasBoth = (detailCard.onlineFrontUrl || detailCard.onlineBackUrl) && (detailCard.personalFront || detailCard.personalBack);
        const canRotate = getDisplaySource(detailCard) !== "online" && !!shown;
        return (
          <div className="overlay align-top" onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}>
            <div className="detail-card">
              <div className="detail-img-wrap">
                <CardImage src={shown} alt={detailCard.player} fallbackLabel="No photo yet" />
                {canRotate && (
                  <button className="tile-rotate-btn" title="Rotate 90° clockwise" onClick={rotateDetailImage}>⟳</button>
                )}
                {(pair.front && pair.back) && (
                  <button className="tile-flip-btn" onClick={() => setDetailFlipped((f) => !f)}>
                    {detailFlipped ? "Front" : "Back"}
                  </button>
                )}
                {hasBoth && (
                  <div className="tile-source-toggle">
                    <button className={detailCard.thumbnailSource !== "personal" ? "active" : ""} onClick={() => { setThumbnailSource(detailCard.id, "online"); setDetailCard({ ...detailCard, thumbnailSource: "online" }); }}>Online</button>
                    <button className={detailCard.thumbnailSource === "personal" ? "active" : ""} onClick={() => { setThumbnailSource(detailCard.id, "personal"); setDetailCard({ ...detailCard, thumbnailSource: "personal" }); }}>Mine</button>
                  </div>
                )}
              </div>

              <h2 className="detail-player">{detailCard.player}</h2>
              {detailCard.team && <p className="detail-team">{detailCard.team}</p>}

              <div className="detail-facts">
                <div className="detail-fact"><span className="detail-fact-label">Sport</span><span>{detailCard.sport}</span></div>
                <div className="detail-fact"><span className="detail-fact-label">Year</span><span>{detailCard.year || "—"}</span></div>
                <div className="detail-fact"><span className="detail-fact-label">Brand</span><span>{detailCard.brand || "—"}</span></div>
                <div className="detail-fact"><span className="detail-fact-label">Set</span><span>{detailCard.set || "—"}</span></div>
                <div className="detail-fact"><span className="detail-fact-label">Card number</span><span>{detailCard.cardNumber || "—"}</span></div>
                <div className="detail-fact"><span className="detail-fact-label">Estimated value</span><span>{moneyOrDash(detailCard.value)}</span></div>
              </div>

              <div className="section-label">Recent sales</div>
              <div className="sales-box">
                {salesLoading && <p className="scan-status">Searching for recent sale listings...</p>}
                {salesError && <p className="identify-error">{salesError}</p>}
                {!salesLoading && !salesError && salesData && (
                  salesData.sales && salesData.sales.length > 0 ? (
                    <>
                      <ul className="sales-list">
                        {salesData.sales.map((s, i) => (
                          <li key={i}>
                            <span className="sales-price">{moneyOrDash(s.price)}</span>
                            <span className="sales-meta">{[s.source, s.date].filter(Boolean).join(" · ")}</span>
                          </li>
                        ))}
                      </ul>
                      {salesData.note && <p className="sales-note">{salesData.note}</p>}
                    </>
                  ) : (
                    <p className="sales-note">No recent sales found for this exact card.{salesData.note ? " " + salesData.note : ""}</p>
                  )
                )}
                {!salesLoading && !salesError && !salesData && (
                  <p className="sales-note">Not looked up yet — each lookup uses a small amount of paid API credit, so it only runs when you ask for it.</p>
                )}
                {!salesLoading && salesData && salesData.fetchedAt && (
                  <p className="sales-note">Looked up {timeAgo(salesData.fetchedAt)}.</p>
                )}
                {!salesLoading && (
                  <button type="button" className="link-btn" onClick={() => loadSales(detailCard, !!salesData)}>
                    {salesData ? "Refresh" : salesError ? "Try again" : "Look up recent sales"}
                  </button>
                )}
              </div>

              <div className="form-actions">
                <div className="form-actions-left">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => { toggleNeedsReview(detailCard.id); setDetailCard({ ...detailCard, needsReview: !detailCard.needsReview }); }}
                  >
                    {detailCard.needsReview ? "Remove from review" : "Flag for review"}
                  </button>
                  {/* Hidden for a card that's part of a persisted seller bundle (round 31) -- that
                      card's sold/not-sold state is managed at the bundle level from the Sellers
                      tab instead, so this toggle only ever applies to an un-bundled single card. */}
                  {!isStarsCollectionCard(detailCard) && !bundledCardIds.has(detailCard.id) && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => { toggleSold(detailCard.id); setDetailCard({ ...detailCard, sold: !detailCard.sold }); }}
                    >
                      {detailCard.sold ? "Return to gallery" : "Mark sold"}
                    </button>
                  )}
                </div>
                <div className="form-actions-right">
                  <button type="button" className="btn-secondary" onClick={closeDetail}>Close</button>
                  <button type="button" className="btn-primary" onClick={() => { closeDetail(); openEditForm(detailCard); }}>Edit</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showEdit && (
        <div className="overlay align-top" onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div className="form-card">
            <h2>{editingId ? "Edit card" : "Verify card details"}</h2>
            <p className="form-sub">
              {editingId
                ? "Fix anything the scan got wrong, or rescan with new photos."
                : "Here's what I found. Check the year and photo orientation especially, then add it to the ledger."}
            </p>

            <div className="section-label">{editingId ? "Rescan photos" : "Photos"}</div>
            <div className="identify-box">
              <div className="identify-preview-pair">
                <div className="preview-col">
                  <div className="identify-preview"><CardImage src={identifyFrontPreview || form.personalFront || form.purchasePhotoFront || form.onlineFrontUrl} alt="front preview" fallbackLabel="Front" /></div>
                  {(identifyFrontPreview || form.personalFront || form.purchasePhotoFront) && <button type="button" className="rotate-btn" onClick={() => nudgeRotate("front")}>⟳ Rotate</button>}
                  {form.purchasePhotoFront && !form.personalFront && <span className="phone-photo-tag">📷 phone photo</span>}
                </div>
                <div className="preview-col">
                  <div className="identify-preview"><CardImage src={identifyBackPreview || form.personalBack || form.purchasePhotoBack || form.onlineBackUrl} alt="back preview" fallbackLabel="Back" /></div>
                  {(identifyBackPreview || form.personalBack || form.purchasePhotoBack) && <button type="button" className="rotate-btn" onClick={() => nudgeRotate("back")}>⟳ Rotate</button>}
                  {form.purchasePhotoBack && !form.personalBack && <span className="phone-photo-tag">📷 phone photo</span>}
                </div>
              </div>
              <div className="identify-controls">
                <input type="file" accept="image/*" id="edit-scan-input" multiple style={{ display: "none" }} onChange={(e) => handleIdentifyFilesChange(e, { forNewCard: false })} />
                <label htmlFor="edit-scan-input" className="identify-btn">{identifying ? "Identifying..." : "Choose new photos"}</label>
                {((identifyFrontPreview || form.personalFront) && (identifyBackPreview || form.personalBack)) && (
                  <button type="button" className="link-btn" onClick={swapIdentifiedFrontBack}>That's backwards — swap front/back</button>
                )}
                {identifyConfidence && (
                  <span className="confidence-badge">
                    {identifyConfidence} confidence — check the fields below{identifySearched ? " (cross-checked online)" : " (from photo alone, no search needed)"}
                  </span>
                )}
                {identifyError && <p className="identify-error">{identifyError}</p>}
                {(phoneOriginNote || form.purchasePhotoFront || form.purchasePhotoBack) && (
                  <p className="phone-photo-note">
                    📷 That looks like a phone photo, not a scan — I've used a database photo for the ledger image instead and kept yours as a reference. Only real scans become the official card image.{" "}
                    <button type="button" className="link-btn" onClick={useMyPhotoAsScanAnyway}>Actually, use it as my scan</button>
                  </p>
                )}
              </div>
            </div>

            <div className="section-label">Card details</div>
            <div className="field-grid">
              <div className="field full"><label>Player</label><input value={form.player} onChange={(e) => setForm({ ...form, player: e.target.value })} autoFocus /></div>
              <div className="field"><label>Team</label><input value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} /></div>
              <div className="field"><label>Sport</label>
                <select value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value })}>
                  {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field"><label>Year</label><input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="e.g. 1989" /></div>
              <div className="field"><label>Brand</label><input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Upper Deck" list="brand-options" /></div>
              <div className="field"><label>Set</label><input value={form.set} onChange={(e) => setForm({ ...form, set: e.target.value })} placeholder="e.g. Series 1" /></div>
              <div className="field"><label>Card number</label><input value={form.cardNumber} onChange={(e) => setForm({ ...form, cardNumber: e.target.value })} /></div>
              <div className="field"><label>Estimated value</label><input type="text" inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="Optional" /></div>
            </div>

            <div className="section-label">Photos</div>
            <div className="photo-pair">
              <div className="photo-slot">
                <h4>Front</h4>
                <div className="photo-pair-row">
                  <div className="photo-thumb"><CardImage src={form.onlineFrontUrl} fallbackLabel="No online image" /></div>
                  <div className="photo-thumb"><CardImage src={form.personalFront} fallbackLabel="No photo" /></div>
                </div>
                <div className="photo-pair-row" style={{ marginTop: 6 }}>
                  <div className="photo-pair-col"><p className="photo-label">Online</p></div>
                  <div className="photo-pair-col"><p className="photo-label">Your photo</p><input type="file" accept="image/*" onChange={(e) => handlePersonalUpload("front", e)} /></div>
                </div>
              </div>
              <div className="photo-slot">
                <h4>Back</h4>
                <div className="photo-pair-row">
                  <div className="photo-thumb"><CardImage src={form.onlineBackUrl} fallbackLabel="No online image" /></div>
                  <div className="photo-thumb"><CardImage src={form.personalBack} fallbackLabel="No photo" /></div>
                </div>
                <div className="photo-pair-row" style={{ marginTop: 6 }}>
                  <div className="photo-pair-col"><p className="photo-label">Online</p></div>
                  <div className="photo-pair-col"><p className="photo-label">Your photo</p><input type="file" accept="image/*" onChange={(e) => handlePersonalUpload("back", e)} /></div>
                </div>
              </div>
            </div>
            {((form.onlineFrontUrl || form.onlineBackUrl) && (form.personalFront || form.personalBack)) && (
              <div className="source-toggle">
                <button type="button" className={form.thumbnailSource !== "personal" ? "active" : ""} onClick={() => setForm({ ...form, thumbnailSource: "online" })}>Use online as thumbnail</button>
                <button type="button" className={form.thumbnailSource === "personal" ? "active" : ""} onClick={() => setForm({ ...form, thumbnailSource: "personal" })}>Use my photo as thumbnail</button>
              </div>
            )}

            <div className="form-actions">
              {editingId ? (
                <button type="button" className="btn-danger" onClick={() => handleDelete(editingId)}>Delete card</button>
              ) : <span />}
              <div className="form-actions-right">
                <button type="button" className="btn-secondary" onClick={closeEdit}>{editingId ? "Cancel" : "Discard"}</button>
                <button type="button" className="btn-primary" onClick={saveCard}>{editingId ? "Save changes" : "Add to ledger"}</button>
              </div>
            </div>
            {formError && <p className="identify-error" style={{ textAlign: "right", marginTop: 8 }}>{formError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
