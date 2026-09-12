import { useState, useEffect, useMemo, useRef } from "react";

const SPORTS = ["Baseball", "Basketball", "Football", "Hockey", "Soccer", "Other"];
// A starter list for the brand datalist -- just suggestions, any brand can still be typed
// freehand. Combined at render time with whatever brands already appear in the collection.
const KNOWN_BRANDS = ["Upper Deck", "Topps", "O-Pee-Chee", "Panini", "Score", "Leaf", "Parkhurst", "In The Game", "SP Authentic", "Ultimate Collection", "Black Diamond"];
const STORAGE_KEY = "card-ledger-entries";

const CHECKLIST_MANUAL_KEY = "card-ledger-checklist-manual";
// Bulk Add's in-progress queue (pairing/identify results, review status) -- persisted so a batch
// survives switching tabs, closing the app, or coming back the next day, instead of only living
// in memory for as long as the Bulk Add tab happens to stay mounted.
const BULK_QUEUE_KEY = "card-ledger-bulk-queue";
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

const PHOTO_FIELDS = ["personalFront", "personalBack", "purchasePhotoFront", "purchasePhotoBack"];

// Card photos are saved as raw JPEG files on the server rather than embedded as base64 in the
// card JSON (see server.js's /api/photos route) -- this uploads one photo and returns the URL to
// store on the card in its place. Passing the field's previous value as `previousUrl` lets a
// rotate/replace overwrite the same file in place instead of leaving the old one orphaned on disk.
async function uploadPhoto(dataUrl, previousUrl) {
  const res = await fetch("/api/photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl, previousUrl: previousUrl || null }),
  });
  if (!res.ok) throw new Error("photo upload failed");
  const data = await res.json();
  return data.url;
}

// Called once, right before a card is actually persisted. Only fields that are still a fresh
// data: URL (i.e. changed during this edit -- swap/thumbnailSource-only edits never produce one)
// get uploaded; anything already a /photos/... URL (untouched this edit) passes through as-is.
async function resolvePhotoFields(fields, previousCard) {
  const out = { ...fields };
  for (const key of PHOTO_FIELDS) {
    if (typeof out[key] === "string" && out[key].startsWith("data:")) {
      out[key] = await uploadPhoto(out[key], previousCard ? previousCard[key] : null);
    }
  }
  return out;
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

// --- Appraise: identify several cards from a single photo, for a quick on-the-spot value check ---

const APPRAISE_PROMPT = `You are looking at a single photo that may contain SEVERAL different sports trading cards laid out together (for example, cards someone is deciding whether to buy at a card show).

1. Identify EVERY individual card visible in the photo, left-to-right and top-to-bottom -- including ones that are partially obscured, small, or hard to read. Include a row for each card you can distinguish rather than skipping it. For each one, read player name, team, sport, year, card number, the manufacturer/brand (e.g. "Upper Deck", "Topps", "Panini"), and the specific set/subset name separately from the brand, as best you can from this one photo of the front.
2. For each card, give a ROUGH current market value in USD as a plain number, based on your general knowledge of the hobby -- this is a quick on-the-spot ballpark, not a live-market lookup, and the app tells the person that. Use null only if you genuinely have no basis to even guess.
3. Leave "frontImageUrl" as null -- there's no search here to find one from.
4. Rate your confidence per card as "high", "medium", or "low". A card you're unsure about still gets a row with confidence "low" and your best guess at each field -- never leave a visible card out because you're not fully sure what it is.

You MUST always respond with the JSON object below and nothing else -- never an apology, a refusal, or a request for a clearer photo. Only return an empty "cards" array if you genuinely cannot make out any card-shaped objects at all; if you can see cards, describe them as best you can even under uncertainty.

Respond with ONLY a raw JSON object, no markdown fences, no commentary, in exactly this shape:
{"cards":[{"player":"","team":"","sport":"","year":"","brand":"","set":"","cardNumber":"","estimatedValue":null,"frontImageUrl":null,"confidence":""}]}

"sport" must be one of: Baseball, Basketball, Football, Hockey, Soccer, Other.`;

async function callAppraiseOnce(dataUrl) {
  await waitForSharedCooldown();
  const toBase64 = (d) => d.slice(d.indexOf(",") + 1);
  const content = [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: toBase64(dataUrl) } },
    { type: "text", text: APPRAISE_PROMPT },
  ];
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL_ID,
      // No web_search tool here on purpose: searching live for every card in a 9+ card photo
      // in one turn was blowing the response budget and coming back truncated/unparseable --
      // that's almost certainly why whole batches were failing or only the first card or two
      // came back. A pure-vision, general-knowledge estimate is far more reliable for "give me
      // a rough number on all of these right now"; a precise, sourced value is one tap away
      // per-card once something's actually added to the ledger (that flow does search live).
      max_tokens: 4000,
      // See callIdentifyOnce's no-search branch: claude-sonnet-5 runs adaptive thinking by
      // default unless told otherwise, and this is a one-shot vision extraction with no search
      // or multi-step reasoning involved -- turn it off.
      thinking: { type: "disabled" },
      messages: [{ role: "user", content }],
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
  const parsed = JSON.parse(clean.slice(jsonStart, jsonEnd + 1));
  return Array.isArray(parsed.cards) ? parsed.cards : [];
}

async function appraiseMultipleCards(dataUrl) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await callAppraiseOnce(dataUrl);
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await wait(err.isRateLimit ? 5000 : 1200);
    }
  }
  throw lastErr;
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
                  {series && <span className="checklist-series-tag" title="Which pack wave/series this card actually shipped in">{series}</span>}
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

function CardImage({ src, alt, fallbackLabel }) {
  const [errored, setErrored] = useState(false);
  useEffect(() => setErrored(false), [src]);
  if (!src || errored) {
    return (
      <div className="img-fallback">
        <span>{fallbackLabel || "No photo"}</span>
      </div>
    );
  }
  return <img src={src} alt={alt} onError={() => setErrored(true)} />;
}

