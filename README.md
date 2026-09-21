# BIS COMPASS — BIS-First Compliance Intelligence App

A locally hostable BIS compliance demonstration built around the bundled 90-product electrical-appliance QCO dataset.

## What this version does

- Uses the bundled 90-product BIS/QCO dataset as the primary product-to-standard mapping source.
- Never invents an IS/QCO number when the dataset has no verified mapping.
- Adds a verified microwave mapping from official BIS material: **IS 302-2-25:2014**.
- Builds a clickable compliance knowledge graph with:
  - product identification
  - applicable BIS standard
  - QCO / regulatory applicability
  - BIS conformity/certification pathway
  - laboratory testing evidence
  - technical/documentary evidence
  - marking/label evidence
  - BIS application/submission
  - final readiness
- Shows DONE / MISSING / REVIEW states.
- Prioritizes open work as P0 / P1 / P2.
- Gives the next action for each missing/review item.
- Links to official BIS pages for standards, certification, applications and BIS LIMS laboratories.
- Shows an indicative planning timeline. These are **not BIS service-level guarantees**.
- Accepts product images and supporting PDFs/documents for a local demo workflow.
- Supports MongoDB Atlas, with an automatic local JSON fallback if `MONGO_URI` is not configured.
- Keeps the supplied 90-product JSON/XLSX dataset bundled in `data/`.

## Important BIS rule

This app is intentionally BIS-first. The regulatory graph is not allowed to turn generic ISO/IEC or other third-party information into a BIS requirement.

For the microwave demo, BIS's official Uniform Test Report Format identifies **IS 302-2-25:2014** for microwave ovens. The bundled 90-product dataset does not contain a microwave-specific row; it contains related oven/cooking-appliance family records. The app therefore shows the microwave-specific BIS standard separately and does not pretend that a related dataset row is the same thing.

## Run locally

### Option A — Windows batch launcher

Double-click `START_BIS_COMPASS.bat`.

### Option B — Command Prompt

```bat
cd BIS_COMPASS_APP
npm install
npm start
```

Then open:

`http://localhost:3000`

Keep the terminal window open while using the application.

## MongoDB Atlas (optional)

1. Create a MongoDB Atlas cluster.
2. Create a database user.
3. Allow your current IP address in Network Access.
4. Copy the Node.js connection string.
5. Create a `.env` file beside `server.js`:

```env
MONGO_URI=mongodb+srv://USERNAME:PASSWORD@YOUR_CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGO_DB=bis_compliance
PORT=3000
```

6. Run `npm install` and `npm start`.

The application will seed the bundled 90-row dataset into `qco_appliances` if the collection is empty.

If `MONGO_URI` is absent, the app automatically uses `data/db.json` and still works locally.

## Judge demo — Microwave

1. Open the **Knowledge Graph** tab.
2. Click **Load microwave demo**.
3. The graph loads a microwave case with a partially completed evidence state.
4. Click graph nodes to inspect:
   - exact BIS standard
   - source
   - status
   - priority
   - why it applies
   - next action
5. Open the official BIS links from the right-hand panel.
6. Upload a microwave image under **Upload product image**.
7. Upload a test report / standard PDF / label image under **Upload BIS standards / evidence**.
8. Rebuild the graph. Evidence filenames are used to demonstrate DONE/REVIEW/MISSING matching.

## 90-product database

The bundled database is:

`data/bis_qco_electrical_appliances_dataset.json`

and

`data/bis_qco_electrical_appliances_dataset.xlsx`

The backend also exposes:

- `GET /api/qco/categories`
- `GET /api/qco/search?search=kettle`
- `GET /api/qco/:productId`
- `POST /api/compliance/graph`
- `GET /api/compliance/microwave`

## Evidence boundary

A photograph is not certification. The image workflow can help identify a product and visible evidence, but it cannot prove laboratory testing, factory controls, or formal BIS certification.

The readiness score is an evidence-tracking aid for the demo and should not be represented as a legal certification decision.
