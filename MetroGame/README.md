# MetroGate Kolkata

An explorable Kolkata Metro map, a journey planner, and a small game that teaches you the network.
Plain HTML, CSS and JavaScript (ES modules) with JSON data. No build step, no dependencies, no backend.

## What it does

- **Plan** any station to any station. Type a current, local or former name (Tollygunge, Dharmatala, Airport).
  You get the stops, the interchanges, the line and the "towards" sign to look for, and step-by-step directions.
- **Map**: a schematic, pannable and zoomable network. Select a station for its details, start a journey from it,
  see interchanges and suspended sections, watch the route draw itself and a train ride it.
- **Passport**: scouting a station puts it on your passport; answering one question about it earns the stamp.
  Every line is a chapter with its own progress. Ranks come from XP.
- **Play**: Route trial (choose line, direction and change station, then watch the answer ride), Line run
  (tap stations in order), and a Daily route (same for everyone each day, with a streak).
- **Missions**: data-driven goals. XP is granted once per action, so replaying is practice, not farming.
- **Ride tracking** (optional): tap "I am at the next station" as you travel. Location is off unless you turn it on.

## Run it locally (macOS, VS Code)

ES modules need a web server (opening `index.html` from disk is blocked by the browser).

1. Open the folder in VS Code, then open its Terminal (Terminal > New Terminal).
2. Run `python3 -m http.server 8000`
3. Open http://localhost:8000

Alternative: install the "Live Server" extension, right-click `index.html`, choose "Open with Live Server".

## Test it

Needs Node 18 or newer, nothing to install:

```bash
node --test
```

The 33 tests cover the data, router, game rules, geometry and location logic.

## Deploy to GitHub Pages

1. Put the **contents** of this folder at the repository root (`index.html`, `css/`, `js/`, `data/` must be at the top level).
2. Commit and push to `main`.
3. Repository Settings > Pages > Build and deployment > Source: **Deploy from a branch**, Branch: `main`, folder `/ (root)`.
4. Wait a minute, then open `https://<your-username>.github.io/<repo-name>/`.

All paths are relative, so it also works from a sub-path. `.nojekyll` is included.

## Project layout

```
index.html
css/        base.css (tokens, buttons)  layout.css (shell, responsive)  map.css  ui.css
data/       network.json  layout.json  game.json
js/
  main.js                 start-up and wiring
  core/                   dom (safe element builder), sanitize, events, rng
  data/                   loader, network (validated model, search)
  routing/                router (Dijkstra + Yen), itinerary (plain-language steps)
  map/                    mapView (SVG, pan/zoom, route, trains), geometry
  game/                   progress (XP, saves), missions, quiz, trials
  location/               locationService (opt-in GPS), journeyTracker
  ui/                     planner, stationFile, passport, play, combobox, toast, about
tools/      build-data.py  build-layout.py   (regenerate the JSON; the JSON is what the app reads)
tests/      node:test suites
```

## Changing the data

Edit `tools/build-data.py` (stations, line order, suspended sections, interchanges), then run
`python3 tools/build-data.py && python3 tools/build-layout.py` and `node --test`.
The tests fail loudly if a station has no map position or a line references an unknown station.

- A **suspended section** is a `sections` entry with `status: "suspended"` on the line. The planner ignores it unless
  the user ticks "Also show routes that use suspended sections".
- A new interchange is simply a station id that appears in two lines' `stations` lists.
- Add map positions for new stations in `tools/build-layout.py`.
- Missions, ranks and XP values live in `data/game.json`.

## Data and honesty

Station lists and line order come from public references; the dataset records when it was checked
(`meta.asOf`) and what it cannot tell you. There is **no** live service data, fares, timings, platform numbers or walking
times, and none are invented. Check official Metro Railway Kolkata notices before you travel.

As of the check date, the Blue Line platforms at Kavi Subhash have been closed since 28 July 2025, so Blue Line trains turn back
at Shahid Khudiram and the Blue-Orange interchange is unusable. The Purple Line has no connection to the rest of the network.
The planner explains both rather than pretending a route exists.

## Location, privacy and limits

Nothing asks for location on load. Only the "Use my location" button in ride tracking calls the browser's location API.
Positions stay on the device and are never saved or sent. GPS often cannot see underground platforms and can be hundreds
of metres off elsewhere, so the app only offers hints ("you may be near X") that you confirm yourself. Coordinates in the data
are approximate and were left out where public listings looked wrong, so some stations cannot be matched at all.

Progress is saved in `localStorage` (this browser only) and validated on load.

## Security notes

- Text is inserted with `textContent` and DOM builders, never `innerHTML` with data.
- Search input, URL hash parameters and saved progress are validated against the network before use.
- No keys, tokens or third-party scripts. The only external request is the optional Google Fonts stylesheet; the app falls back to system fonts without it.

## Roadmap ideas

Live service data if Metro Railway publishes a feed; verified station coordinates and exits; Bengali station names;
the Pink and Purple extensions once open; walking-transfer notes from official sources.

MetroGate is an independent project, not affiliated with Metro Railway, Kolkata. No third-party franchise art or assets are used.
