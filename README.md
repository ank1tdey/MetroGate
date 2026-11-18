# MetroGate Kolkata v0.2 — Network Explorer

A mobile-first metro network explorer and route-planning prototype.

## What is included
- Home / journey planner
- All five line sections in the starter network dataset
- Station pickers across lines
- Route graph and up to four simple route candidates
- Verified operational interchange edges only
- Original interactive schematic SVG map
- Line explorer with station lists
- Responsive mobile interface

## Important research and accuracy caveats
This is a researched starter dataset, not an official Metro Railway product or a guaranteed live route planner.
- Coordinates, exact transfer walking paths, platform numbers, fares and journey times are not included because they have not been independently verified in this dataset.
- Noapara (Blue–Yellow) and Esplanade (Blue–Green) are included as operational transfer edges.
- Kavi Subhash (Blue–Orange) is deliberately marked unverified and excluded from route calculation pending confirmation of current passenger interchange operations.
- Purple Line is represented only to Majherhat; the extension towards Esplanade is not represented as operational.
- The Orange Line is represented only to Beleghata; do not assume the proposed Sector V extension is open.
- Station sequence and status must be checked against the latest official notices before real-world use.

## Run locally
Use VS Code Live Server or:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000

## Deploy
Push the folder to GitHub. In repository Settings → Pages, select the branch and root directory. Test the HTTPS deployment on iPhone Safari.

## Project structure
- `index.html` — app shell and views
- `css/styles.css` — responsive visual system
- `data/network.json` — lines, stations, connections, transfers and source metadata
- `js/data.js` — fetch and validate network dataset
- `js/router.js` — graph construction and simple-path enumeration
- `js/map.js` — original SVG schematic map
- `js/app.js` — navigation, UI rendering and route search

## Routing note
The current engine enumerates simple paths in the graph and ranks them by transfer count and then ride hops. It is a foundation, not yet a fully optimized Yen's k-shortest-path or Dijkstra implementation. Travel-time optimization must wait for verified time weights.

## Image and map note
The schematic map is original SVG artwork created for this project. It is not copied from Google Images. For a public map reference, see the Metro Railway site and the network-map links in the README. Confirm reuse/licensing before embedding third-party map artwork.

## Security
- No credentials or API keys.
- No location permission or tracking in this version.
- No external JavaScript libraries.
- User-provided values are rendered with textContent.
- This is static hosting; GitHub Pages does not run a server-side backend.
