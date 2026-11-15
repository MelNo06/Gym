# Gym

A personal workout log that runs as a Home Screen web app on the iPhone. It works offline and keeps all data on the device.

The interface is black, graphite and chalk-white with no hue of its own, so that every colour on screen is a muscle group.

- **Workout:** log sets against your previous session, with set types, notes, routines and live record badges.
- **History:** month and year calendar, every past workout, back-filling and editing.
- **Progress:** every logged exercise with its trend (tap for its graphs), and sets per week for each muscle group.
- **Exercises:** about 170 built-in exercises plus your own, each with graphs, all-time records and session history.
- **Me:** body weight, height, age, your gyms, backup and restore.
- **Colours:** each exercise belongs to a muscle group with one of 12 fixed colours. Each gym has one of five shades. A graph line is the exercise's colour in the gym's shade (`js/colors.js`).
- **Gyms:** every workout can be tagged with a gym. Previous values and records are kept per gym.

## Install on an iPhone

1. Open the site in Safari.
2. Share → Add to Home Screen.

The Home Screen app stores its data separately from Safari. Removing the icon deletes the data, so export a backup from the Me tab now and then.

## How the numbers are computed

- **Estimated 1RM:** Epley `w·(1 + r/30)` and Brzycki `w·36/(37 − r)`, from sets of 1–10 reps. The app shows the midpoint and the gap between the two. The gap is not the real uncertainty.
- **Bodyweight exercises** (pull-ups, dips): load = body weight on that day ± added or assisting weight.
- **Volume:** sets × reps × load. Warm-up sets are left out of volume, records and 1RM.
- **Trend:** least-squares line through the per-session values in the selected range.

## Development

Plain HTML, CSS and ES modules. There is no build step and there are no dependencies; GitHub Pages serves the repository root.

- `js/store.js` data model and IndexedDB persistence
- `js/stats.js` loads, 1RM, records, trends
- `js/charts.js` SVG charts
- `js/views/` one file per screen
- `sw.js` offline cache

**With every change, bump `VERSION` in `sw.js` and `APP_VERSION` in `js/store.js`.** Installed copies only fetch new files when `sw.js` changes. A new file must also be added to the `ASSETS` list in `sw.js`.

Run the unit tests for the maths with `node tests/stats.test.mjs`. To try the app locally, run `python3 -m http.server` in this folder and open `http://localhost:8000`.

The display typeface is Barlow Condensed (SIL Open Font License, see `fonts/OFL.txt`).