function naturalFilenameSort(a, b) {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

// --- Bulk Add: a folder (or multi-select) of scans, paired front/back in the order they
// were chosen, identified in a batch, then reviewed and confirmed one at a time. ---
function BulkAddPanel({ onAddCard, onGoToGallery }) {
  const [stage, setStage] = useState("select"); // select | pairing | identifying | review | done
  const [queue, setQueue] = useState([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [reviewIndex, setReviewIndex] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [zoomSrc, setZoomSrc] = useState(null);
  const [restoredFromStorage, setRestoredFromStorage] = useState(false);
  // Lifetime estimated API spend across every identify/appraise/price-lookup call ever made,
  // refreshed whenever this screen is showing "select" (i.e. right before Kaleb starts a new
  // batch, and right after one finishes) -- not live-updated mid-batch, since the running total
  // for the batch actually in progress is shown separately (batchCostUsd below, from the queue
  // itself).
  const [lifetimeUsage, setLifetimeUsage] = useState(null);

  const watchSupported = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function" && typeof indexedDB !== "undefined";
  const [watchFolderName, setWatchFolderName] = useState(null);
  const [watchStatus, setWatchStatus] = useState("idle"); // idle | checking | needs-permission | error
  const [watchMessage, setWatchMessage] = useState(null);

  // Refreshed every time this screen shows "select" -- i.e. on first load, and again whenever a
  // batch finishes and Kaleb lands back here to start another one -- so the lifetime total shown
  // there reflects whatever was just spent without needing a full page reload.
  useEffect(() => {
    if (stage !== "select") return;
    (async () => {
      try {
        const saved = await window.storage.get(USAGE_LOG_KEY, false);
        setLifetimeUsage(saved && saved.value ? JSON.parse(saved.value) : { totalCostUsd: 0, totalCalls: 0 });
      } catch (e) {
        // best-effort only
      }
    })();
  }, [stage]);

  // On mount: first restore any in-progress batch from a previous visit (so switching tabs, or
  // closing and reopening the app, doesn't lose review progress); only if nothing was in
  // progress do we check a connected watch folder for new scans dropped in since last time.
  useEffect(() => {
    (async () => {
      let hadInProgressBatch = false;
      try {
        const saved = await window.storage.get(BULK_QUEUE_KEY, false);
        if (saved && saved.value) {
          const items = JSON.parse(saved.value);
          if (Array.isArray(items) && items.length > 0) {
            const incompleteExists = items.some((it) => it.status !== "saved" && it.status !== "skipped");
            if (incompleteExists) {
              // an item stuck mid-"retrying" from an interrupted session can't still be in
              // flight -- treat it as a normal error so it's clearly actionable again
              const cleaned = items.map((it) => (it.status === "retrying" ? { ...it, status: "error" } : it));
              setQueue(cleaned);
              setSavedCount(cleaned.filter((it) => it.status === "saved").length);
              setSkippedCount(cleaned.filter((it) => it.status === "skipped").length);
              setRestoredFromStorage(true);
              const stillPending = cleaned.some((it) => it.status === "pending");
              if (stillPending) {
                // The batch never finished its first identify pass -- most likely the tab
                // crashed, was closed, or ran out of memory partway through. Resume by
                // identifying just the cards that never got a result; cards that already
                // succeeded or failed are left exactly as they are, so nothing already
                // identified (and paid for) gets thrown away or billed again.
                runBulkIdentifyItems(cleaned);
              } else {
                setStage("review");
                const firstOpen = cleaned.findIndex((it) => it.status !== "saved" && it.status !== "skipped");
                setReviewIndex(firstOpen === -1 ? 0 : firstOpen);
              }
              hadInProgressBatch = true;
            } else {
              // a leftover fully-finished batch nobody cleared with "Start another batch" --
              // no reason to keep carrying it around
              await window.storage.set(BULK_QUEUE_KEY, "", false).catch(() => {});
            }
          }
        }
      } catch (e) {
        // best-effort restore; worst case the user just starts a fresh batch
      }

      if (hadInProgressBatch || !watchSupported) return;
      try {
        const handle = await loadWatchHandle();
        if (!handle) return;
        setWatchFolderName(handle.name);
        const perm = await handle.queryPermission({ mode: "read" });
        if (perm === "granted") {
          checkWatchedFolder(handle);
        } else {
          setWatchStatus("needs-permission");
        }
      } catch (e) {
        // a stale/revoked handle just means the watch card won't auto-check -- not fatal
      }
    })();
    // eslint-disable-next-line
  }, []);

  // Persist the queue during identification too, not just once it reaches review/done. Each
  // identify call costs real API usage -- previously, a crashed tab or a big batch getting
  // interrupted partway through meant every card identified successfully up to that point (and
  // paid for) was simply thrown away, because nothing was saved until the *entire* batch
  // finished. This fires once per completed card (each identify call takes several seconds
  // thanks to web_search, so this isn't a hot loop) -- the resume logic on mount above picks up
  // any cards still left at "pending" from exactly where an interrupted batch left off, without
  // re-identifying (and re-paying for) cards that already got a result.
  useEffect(() => {
    if (stage !== "identifying" && stage !== "review" && stage !== "done") return;
    const toSave = queue.length ? JSON.stringify(queue) : "";
    window.storage.set(BULK_QUEUE_KEY, toSave, false).catch(() => {});
  }, [queue, stage]);

  async function connectWatchFolder() {
    setWatchStatus("connecting");
    setWatchMessage(null);
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      await saveWatchHandle(handle);
      setWatchFolderName(handle.name);
      setWatchStatus("idle");
      setWatchMessage(null);
      // Treat whatever's already sitting in the folder as "already seen" -- connecting a folder
      // should only start noticing NEW scans from here on, not immediately queue everything
      // that happens to already be in there.
      const existing = [];
      for await (const entry of handle.values()) {
        if (entry.kind === "file" && /\.(jpe?g|jpg|png|webp)$/i.test(entry.name)) existing.push(entry.name);
      }
      await window.storage.set(WATCH_SEEN_KEY, JSON.stringify(existing), false);
    } catch (e) {
      // A cancelled picker throws AbortError -- that's the user changing their mind, not a
      // problem, so stay quiet. Anything else (SecurityError from a locked-down context,
      // NotAllowedError, or any other failure) gets surfaced for real instead of vanishing
      // silently, which is what made this button look broken before.
      if (e && e.name === "AbortError") {
        setWatchStatus("idle");
        return;
      }
      setWatchStatus("error");
      setWatchMessage(
        e && e.name === "SecurityError"
          ? "This app can't open a folder picker in this window (blocked for security reasons). Watch folders need a regular top-level browser tab."
          : `Couldn't open the folder picker${e && e.message ? ` (${e.message})` : ""}.`
      );
    }
  }

  async function reconnectWatchFolder() {
    try {
      const handle = await loadWatchHandle();
      if (!handle) return connectWatchFolder();
      const perm = await handle.requestPermission({ mode: "read" });
      if (perm === "granted") {
        checkWatchedFolder(handle);
      } else {
        setWatchStatus("needs-permission");
      }
    } catch (e) {
      setWatchStatus("error");
      setWatchMessage(`Couldn't reconnect to the watched folder${e && e.message ? ` (${e.message})` : ""}.`);
    }
  }

  async function disconnectWatchFolder() {
    try {
      await clearWatchHandle();
    } catch (e) {
      // ignore
    }
    setWatchFolderName(null);
    setWatchStatus("idle");
    setWatchMessage(null);
  }

  async function manualCheckWatchFolder() {
    const handle = await loadWatchHandle().catch(() => null);
    if (!handle) return;
    const perm = await handle.queryPermission({ mode: "read" }).catch(() => "prompt");
    if (perm === "granted") checkWatchedFolder(handle);
    else reconnectWatchFolder();
  }

  // Scans the watched folder for files not in WATCH_SEEN_KEY yet, pairs and identifies them
  // automatically (no manual pairing screen -- these are meant to be hands-off), and lands on
  // the same review screen a manual batch would, ready to approve.
  async function checkWatchedFolder(handle) {
    setWatchStatus("checking");
    try {
      const seenRaw = await window.storage.get(WATCH_SEEN_KEY, false).catch(() => null);
      const seen = new Set(seenRaw && seenRaw.value ? JSON.parse(seenRaw.value) : []);
      const found = [];
      for await (const entry of handle.values()) {
        if (entry.kind !== "file") continue;
        if (!/\.(jpe?g|jpg|png|webp)$/i.test(entry.name)) continue;
        if (seen.has(entry.name)) continue;
        found.push(entry);
      }
      found.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
      if (found.length === 0) {
        setWatchStatus("idle");
        setWatchMessage("No new scans in the watched folder.");
        return;
      }
      const files = await Promise.all(found.map((h) => h.getFile()));
      const nextSeen = new Set(seen);
      files.forEach((f) => nextSeen.add(f.name));
      await window.storage.set(WATCH_SEEN_KEY, JSON.stringify(Array.from(nextSeen)), false);
      setWatchStatus("idle");
      setWatchMessage(`Found ${files.length} new scan${files.length === 1 ? "" : "s"} -- identifying now.`);
      const items = await pairFiles(files);
      await runBulkIdentifyItems(items);
    } catch (e) {
      setWatchStatus("error");
      setWatchMessage(
        `Couldn't read the watched folder${e && e.message ? ` (${e.message})` : ""} -- try reconnecting it below.`
      );
    }
  }

  // Builds queue items from a set of files, converting each straight to data URLs (front/back
  // thumbnail + a higher-res copy used both for AI identification and as the final saved image)
  // and reading EXIF while the real File objects are still available. From this point on the
  // queue is plain, storable data -- it no longer depends on the original File handles staying
  // alive, which is what makes a batch resumable after a tab switch or a reload. Returns the
  // final converted items (not just via setQueue) so a caller can chain straight into
  // runBulkIdentifyItems without waiting on a React state update to land.
  async function pairFiles(fileList) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    files.sort(naturalFilenameSort);
    if (files.length === 0) return [];
    const rawPairs = [];
    for (let i = 0; i < files.length; i += 2) {
      rawPairs.push({ frontFile: files[i], backFile: files[i + 1] || null });
    }
    const skeleton = rawPairs.map((p, i) => ({
      id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
      hasBack: !!p.backFile,
      frontThumb: null,
      backThumb: null,
      frontMain: null,
      backMain: null,
      frontApi: null,
      backApi: null,
      frontIsPhone: false,
      backIsPhone: false,
      status: "pending",
    }));
    setQueue(skeleton);
    const converted = await Promise.all(
      rawPairs.map(async (p) => {
        let frontThumb = null;
        let backThumb = null;
        let frontMain = null;
        let backMain = null;
        // Smaller, API-only copies used solely for AI identification -- kept separate from
        // frontMain/backMain (which stay at full 1280px for permanent ledger storage) so cutting
        // identify-call image tokens never degrades the quality of the saved card photos.
        let frontApi = null;
        let backApi = null;
        let frontIsPhone = false;
        let backIsPhone = false;
        try {
          frontThumb = await fileToResizedDataUrl(p.frontFile, 240, 0.7);
          frontMain = await fileToResizedDataUrl(p.frontFile, 1280, 0.85);
          frontApi = await fileToResizedDataUrl(p.frontFile, 1024, 0.85);
          frontIsPhone = (await detectPhotoSource(p.frontFile)).isLikelyPhone;
        } catch (e) {
          // leave nulls -- identifyOneItem treats a missing front image as its own error
        }
        if (p.backFile) {
          try {
            backThumb = await fileToResizedDataUrl(p.backFile, 240, 0.7);
            backMain = await fileToResizedDataUrl(p.backFile, 1280, 0.85);
            backApi = await fileToResizedDataUrl(p.backFile, 1024, 0.85);
            backIsPhone = (await detectPhotoSource(p.backFile)).isLikelyPhone;
          } catch (e) {
            // ditto for the back
          }
        }
        return { frontThumb, backThumb, frontMain, backMain, frontApi, backApi, frontIsPhone, backIsPhone };
      })
    );
    const finalItems = skeleton.map((item, idx) => ({ ...item, ...converted[idx] }));
    setQueue(finalItems);
    return finalItems;
  }

  async function handleFilesSelected(fileList) {
    setStage("pairing");
    await pairFiles(fileList);
  }

  function swapPair(id) {
    setQueue((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              frontThumb: p.backThumb,
              backThumb: p.frontThumb,
              frontMain: p.backMain,
              backMain: p.frontMain,
              frontApi: p.backApi,
              backApi: p.frontApi,
              frontIsPhone: p.backIsPhone,
              backIsPhone: p.frontIsPhone,
            }
          : p
      )
    );
  }

  function removePair(id) {
    setQueue((prev) => prev.filter((p) => p.id !== id));
  }

  // Identifies a single queue item and returns its updated form -- shared by the initial batch
  // pass (runBulkIdentifyItems) and the per-card "Retry identification" button in review, so a
  // card that failed the first time (a bad connection, a rate limit, an unusual team/year)
  // doesn't require starting the whole batch over. Works entirely off the item's already-
  // converted frontMain/backMain data URLs, not File objects, so a retry works fine even after
  // a reload restored this item from storage.
  function buildFailedItem(item, message, isBillingError, costUsd) {
    return {
      ...item,
      status: "error",
      error: message,
      isBillingError: !!isBillingError,
      costUsd: costUsd || 0,
      form: {
        player: "",
        team: "",
        sport: "Hockey",
        year: "",
        brand: "",
        set: "",
        cardNumber: "",
        value: "",
        onlineFrontUrl: null,
        onlineBackUrl: null,
        personalFront: item.frontIsPhone ? null : item.frontMain,
        personalBack: item.backIsPhone ? null : item.backMain || null,
        purchasePhotoFront: item.frontIsPhone ? item.frontMain : null,
        purchasePhotoBack: item.backIsPhone ? item.backMain : null,
        thumbnailSource: "personal",
      },
      phoneDetected: item.frontIsPhone || item.backIsPhone,
    };
  }

  async function identifyOneItem(item) {
    if (!item.frontMain) {
      return buildFailedItem(item, "Missing image data for this card -- remove it and re-add the photo.", false, 0);
    }
    // apiUrls: smaller copies sent to the AI for identification only. storageUrls: the
    // full-resolution copies that get rotated and saved as the card's permanent photos. Falls
    // back to frontMain/backMain for frontApi/backApi so older in-progress queue items (paired
    // before this split existed) still identify correctly.
    const apiFront = item.frontApi || item.frontMain;
    const apiBack = item.hasBack ? item.backApi || item.backMain : null;
    const apiUrls = item.hasBack && apiBack ? [apiFront, apiBack] : [apiFront];
    const storageUrls = item.hasBack && item.backMain ? [item.frontMain, item.backMain] : [item.frontMain];
    try {
      const result = await identifyCardFromImages(apiUrls);
      let rotated = storageUrls;
      try {
        rotated =
          storageUrls.length === 2
            ? await Promise.all([
                rotateDataUrl(storageUrls[0], Number(result.rotation1) || 0),
                rotateDataUrl(storageUrls[1], Number(result.rotation2) || 0),
              ])
            : [await rotateDataUrl(storageUrls[0], Number(result.rotation) || 0)];
      } catch (e) {
        // keep un-rotated copies rather than failing the whole card
      }
      let front = rotated[0];
      let back = rotated[1] || null;
      let frontIsPhone = item.frontIsPhone;
      let backIsPhone = item.backIsPhone;
      if (rotated.length === 2 && Number(result.frontImageIndex) === 2) {
        front = rotated[1];
        back = rotated[0];
        frontIsPhone = item.backIsPhone;
        backIsPhone = item.frontIsPhone;
      }
      const cleanValueMatch =
        result.estimatedValue !== null && result.estimatedValue !== undefined ? String(result.estimatedValue).match(/[\d.]+/) : null;
      const form = {
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
        thumbnailSource: (frontIsPhone || backIsPhone) && result.frontImageUrl ? "online" : "personal",
      };
      return {
        ...item,
        status: "ready",
        error: null,
        isBillingError: false,
        costUsd: result._costUsd || 0,
        searched: !!result._searched,
        form,
        confidence: result.confidence || null,
        phoneDetected: frontIsPhone || backIsPhone,
      };
    } catch (err) {
      return buildFailedItem(
        item,
        `Couldn't identify this one automatically${err && err.message ? ` (${err.message})` : ""} — check the photos, fill it in by hand, or try again.`,
        err && err.isBilling,
        err && err.costUsd
      );
    }
  }

  async function runBulkIdentifyItems(initialItems) {
    setStage("identifying");
    const items = [...initialItems];
    setProgress({ done: 0, total: items.length });
    let nextIndex = 0;
    let doneCount = 0;
    // Once any card comes back with an out-of-credit error, every other call in this batch would
    // fail the exact same way -- no reason to make the person wait through dozens more doomed API
    // calls one at a time. Remaining not-yet-attempted cards are marked failed immediately (same
    // message, no network call), so the batch finishes right away with a clear reason on each.
    let billingStopMessage = null;

    async function worker() {
      while (nextIndex < items.length) {
        const idx = nextIndex++;
        if (items[idx].status !== "pending") {
          // already identified before an earlier interruption (crash, closed tab) -- this is a
          // resumed batch, so don't re-identify (and re-pay for) cards that already finished.
          doneCount++;
          setProgress({ done: doneCount, total: items.length });
          continue;
        }
        if (billingStopMessage) {
          items[idx] = buildFailedItem(items[idx], billingStopMessage, true, 0);
        } else {
          items[idx] = await identifyOneItem(items[idx]);
          if (items[idx].isBillingError) billingStopMessage = items[idx].error;
        }
        doneCount++;
        setProgress({ done: doneCount, total: items.length });
        setQueue([...items]);
      }
    }

    // Kept modest -- a big batch (dozens of cards) hammering the API with more workers than
    // this tends to trip a rate limit, which (before identifyCardFromImages retried) could fail
    // an entire large batch outright.
    const concurrency = Math.min(2, items.length);
    await Promise.all(Array.from({ length: concurrency }, worker));
    setStage("review");
    setReviewIndex(0);
  }

  // Used by the pairing screen's "Identify N cards" button, which runs against whatever's
  // currently in `queue` state (by that point pairing is done and the queue is settled).
  function runBulkIdentify() {
    return runBulkIdentifyItems(queue);
  }

  async function retryIdentify(idx) {
    setQueue((prev) => prev.map((it, i) => (i === idx ? { ...it, status: "retrying" } : it)));
    const target = queue[idx];
    const updated = await identifyOneItem(target);
    setQueue((prev) => prev.map((it, i) => (i === idx ? updated : it)));
  }

  function updateReviewForm(patch) {
    setQueue((prev) => prev.map((it, i) => (i === reviewIndex ? { ...it, form: { ...it.form, ...patch } } : it)));
  }

  async function rotateReviewImage(face) {
    const item = queue[reviewIndex];
    if (!item || !item.form) return;
    const scanKey = face === "front" ? "personalFront" : "personalBack";
    const purchaseKey = face === "front" ? "purchasePhotoFront" : "purchasePhotoBack";
    const current = item.form[scanKey] || item.form[purchaseKey];
    if (!current) return;
    const rotated = await rotateDataUrl(current, 90);
    updateReviewForm({
      [scanKey]: item.form[scanKey] ? rotated : item.form[scanKey],
      [purchaseKey]: item.form[purchaseKey] ? rotated : item.form[purchaseKey],
    });
  }

  function goNext() {
    setReviewIndex((i) => {
      if (i < queue.length - 1) return i + 1;
      setStage("done");
      return i;
    });
  }

  function goPrev() {
    setReviewIndex((i) => Math.max(0, i - 1));
  }

  async function saveCurrent() {
    const item = queue[reviewIndex];
    if (!item.form || !item.form.player.trim()) {
      setQueue((prev) => prev.map((it, i) => (i === reviewIndex ? { ...it, saveError: "Add a player name before saving." } : it)));
      return;
    }
    const photos = await resolvePhotoFields(
      {
        personalFront: item.form.personalFront || null,
        personalBack: item.form.personalBack || null,
        purchasePhotoFront: item.form.purchasePhotoFront || null,
        purchasePhotoBack: item.form.purchasePhotoBack || null,
      },
      null
    );
    const entry = {
      id: (Date.now() + Math.random()).toString(36),
      dateAdded: Date.now(),
      player: item.form.player.trim(),
      team: item.form.team.trim(),
      sport: item.form.sport,
      year: item.form.year.trim(),
      brand: item.form.brand.trim(),
      set: item.form.set.trim(),
      cardNumber: item.form.cardNumber.trim(),
      value: item.form.value === "" || isNaN(Number(item.form.value)) ? null : Number(item.form.value),
      onlineFrontUrl: item.form.onlineFrontUrl || null,
      onlineBackUrl: item.form.onlineBackUrl || null,
      ...photos,
      thumbnailSource: item.form.thumbnailSource || "online",
    };
    await onAddCard(entry);
    const hit = matchSingleCardToChecklist(entry);
    setQueue((prev) => prev.map((it, i) => (i === reviewIndex ? { ...it, status: "saved", saveError: null } : it)));
    setSavedCount((c) => c + 1);
    if (hit) setMatchedCount((c) => c + 1);
    goNext();
  }

  function skipCurrent() {
    setQueue((prev) => prev.map((it, i) => (i === reviewIndex ? { ...it, status: "skipped" } : it)));
    setSkippedCount((c) => c + 1);
    goNext();
  }

  function restoreCurrent() {
    setQueue((prev) => prev.map((it, i) => (i === reviewIndex ? { ...it, status: "ready" } : it)));
  }

  function resetBulk() {
    setStage("select");
    setQueue([]);
    setProgress({ done: 0, total: 0 });
    setReviewIndex(0);
    setSavedCount(0);
    setMatchedCount(0);
    setSkippedCount(0);
    setRestoredFromStorage(false);
    window.storage.set(BULK_QUEUE_KEY, "", false).catch(() => {});
  }

  // Estimated cost of the batch currently in progress -- summed straight from the queue, since
  // every identified (or failed-and-charged-for) item already carries its own costUsd.
  const batchCostUsd = queue.reduce((sum, it) => sum + (it.costUsd || 0), 0);
  // How many cards actually needed the paid, search-enabled second pass (vs. the free-er first
  // pass alone) -- makes the two-pass system's savings visible per batch instead of only
  // inferable from a single dollar total after the fact.
  const searchedCount = queue.filter((it) => it.searched).length;
  const identifiedCount = queue.filter((it) => it.status === "ready" || it.status === "saved" || it.status === "skipped" || (it.status === "error" && !it.isBillingError)).length;

  return (
    <div className="bulk-wrap">
      {stage === "select" && (
        <div className="bulk-select">
          <p className="checklist-intro">
            Pick a folder (or select multiple files) of card photos. I'll pair them up in the order you select them —
            front, back, front, back — assuming that's the order they were scanned in. You'll get a chance to fix any
            pairing before anything gets identified.
          </p>
          {lifetimeUsage && lifetimeUsage.totalCalls > 0 && (
            <p className="checklist-intro" style={{ fontSize: 13, opacity: 0.75 }}>
              Estimated lifetime API cost so far: ${lifetimeUsage.totalCostUsd.toFixed(2)} across {lifetimeUsage.totalCalls} call
              {lifetimeUsage.totalCalls === 1 ? "" : "s"} (identify, appraise, and price lookups combined). This is an estimate
              from each response's own usage numbers, not your actual bill -- check console.anthropic.com for that.
            </p>
          )}
          <input
            type="file"
            accept="image/*"
            multiple
            webkitdirectory=""
            id="bulk-folder-input"
            style={{ display: "none" }}
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
          <input
            type="file"
            accept="image/*"
            multiple
            id="bulk-files-input"
            style={{ display: "none" }}
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
          <div className="bulk-select-buttons">
            <label htmlFor="bulk-folder-input" className="dropzone" style={{ flex: 1 }}>
              Choose a folder
            </label>
            <label htmlFor="bulk-files-input" className="dropzone" style={{ flex: 1 }}>
              Choose files
            </label>
          </div>

          {watchSupported && (
            <div className="watch-folder-box">
              {watchFolderName ? (
                <>
                  <p className="checklist-intro" style={{ marginBottom: 8 }}>
                    Watching <strong>{watchFolderName}</strong> for new scans — I check it automatically each time you open this tab.
                    {watchMessage ? ` ${watchMessage}` : ""}
                  </p>
                  <div className="bulk-select-buttons">
                    <button type="button" className="btn-secondary" onClick={manualCheckWatchFolder} disabled={watchStatus === "checking"}>
                      {watchStatus === "checking" ? "Checking..." : "Check for new scans now"}
                    </button>
                    {watchStatus === "needs-permission" && (
                      <button type="button" className="btn-secondary" onClick={reconnectWatchFolder}>
                        Reconnect folder access
                      </button>
                    )}
                    <button type="button" className="link-btn" onClick={disconnectWatchFolder}>
                      Stop watching
                    </button>
                  </div>
                  {watchStatus === "error" && <p className="identify-error">{watchMessage}</p>}
                </>
              ) : (
                <>
                  <p className="checklist-intro" style={{ marginBottom: 8 }}>
                    Or connect a folder once, and I'll notice new scans dropped in there automatically each time you open the ledger —
                    no need to pick files by hand.
                  </p>
                  <button type="button" className="btn-secondary" onClick={connectWatchFolder} disabled={watchStatus === "connecting"}>
                    {watchStatus === "connecting" ? "Opening folder picker..." : "Watch a scan folder"}
                  </button>
                  {watchStatus === "error" && <p className="identify-error" style={{ marginTop: 8 }}>{watchMessage}</p>}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {stage === "pairing" && (
        <div className="bulk-pairing">
          <p className="checklist-intro">
            {queue.length} card{queue.length === 1 ? "" : "s"} detected from your selection. Make sure each pair below
            actually belongs to the same card, and remove any stragglers — you don't need to worry about which image
            is the front and which is the back, the identifier figures that out on its own from what's printed on
            each side.
          </p>
          <div className="bulk-pairs-grid">
            {queue.map((p, i) => (
              <div className="bulk-pair" key={p.id}>
                <span className="bulk-pair-index">#{i + 1}</span>
                <div className="bulk-pair-thumbs">
                  <CardImage src={p.frontThumb} alt="front" fallbackLabel="Loading..." />
                  {p.hasBack ? (
                    <CardImage src={p.backThumb} alt="back" fallbackLabel="Loading..." />
                  ) : (
                    <div className="bulk-pair-missing">no back</div>
                  )}
                </div>
                <div className="bulk-pair-actions">
                  {p.hasBack && (
                    <button type="button" className="link-btn" onClick={() => swapPair(p.id)} title="Not required -- identification works either way. Only useful if identifying fails and you want to fix the order by hand.">
                      Swap order
                    </button>
                  )}
                  <button type="button" className="link-btn" onClick={() => removePair(p.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => setStage("select")}>
              Start over
            </button>
            <button type="button" className="btn-primary" onClick={runBulkIdentify} disabled={queue.length === 0}>
              Identify {queue.length} card{queue.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}

      {stage === "identifying" && (
        <div className="bulk-identifying">
          <p className="scan-status">
            Identifying card {progress.done} of {progress.total}... a big batch can take a few minutes since each card gets its own lookup.
          </p>
          <div className="checklist-progress-bar" style={{ maxWidth: 320 }}>
            <div className="checklist-progress-fill" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          <p className="checklist-intro" style={{ fontSize: 13, opacity: 0.75, marginTop: 8 }}>
            Est. cost so far this batch: ${batchCostUsd.toFixed(2)}
            {identifiedCount > 0 && ` — ${searchedCount} of ${identifiedCount} needed a search lookup`}
          </p>
        </div>
      )}

      {stage === "review" &&
        queue.length > 0 &&
        (() => {
          const item = queue[reviewIndex];
          const form = item.form || {};
          const alreadyDone = item.status === "saved" || item.status === "skipped";
          return (
            <div className="bulk-review">
              {restoredFromStorage && (
                <p className="banner banner-good" style={{ marginBottom: 12 }}>
                  Picked up where you left off — this batch was still waiting for review.
                </p>
              )}
              <div className="bulk-review-topbar">
                <span>
                  Card {reviewIndex + 1} of {queue.length}
                </span>
                <span className="bulk-review-tally">
                  {savedCount} saved · {skippedCount} skipped · {matchedCount} matched checklist · ~${batchCostUsd.toFixed(2)} est. cost ({searchedCount} of {identifiedCount} searched)
                </span>
              </div>
              <div className="form-card bulk-form-card">
                {item.error && (
                  <p className="identify-error">
                    {item.error}{" "}
                    {item.status === "error" && (
                      <button type="button" className="link-btn" onClick={() => retryIdentify(reviewIndex)}>
                        Retry identification
                      </button>
                    )}
                  </p>
                )}
                {item.status === "retrying" && <p className="scan-status">Retrying...</p>}
                {item.phoneDetected && (form.purchasePhotoFront || form.purchasePhotoBack) && (
                  <p className="phone-photo-note">
                    📷 Looks like a phone photo, not a scan — using a database image where I found one; your photo is kept as a reference.{" "}
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() =>
                        updateReviewForm({
                          personalFront: form.personalFront || form.purchasePhotoFront,
                          personalBack: form.personalBack || form.purchasePhotoBack,
                          purchasePhotoFront: null,
                          purchasePhotoBack: null,
                          thumbnailSource: "personal",
                        })
                      }
                    >
                      Actually, use it as my scan
                    </button>
                  </p>
                )}
                <div className="identify-preview-pair">
                  <div className="preview-col">
                    <div
                      className="identify-preview zoomable"
                      onClick={() => {
                        const src = form.personalFront || form.purchasePhotoFront || form.onlineFrontUrl;
                        if (src) setZoomSrc(src);
                      }}
                    >
                      <CardImage src={form.personalFront || form.purchasePhotoFront || form.onlineFrontUrl} alt="front" fallbackLabel="Front" />
                    </div>
                    {(form.personalFront || form.purchasePhotoFront) && (
                      <button type="button" className="rotate-btn" onClick={() => rotateReviewImage("front")}>⟳ Rotate</button>
                    )}
                  </div>
                  <div className="preview-col">
                    <div
                      className="identify-preview zoomable"
                      onClick={() => {
                        const src = form.personalBack || form.purchasePhotoBack || form.onlineBackUrl;
                        if (src) setZoomSrc(src);
                      }}
                    >
                      <CardImage src={form.personalBack || form.purchasePhotoBack || form.onlineBackUrl} alt="back" fallbackLabel="Back" />
                    </div>
                    {(form.personalBack || form.purchasePhotoBack) && (
                      <button type="button" className="rotate-btn" onClick={() => rotateReviewImage("back")}>⟳ Rotate</button>
                    )}
                  </div>
                </div>
                <p className="zoom-hint">Tap a photo to zoom in.</p>
                {item.confidence && (
                  <span className="confidence-badge">
                    {item.confidence} confidence — check the fields below{item.searched ? " (cross-checked online)" : " (from photo alone, no search needed)"}
                  </span>
                )}
                {!alreadyDone && (
                  <>
                    <div className="field-grid" style={{ marginTop: 12 }}>
                      <div className="field full">
                        <label>Player</label>
                        <input value={form.player || ""} onChange={(e) => updateReviewForm({ player: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>Team</label>
                        <input value={form.team || ""} onChange={(e) => updateReviewForm({ team: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>Sport</label>
                        <select value={form.sport || "Hockey"} onChange={(e) => updateReviewForm({ sport: e.target.value })}>
                          {SPORTS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Year</label>
                        <input value={form.year || ""} onChange={(e) => updateReviewForm({ year: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>Brand</label>
                        <input value={form.brand || ""} onChange={(e) => updateReviewForm({ brand: e.target.value })} list="brand-options" />
                      </div>
                      <div className="field">
                        <label>Set</label>
                        <input value={form.set || ""} onChange={(e) => updateReviewForm({ set: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>Card number</label>
                        <input value={form.cardNumber || ""} onChange={(e) => updateReviewForm({ cardNumber: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>Estimated value</label>
                        <input value={form.value || ""} onChange={(e) => updateReviewForm({ value: e.target.value })} />
                      </div>
                    </div>
                    {item.saveError && <p className="identify-error">{item.saveError}</p>}
                  </>
                )}
                {alreadyDone && (
                  <div className="bulk-already-done">
                    <p>{item.status === "saved" ? "✓ Added to your ledger." : "Skipped."}</p>
                    {item.status === "skipped" && (
                      <button type="button" className="link-btn" onClick={restoreCurrent}>
                        Restore & review
                      </button>
                    )}
                  </div>
                )}
                <div className="form-actions">
                  <button type="button" className="btn-secondary" onClick={goPrev} disabled={reviewIndex === 0}>
                    ◂ Back
                  </button>
                  <div className="form-actions-right">
                    {alreadyDone ? (
                      <button type="button" className="btn-primary" onClick={goNext}>
                        {reviewIndex === queue.length - 1 ? "Finish" : "Next ▸"}
                      </button>
                    ) : (
                      <>
                        <button type="button" className="btn-secondary" onClick={skipCurrent}>
                          Skip this one
                        </button>
                        <button type="button" className="btn-primary" onClick={saveCurrent}>
                          Save & next
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {stage === "done" && (
        <div className="bulk-done">
          <h2>Batch complete</h2>
          <p>
            {savedCount} card{savedCount === 1 ? "" : "s"} added to your ledger, {matchedCount} matched your Stars checklist,{" "}
            {skippedCount} skipped.
          </p>
          <div className="form-actions-right">
            <button type="button" className="btn-secondary" onClick={resetBulk}>
              Start another batch
            </button>
            <button type="button" className="btn-primary" onClick={onGoToGallery}>
              View in gallery
            </button>
          </div>
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
  const [reviewItems, setReviewItems] = useState([]);
  const [drafts, setDrafts] = useState({}); // reviewItemId -> editable form fields
  const [zoomSrc, setZoomSrc] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [uploadError, setUploadError] = useState(null);
  const [uploadDone, setUploadDone] = useState(null);

  async function refresh() {
    try {
      const [jobsRes, reviewRes] = await Promise.all([
        fetch("/api/bulk-import/jobs").then((r) => r.json()),
        fetch("/api/bulk-import/review").then((r) => r.json()),
      ]);
      setJobs((jobsRes && jobsRes.jobs) || []);
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

  function updateDraft(id, field, value) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function saveReviewItem(id) {
    const draft = drafts[id];
    if (!draft || !draft.player.trim()) return;
    await fetch(`/api/bulk-import/review/${id}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setReviewItems((prev) => prev.filter((r) => r.id !== id));
    if (onCardsMayHaveChanged) onCardsMayHaveChanged();
  }

  async function discardReviewItem(id) {
    await fetch(`/api/bulk-import/review/${id}/discard`, { method: "POST" });
    setReviewItems((prev) => prev.filter((r) => r.id !== id));
  }

  const activeJobs = jobs.filter((j) => j.status === "processing");
  const pastJobs = jobs.filter((j) => j.status !== "processing");

  return (
    <div className="auto-import-panel">
      <div style={{ maxWidth: 640 }}>
        <p style={{ marginTop: 0 }}>
          Pick a folder of card photos (or a folder full of folders, organized however you like) and it identifies, orients, and saves
          every confident card automatically, no review needed. Anything it isn't confident about lands below for you to check instead
          of being saved or guessed. This runs through Anthropic's Batch API at half the normal per-card cost, in exchange for taking up
          to a few hours rather than being instant -- once the upload progress bar below finishes, closing this tab doesn't stop it.
        </p>
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
            </div>
          ))}
        </div>
      )}

      {reviewItems.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3>Needs your review ({reviewItems.length})</h3>
          {reviewItems.map((item) => {
            const draft = drafts[item.id] || {};
            return (
              <div key={item.id} className="auto-import-review-card">
                <div className="photo-pair-row">
                  <div className="photo-pair-col">
                    {item.front_storage && (
                      <img src={item.front_storage} alt="front" className="review-thumb" onClick={() => setZoomSrc(item.front_storage)} />
                    )}
                  </div>
                  <div className="photo-pair-col">
                    {item.back_storage && (
                      <img src={item.back_storage} alt="back" className="review-thumb" onClick={() => setZoomSrc(item.back_storage)} />
                    )}
                  </div>
                </div>
                <p style={{ fontSize: 13, opacity: 0.75, margin: "4px 0" }}>
                  {item.reason === "api_error" ? "Couldn't identify this one automatically" : "Not confident enough to auto-add"}
                  {item.folder_name ? ` -- from "${item.folder_name}"` : ""}
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
                <div className="form-actions-right" style={{ marginTop: 8 }}>
                  <button type="button" className="btn-secondary" onClick={() => discardReviewItem(item.id)}>Discard</button>
                  <button type="button" className="btn-primary" onClick={() => saveReviewItem(item.id)} disabled={!draft.player || !draft.player.trim()}>
                    Save to ledger
                  </button>
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

// --- Appraise: one photo of several cards at once, for a rough on-the-spot value check
// (e.g. deciding what to buy at a card show). Never saved automatically. ---
function AppraisePanel({ onQuickAdd }) {
  const [photoFile, setPhotoFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [addedIndices, setAddedIndices] = useState({});

  async function handlePhotoChosen(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError(null);
    setResults(null);
    setAddedIndices({});
    setPhotoFile(file);
    try {
      const dataUrl = await fileToResizedDataUrl(file, 640, 0.8);
      setPreview(dataUrl);
    } catch (e2) {
      setPreview(null);
    }
  }

  async function runAppraise() {
    if (!photoFile) return;
    setLoading(true);
    setError(null);
    try {
      const hiRes = await fileToResizedDataUrl(photoFile, 2000, 0.9);
      const cards = await appraiseMultipleCards(hiRes);
      setResults(cards);
    } catch (err) {
      // Surfacing the real reason (not just a generic line) so a repeat failure is actually
      // diagnosable instead of just "try a clearer photo" every time.
      setError(
        `Couldn't read the cards in that photo${err && err.message ? ` (${err.message})` : ""}. Try a clearer, well-lit shot with the cards spread out and not overlapping, or try again.`
      );
    } finally {
      setLoading(false);
    }
  }

  function addOne(item, idx) {
    onQuickAdd(item);
    setAddedIndices((prev) => ({ ...prev, [idx]: true }));
  }

  function reset() {
    setPhotoFile(null);
    setPreview(null);
    setResults(null);
    setError(null);
    setAddedIndices({});
  }

  return (
    <div className="appraise-wrap">
      <p className="checklist-intro">
        At a show and want a fast read on a stack of cards? Snap one photo with all of them laid out. I'll try to pick out
        each card and give a rough value — this is a quick single-photo estimate, not a full identification, and nothing
        is added to your ledger unless you say so below.
      </p>
      {!preview ? (
        <>
          <input type="file" accept="image/*" capture="environment" id="appraise-input" style={{ display: "none" }} onChange={handlePhotoChosen} />
          <label htmlFor="appraise-input" className="dropzone">
            Choose or take a photo of several cards
          </label>
        </>
      ) : (
        <div className="appraise-preview-row">
          <div className="appraise-preview">
            <img src={preview} alt="cards to appraise" />
          </div>
          <div className="appraise-preview-actions">
            {!results && !loading && (
              <button type="button" className="btn-primary" onClick={runAppraise}>
                Get rough values
              </button>
            )}
            <button type="button" className="link-btn" onClick={reset}>
              Choose a different photo
            </button>
          </div>
        </div>
      )}
      {loading && <p className="scan-status">Scanning the photo for individual cards and estimating rough values...</p>}
      {error && <p className="identify-error">{error}</p>}
      {results &&
        (results.length === 0 ? (
          <p className="checklist-empty">Couldn't make out any individual cards in that photo.</p>
        ) : (
          <div className="appraise-results">
            {results.map((item, idx) => (
              <div className="appraise-result-row" key={idx}>
                <div className="appraise-result-main">
                  <div className="tile-player">{item.player || "Unknown player"}</div>
                  <div className="tile-sub">
                    {[item.year, item.brand, item.set, item.team].filter(Boolean).join(" · ")}
                    {item.cardNumber ? ` #${item.cardNumber}` : ""}
                  </div>
                  {item.confidence && <span className="confidence-badge">{item.confidence} confidence</span>}
                </div>
                <div className="appraise-result-value">{item.estimatedValue !== null && item.estimatedValue !== undefined ? moneyOrDash(item.estimatedValue) : "—"}</div>
                <button type="button" className="btn-secondary" disabled={!!addedIndices[idx]} onClick={() => addOne(item, idx)}>
                  {addedIndices[idx] ? "Added" : "Add to ledger"}
                </button>
              </div>
            ))}
          </div>
        ))}
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
  const [sortBy, setSortBy] = useState("dateAdded");
  const [viewMode, setViewMode] = useState("gallery");
  const [activeTab, setActiveTab] = useState("collection"); // collection | checklist | yg | bulk | appraise
  const [flipped, setFlipped] = useState({});
  // "Fix rotation" mode: shows both of a card's own photos on its gallery tile with a rotate
  // button on each, so a batch of bulk-scanned cards that came in sideways/upside-down can be
  // straightened out a click at a time without opening the full detail/edit view for each one.
  const [galleryEditMode, setGalleryEditMode] = useState(false);
  const [rotatingImage, setRotatingImage] = useState(null); // `${cardId}-${face}` while a rotate is in flight

  const [checklistManual, setChecklistManual] = useState({});
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
      const uploaded = await uploadPhoto(rotated, current);
      // Functional update (not a plain `cards.map` off the outer closure) so rotating a second
      // card before the first one's state has re-rendered still lands on top of that first
      // rotation instead of silently reverting it -- the whole point of making this fast is
      // clicking through many cards back to back, so this has to hold up under that.
      setCards((prevCards) => {
        const next = prevCards.map((c) =>
          c.id === cardId
            ? { ...c, [scanKey]: c[scanKey] ? uploaded : c[scanKey], [purchaseKey]: c[purchaseKey] ? uploaded : c[purchaseKey] }
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
                const seriesHtml = series ? `<span class="series">${escapeHtml(series)}</span>` : "";
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

  async function saveCard() {
    if (!form.player.trim()) {
      setFormError("Add a player name before saving — this is the one field that can't be blank.");
      return;
    }
    try {
      setFormError(null);
      const previousCard = editingId ? cards.find((c) => c.id === editingId) : null;
      const photos = await resolvePhotoFields(
        {
          personalFront: form.personalFront || null,
          personalBack: form.personalBack || null,
          purchasePhotoFront: form.purchasePhotoFront || null,
          purchasePhotoBack: form.purchasePhotoBack || null,
        },
        previousCard
      );
      const entry = {
        id: editingId ?? (Date.now() + Math.random()).toString(36),
        dateAdded: editingId ? (previousCard?.dateAdded ?? Date.now()) : Date.now(),
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
        ...photos,
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

  // Used by the Bulk Add panel: saves one already-reviewed card straight into the ledger.
  async function addSingleCardFromBulk(entry) {
    const next = [...cards, entry];
    await persist(next);
  }

  // Used by the Appraise panel: opens the normal verify/edit form pre-filled with a
  // quick-appraisal result, so the person can double check it before it's actually added.
  function quickAddFromAppraisal(item) {
    setEditingId(null);
    setForm({
      ...blankForm,
      player: item.player || "",
      team: item.team || "",
      sport: SPORTS.includes(item.sport) ? item.sport : "Hockey",
      year: item.year || "",
      brand: item.brand || "",
      set: item.set || "",
      cardNumber: item.cardNumber || "",
      value: item.estimatedValue !== null && item.estimatedValue !== undefined ? String(item.estimatedValue) : "",
      onlineFrontUrl: item.frontImageUrl || null,
      thumbnailSource: item.frontImageUrl ? "online" : "personal",
    });
    resetIdentifyState();
    setFormError(null);
    setActiveTab("collection");
    setShowEdit(true);
  }

  function setThumbnailSource(id, source) {
    persist(cards.map((c) => (c.id === id ? { ...c, thumbnailSource: source } : c)));
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
    const uploaded = await uploadPhoto(rotated, current);
    const updated = {
      ...detailCard,
      [scanKey]: detailCard[scanKey] ? uploaded : detailCard[scanKey],
      [purchaseKey]: detailCard[purchaseKey] ? uploaded : detailCard[purchaseKey],
    };
    persist(cards.map((c) => (c.id === detailCard.id ? updated : c)));
    setDetailCard(updated);
  }

  const filtered = useMemo(() => {
    let list = cards;
    if (sportFilter !== "All") list = list.filter((c) => c.sport === sportFilter);
    if (brandFilter !== "All") list = list.filter((c) => (c.brand || "") === brandFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.player.toLowerCase().includes(q) ||
          c.team.toLowerCase().includes(q) ||
          (c.brand || "").toLowerCase().includes(q) ||
          c.set.toLowerCase().includes(q) ||
          c.year.toLowerCase().includes(q)
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
  }, [cards, query, sportFilter, brandFilter, sortBy]);

  const stats = useMemo(() => {
    const totalValue = cards.reduce((s, c) => s + (Number(c.value) || 0), 0);
    return { totalCards: cards.length, totalValue };
  }, [cards]);

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
    cards.forEach((c) => { if (c.brand) seen.add(c.brand); });
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [cards]);

  return (
    <div className="ledger-root">
      <datalist id="brand-options">
        {brandOptions.map((b) => <option key={b} value={b} />)}
      </datalist>
      <style>{`
        .ledger-root {
          --paper: #F2EEE2; --paper-line: #D8D0BC; --ink: #1F2A24;
          --navy: #1E3448; --green: #2F4B3C; --gold: #A97D1F; --brick: #8C3B2E; --muted: #6B6555;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: var(--paper); color: var(--ink); min-height: 100%;
          padding: 28px 20px 60px; box-sizing: border-box;
        }
        .ledger-root * { box-sizing: border-box; }
        .ledger-inner { max-width: 960px; margin: 0 auto; }
        .header-row { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; border-bottom: 2px solid var(--ink); padding-bottom: 16px; margin-bottom: 22px; }
        .wordmark { font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif; font-size: 34px; font-weight: 700; margin: 0; color: var(--navy); }
        .subhead { margin: 4px 0 0; font-size: 14px; color: var(--muted); font-style: italic; font-family: Georgia, serif; }

        .scan-cta { display: flex; align-items: center; gap: 10px; background: var(--green); color: var(--paper); border: none; padding: 12px 20px; font-size: 15px; font-weight: 600; cursor: pointer; border-radius: 4px; font-family: inherit; }
        .scan-cta:hover { background: #24392d; }
        .scan-cta:focus-visible { outline: 2px solid var(--navy); outline-offset: 2px; }
        .scan-cta svg { flex-shrink: 0; }

        .stat-strip { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--paper-line); border-bottom: 1px solid var(--paper-line); margin-bottom: 22px; }
        .stat { padding: 14px 16px; border-left: 1px solid var(--paper-line); }
        .stat:first-child { border-left: none; }
        .stat-num { font-family: Georgia, serif; font-size: 26px; font-weight: 700; color: var(--navy); line-height: 1.1; }
        .stat-label { font-size: 12.5px; color: var(--muted); margin-top: 3px; }
        .stat-clickable { cursor: pointer; }
        .stat-clickable:hover { background: rgba(30,52,72,0.04); }

        .controls { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; }
        .controls input[type="text"], .controls select { font-family: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--paper-line); background: #fff; border-radius: 3px; color: var(--ink); }
        .controls input[type="text"] { flex: 1; min-width: 160px; }
        .controls input:focus-visible, .controls select:focus-visible { outline: 2px solid var(--navy); outline-offset: 1px; }
        .view-toggle { display: flex; border: 1px solid var(--paper-line); border-radius: 3px; overflow: hidden; }
        .view-toggle button { background: #fff; border: none; padding: 8px 14px; font-size: 13px; cursor: pointer; font-family: inherit; color: var(--muted); }
        .view-toggle button.active { background: var(--navy); color: var(--paper); }

        .tab-bar { display: flex; gap: 4px; border-bottom: 1px solid var(--paper-line); margin-bottom: 18px; }
        .tab-bar button { background: none; border: none; border-bottom: 2px solid transparent; padding: 9px 4px; margin-right: 18px; font-size: 14.5px; font-weight: 600; color: var(--muted); cursor: pointer; font-family: inherit; }
        .tab-bar button:hover { color: var(--ink); }
        .tab-bar button.active { color: var(--navy); border-bottom-color: var(--gold); }

        .bulk-select-buttons { display: flex; gap: 12px; flex-wrap: wrap; }
        .watch-folder-box { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--paper-line); }
        .bulk-pairs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin: 14px 0; }
        .bulk-pair { border: 1px solid var(--paper-line); border-radius: 4px; padding: 8px; background: #fff; }
        .bulk-pair-index { font-size: 11px; color: var(--muted); font-family: Georgia, serif; }
        .bulk-pair-thumbs { display: flex; gap: 6px; margin: 6px 0; }
        .bulk-pair-thumbs img, .bulk-pair-thumbs .img-fallback { width: 50%; aspect-ratio: 5/7; object-fit: contain; border-radius: 2px; background: #EDE7D6; }
        .bulk-pair-thumbs .img-fallback { font-size: 9px; color: var(--muted); text-align: center; padding: 4px; }
        .bulk-pair-missing { width: 50%; aspect-ratio: 5/7; background: #EDE7D6; color: var(--muted); font-size: 10px; display: flex; align-items: center; justify-content: center; text-align: center; border-radius: 2px; }
        .bulk-pair-actions { display: flex; gap: 8px; justify-content: space-between; }
        .bulk-pair-actions button { font-size: 11px; }
        .bulk-review-topbar { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; font-size: 13px; color: var(--muted); flex-wrap: wrap; gap: 6px; }
        .bulk-review-tally { font-weight: 600; color: var(--navy); }
        .bulk-form-card { max-width: none; padding: 20px; }
        .bulk-already-done { padding: 30px 0; text-align: center; color: var(--muted); font-size: 14px; }
        .bulk-done { text-align: center; padding: 40px 20px; }
        .bulk-done h2 { font-family: Georgia, serif; color: var(--navy); }
        .bulk-done .form-actions-right { justify-content: center; margin-top: 18px; }

        .appraise-preview-row { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; }
        .appraise-preview { width: 220px; border-radius: 4px; overflow: hidden; background: #EDE7D6; flex-shrink: 0; }
        .appraise-preview img { width: 100%; display: block; }
        .appraise-preview-actions { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
        .appraise-results { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
        .appraise-result-row { display: flex; align-items: center; gap: 14px; border: 1px solid var(--paper-line); border-radius: 4px; padding: 10px 14px; background: #fff; }
        .appraise-result-main { flex: 1; display: flex; flex-direction: column; gap: 3px; }
        .appraise-result-value { font-family: Georgia, serif; font-weight: 700; color: var(--navy); font-size: 15px; width: 90px; text-align: right; flex-shrink: 0; }
        .hide-collected-toggle { display: flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--muted); cursor: pointer; white-space: nowrap; }

        .auto-import-panel input[type="text"] { font-family: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--paper-line); background: #fff; border-radius: 3px; color: var(--ink); }
        .auto-import-job-card { border: 1px solid var(--paper-line); border-radius: 4px; padding: 10px 14px; background: #fff; margin-bottom: 8px; }
        .auto-import-progress-track { width: 100%; height: 6px; border-radius: 3px; background: #EDE7D6; overflow: hidden; }
        .auto-import-progress-fill { height: 100%; background: var(--green); }
        .auto-import-review-card { border: 1px solid var(--paper-line); border-radius: 4px; padding: 12px 14px; background: #fff; margin-bottom: 14px; max-width: 640px; }
        .review-thumb { width: 100%; aspect-ratio: 5/7; object-fit: contain; background: #EDE7D6; border-radius: 2px; cursor: zoom-in; }
        .verify-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
        .verify-fields input, .verify-fields select { font-family: inherit; font-size: 13.5px; padding: 6px 8px; border: 1px solid var(--paper-line); background: #fff; border-radius: 3px; color: var(--ink); }

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
        .value-cell { font-family: Georgia, serif; font-weight: 700; color: var(--navy); }

        .empty-state { padding: 56px 20px; text-align: center; color: var(--muted); border: 1px dashed var(--paper-line); }
        .empty-state p { margin: 0 0 16px; font-size: 15px; }

        .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; }
        .tile { border: 1px solid var(--paper-line); background: #fff; border-radius: 4px; overflow: hidden; cursor: pointer; display: flex; flex-direction: column; }
        .tile-img-wrap { position: relative; aspect-ratio: 5 / 7; background: #EDE7D6; }
        .tile-img-wrap img, .img-fallback { width: 100%; height: 100%; object-fit: contain; display: flex; align-items: center; justify-content: center; }
        .img-fallback { color: var(--muted); font-family: Georgia, serif; font-style: italic; font-size: 13px; text-align: center; padding: 10px; }
        .tile-flip-btn { position: absolute; top: 6px; right: 6px; background: rgba(30,52,72,0.75); color: #fff; border: none; border-radius: 3px; padding: 3px 7px; font-size: 11px; cursor: pointer; font-family: inherit; }
        .tile-rotate-btn { position: absolute; top: 6px; left: 6px; background: rgba(30,52,72,0.75); color: #fff; border: none; border-radius: 3px; padding: 3px 8px; font-size: 14px; line-height: 1; cursor: pointer; font-family: inherit; }
        .tile-source-toggle { position: absolute; bottom: 6px; left: 6px; right: 6px; display: flex; border-radius: 3px; overflow: hidden; font-size: 10.5px; }
        .tile-source-toggle button { flex: 1; border: none; padding: 4px 2px; cursor: pointer; font-family: inherit; background: rgba(255,255,255,0.85); color: var(--muted); }
        .tile-source-toggle button.active { background: var(--gold); color: #fff; }
        .tile-info { padding: 8px 9px 10px; }
        .tile-player { font-weight: 600; font-size: 13.5px; line-height: 1.25; }
        .tile-sub { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
        .tile-value { font-family: Georgia, serif; font-weight: 700; color: var(--navy); font-size: 13px; margin-top: 4px; }
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

        .form-actions { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 20px; }
        .form-actions-right { display: flex; gap: 10px; }
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
            <p className="wordmark">Bench</p>
            <p className="subhead">a running tally of the collection</p>
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
          <button className={activeTab === "collection" ? "active" : ""} onClick={() => setActiveTab("collection")}>Gallery</button>
          <button className={activeTab === "checklist" ? "active" : ""} onClick={() => setActiveTab("checklist")}>Stars Checklist</button>
          <button className={activeTab === "yg" ? "active" : ""} onClick={() => setActiveTab("yg")}>Young Guns</button>
          <button className={activeTab === "bulk" ? "active" : ""} onClick={() => setActiveTab("bulk")}>Bulk Add</button>
          <button className={activeTab === "autoimport" ? "active" : ""} onClick={() => setActiveTab("autoimport")}>Auto Import</button>
          <button className={activeTab === "appraise" ? "active" : ""} onClick={() => setActiveTab("appraise")}>Appraise</button>
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
          <div className="stat"><div className="stat-num">{stats.totalCards}</div><div className="stat-label">cards in the collection</div></div>
          <div className="stat"><div className="stat-num">{money(stats.totalValue)}</div><div className="stat-label">estimated value</div></div>
          <div className="stat stat-clickable" onClick={() => setActiveTab("checklist")}>
            <div className="stat-num">{checklistProgress.totalOwned} / {checklistProgress.totalCards}</div>
            <div className="stat-label">Stars base cards collected</div>
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

        {activeTab === "collection" && (
          <div className="controls">
            <input type="text" placeholder="Search player, team, brand, set, or year" value={query} onChange={(e) => setQuery(e.target.value)} />
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
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="dateAdded">Recently added</option>
              <option value="valueDesc">Highest value</option>
              <option value="player">Player name</option>
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
        ) : activeTab === "bulk" ? (
          <BulkAddPanel onAddCard={addSingleCardFromBulk} onGoToGallery={() => setActiveTab("collection")} />
        ) : activeTab === "autoimport" ? (
          <AutoImportPanel onCardsMayHaveChanged={reloadCardsFromStorage} />
        ) : activeTab === "appraise" ? (
          <AppraisePanel onQuickAdd={quickAddFromAppraisal} />
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
            {filtered.map((c) => {
              if (galleryEditMode) {
                return (
                  <div className="tile tile-editmode" key={c.id}>
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
              return (
                <div className="tile" key={c.id} onClick={() => openDetail(c)}>
                  <div className="tile-img-wrap">
                    <CardImage src={shown} alt={c.player} fallbackLabel="No photo yet" />
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
                return (
                  <tr key={c.id} onClick={() => openDetail(c)}>
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
                : "This one hasn't been matched to anything in your ledger yet. Scan it (or use Bulk Add) and it'll check itself off automatically."}
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
                <span />
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
