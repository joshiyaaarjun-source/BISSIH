
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('@ayocore/exceljs');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

// Static project data lives inside the deployment.
const PROJECT_DATA = path.join(ROOT, 'data');

// Runtime-generated data must live in /tmp on Vercel.
const RUNTIME_DATA = process.env.VERCEL
  ? path.join('/tmp', 'bissih-data')
  : PROJECT_DATA;

const UP = process.env.VERCEL
  ? path.join('/tmp', 'bissih-uploads')
  : path.join(ROOT, 'uploads');

fs.mkdirSync(RUNTIME_DATA, { recursive: true });
fs.mkdirSync(UP, { recursive: true });

const DATA = RUNTIME_DATA;

const LOCAL_DB = path.join(DATA, 'db.json');
if (!fs.existsSync(LOCAL_DB)) {
  fs.writeFileSync(LOCAL_DB, JSON.stringify({
    products: [], standards: [], licences: [], evidence: [], scans: [], chat: [], imports: []
  }, null, 2));
}
const localRead = () => JSON.parse(fs.readFileSync(LOCAL_DB, 'utf8'));
const localWrite = x => fs.writeFileSync(LOCAL_DB, JSON.stringify(x, null, 2));
const id = () => crypto.randomUUID();

let mongoClient = null;
let mongoDb = null;
let mongoReady = false;

async function connectMongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.log('MONGO_URI not set — using local JSON fallback.');
    const d = localRead();
    if (!d.qco_appliances || !d.qco_appliances.length) {
      const source = path.join(PROJECT_DATA, 'bis_qco_electrical_appliances_dataset.json');
      if (fs.existsSync(source)) {
        const rows = JSON.parse(fs.readFileSync(source, 'utf8'));
        d.qco_appliances = rows.map(normalizeQco);
        localWrite(d);
        console.log(`Loaded QCO dataset locally: ${d.qco_appliances.length} documents`);
      }
    }
    return;
  }
  mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await mongoClient.connect();
  mongoDb = mongoClient.db(process.env.MONGO_DB || 'bis_compliance');
  mongoReady = true;
  console.log(`MongoDB connected: ${mongoDb.databaseName}`);
  await seedQcoIfEmpty();
}

async function seedQcoIfEmpty() {
  const coll = mongoDb.collection('qco_appliances');
  await coll.createIndex({ product_id: 1 }, { unique: true });
  await coll.createIndex({ category: 1 });
  await coll.createIndex({ appliance_name: 'text', notes: 'text', 'qco_reference.applicable_standard': 'text' });
  const count = await coll.countDocuments();
  if (count > 0) {
    console.log(`QCO dataset already present: ${count} documents`);
    return;
  }
  const source = path.join(PROJECT_DATA, 'bis_qco_electrical_appliances_dataset.json');
  if (!fs.existsSync(source)) return;
  const rows = JSON.parse(fs.readFileSync(source, 'utf8'));
  const docs = rows.map(normalizeQco);
  if (docs.length) {
    await coll.bulkWrite(docs.map(doc => ({
      updateOne: { filter: { product_id: doc.product_id }, update: { $set: doc }, upsert: true }
    })), { ordered: false });
    console.log(`Seeded QCO dataset: ${docs.length} documents`);
  }
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}
function normalizeQco(row) {
  return {
    product_id: String(row.product_id || '').trim(),
    sr_no: Number(row.sr_no || 0),
    appliance_name: String(row.appliance_name || '').trim(),
    category: String(row.category || '').trim(),
    is_dc_battery_variant: Boolean(row.is_dc_battery_variant),
    notes: String(row.notes || '').trim(),
    qco_reference: {
      applicable_standard: String(row.applicable_standard || row.qco_reference?.applicable_standard || '').trim(),
      international_equivalent: String(row.international_equivalent || row.qco_reference?.international_equivalent || '').trim(),
      qco_instrument: String(row.qco_instrument || row.qco_reference?.qco_instrument || '').trim(),
      qco_order_name: String(row.qco_order_name || row.qco_reference?.qco_order_name || '').trim(),
      certification_scheme: String(row.certification_scheme || row.qco_reference?.certification_scheme || '').trim()
    },
    compliance_deadlines: {
      general: parseDate(row.compliance_deadline_general || row.compliance_deadlines?.general),
      small: parseDate(row.compliance_deadline_small || row.compliance_deadlines?.small),
      micro: parseDate(row.compliance_deadline_micro || row.compliance_deadlines?.micro)
    }
  };
}

async function qcoFind(query = {}) {
  if (!mongoReady) {
    const d = localRead();
    let rows = d.qco_appliances || [];
    if (query.category) rows = rows.filter(x => x.category === query.category);
    if (query.search) {
      const s = query.search.toLowerCase();
      rows = rows.filter(x => `${x.appliance_name} ${x.notes} ${x.category}`.toLowerCase().includes(s));
    }
    return rows;
  }
  return mongoDb.collection('qco_appliances').find(query.filter || {}).limit(query.limit || 100).toArray();
}

async function findQcoMatch(name, category) {
  const text = `${name || ''} ${category || ''}`.trim();
  if (!text) return null;
  if (mongoReady) {
    const coll = mongoDb.collection('qco_appliances');
    const terms = text.split(/[^a-zA-Z0-9]+/).filter(x => x.length > 2).slice(0, 8);
    if (terms.length) {
      const regex = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      const exact = await coll.findOne({ appliance_name: { $regex: regex, $options: 'i' } });
      if (exact) return exact;
      const cat = await coll.findOne({ category: { $regex: String(category || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } });
      if (cat) return cat;
    }
    return null;
  }
  const rows = (localRead().qco_appliances || []);
  const low = text.toLowerCase();
  return rows.find(x => low.includes(String(x.appliance_name || '').toLowerCase()) ||
    String(x.appliance_name || '').toLowerCase().split(/\s+/).some(t => t.length > 3 && low.includes(t))) || null;
}

async function saveProduct(p) {
  if (mongoReady) {
    await mongoDb.collection('products').updateOne({ id: p.id }, { $set: p }, { upsert: true });
  } else {
    const d = localRead(); d.products.push(p); localWrite(d);
  }
}
async function allProducts() {
  if (mongoReady) return mongoDb.collection('products').find({}).sort({ createdAt: -1 }).toArray();
  return localRead().products;
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(ROOT, 'public')));
const upload = multer({ dest: UP, limits: { fileSize: 50 * 1024 * 1024 } });

app.get('/api/health', async (req, res) => {
  res.json({ ok: true, name: 'BIS COMPASS', database: mongoReady ? 'MongoDB' : 'Local JSON fallback', qcoCollection: mongoReady ? 'qco_appliances' : 'local qco_appliances', time: new Date().toISOString() });
});

app.get('/api/products', async (req, res) => res.json(await allProducts()));

app.get('/api/qco/categories', async (req, res) => {
  if (mongoReady) {
    const rows = await mongoDb.collection('qco_appliances').aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray();
    return res.json(rows.map(x => ({ category: x._id, count: x.count })));
  }
  const rows = localRead().qco_appliances || [];
  const m = {}; rows.forEach(x => m[x.category] = (m[x.category] || 0) + 1);
  res.json(Object.entries(m).map(([category, count]) => ({ category, count })));
});

app.get('/api/qco/search', async (req, res) => {
  const search = String(req.query.search || '').trim();
  const category = String(req.query.category || '').trim();
  if (mongoReady) {
    const filter = {};
    if (category) filter.category = category;
    if (search) filter.$or = [
      { appliance_name: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { notes: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { 'qco_reference.applicable_standard': { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
    ];
    return res.json(await mongoDb.collection('qco_appliances').find(filter).limit(50).toArray());
  }
  res.json(await qcoFind({ search, category }));
});

app.get('/api/qco/:productId', async (req, res) => {
  const row = mongoReady
    ? await mongoDb.collection('qco_appliances').findOne({ product_id: req.params.productId })
    : (localRead().qco_appliances || []).find(x => x.product_id === req.params.productId);
  if (!row) return res.status(404).json({ error: 'QCO product not found' });
  res.json(row);
});

app.post('/api/products', async (req, res) => {
  const b = req.body || {};
  if (!b.productName) return res.status(400).json({ error: 'Product name is required' });
  const qco = await findQcoMatch(b.productName, b.category);
  const p = {
    id: id(), manufacturer: b.manufacturer || '', name: b.productName, model: b.model || '',
    factory: b.factory || '', category: b.category || '', licence: b.licence || '',
    mode: b.mode || 'small', status: 'Needs review', readiness: qco ? 78 : 55,
    createdAt: new Date().toISOString(), qcoMatch: qco ? {
      product_id: qco.product_id, appliance_name: qco.appliance_name, category: qco.category,
      applicable_standard: qco.qco_reference?.applicable_standard || '',
      certification_scheme: qco.qco_reference?.certification_scheme || '',
      compliance_deadlines: qco.compliance_deadlines || {}
    } : null,
    roadmap: [
      ['Product identification', qco ? 'verified' : 'review'],
      ['Applicable standard', qco ? 'verified' : 'review'],
      ['Testing requirements', 'pending'],
      ['Documentation', 'pending'],
      ['Licence / certification', 'pending'],
      ['Final review', 'pending']
    ].map(x => ({ name: x[0], status: x[1] }))
  };
  await saveProduct(p);
  res.status(201).json(p);
});

app.post('/api/products/blueprint', async (req, res) => {
  const b = req.body || {}, n = Math.min(Math.max(Number(b.count) || 1, 1), 500), created = [];
  for (let i = 1; i <= n; i++) {
    const name = b.name || `Blueprint Product ${i}`;
    const qco = await findQcoMatch(name, b.category);
    const p = {
      id: id(), manufacturer: b.manufacturer || 'Blueprint Manufacturer', name,
      model: b.modelPrefix ? `${b.modelPrefix}-${String(i).padStart(3, '0')}` : `BP-${String(i).padStart(3, '0')}`,
      factory: b.factory || '', category: b.category || 'Electrical Appliances', mode: 'large',
      status: 'Needs review', readiness: qco ? 78 : 55, createdAt: new Date().toISOString(),
      qcoMatch: qco ? { product_id: qco.product_id, appliance_name: qco.appliance_name, applicable_standard: qco.qco_reference?.applicable_standard || '' } : null,
      roadmap: []
    };
    await saveProduct(p); created.push(p);
  }
  res.status(201).json({ created, count: created.length });
});

async function storeUpload(collection, req, res, build) {
  if (!req.file) return res.status(400).json({ error: 'File required' });
  const x = build(req.file, req.body || {});
  if (mongoReady) await mongoDb.collection(collection).insertOne(x);
  else { const d = localRead(); (d[collection] || (d[collection] = [])).push(x); localWrite(d); }
  res.status(201).json(x);
}
app.post('/api/documents', upload.single('file'), (req, res) => storeUpload('standards', req, res, (f) => ({ id: id(), name: f.originalname, path: f.filename, mime: f.mimetype, size: f.size, status: 'uploaded', createdAt: new Date().toISOString() })));
app.post('/api/licences', upload.single('file'), (req, res) => storeUpload('licences', req, res, (f) => ({ id: id(), name: f.originalname, path: f.filename, size: f.size, status: 'AI review queued', checks: ['Manufacturer consistency', 'Product/scope consistency', 'Standard reference', 'Validity/date presence'], createdAt: new Date().toISOString() })));
app.post('/api/evidence', upload.single('file'), (req, res) => storeUpload('evidence', req, res, (f,b) => ({ id: id(), name: f.originalname, path: f.filename, size: f.size, productId: b.productId || null, status: 'Uploaded', createdAt: new Date().toISOString() })));

app.post('/api/vision/scan', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image required' });
  const x = { id: id(), name: req.file.originalname, path: req.file.filename, size: req.file.size, productId: req.body.productId || null, status: 'analysis_ready', createdAt: new Date().toISOString() };
  if (mongoReady) await mongoDb.collection('scans').insertOne(x);
  else { const d = localRead(); d.scans.push(x); localWrite(d); }
  res.status(201).json(x);
});

app.post('/api/import/database', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Database file required' });
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    let rows = [];
    if (ext === '.json') {
      const parsed = JSON.parse(fs.readFileSync(req.file.path, 'utf8'));
      rows = Array.isArray(parsed) ? parsed : (parsed.products || parsed.data || []);
    } else {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(req.file.path);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) throw new Error('No worksheet found in Excel file');
      const headers = [];
      worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber - 1] = String(cell.value ?? '').trim();
      });
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const obj = {};
        headers.forEach((header, i) => {
          if (header) {
            const value = row.getCell(i + 1).value;
            obj[header] = value == null ? '' : (typeof value === 'object' && value.text ? value.text : value);
          }
        });
        if (Object.keys(obj).length) rows.push(obj);
      });
    }
    let count = 0, qcoCount = 0;
    if (rows.some(r => r.product_id || r.appliance_name || r.applicable_standard)) {
      const docs = rows.map(normalizeQco).filter(x => x.product_id && x.appliance_name);
      if (mongoReady) {
        const coll = mongoDb.collection('qco_appliances');
        await coll.createIndex({ product_id: 1 }, { unique: true });
        if (docs.length) await coll.bulkWrite(docs.map(doc => ({ updateOne: { filter: { product_id: doc.product_id }, update: { $set: doc }, upsert: true } })), { ordered: false });
      } else {
        const d = localRead(); d.qco_appliances = docs; localWrite(d);
      }
      count = docs.length; qcoCount = docs.length;
    } else {
      for (const r of rows) {
        const name = r.productName || r.name || r['Product Name'] || r.product || '';
        if (!name) continue;
        const p = { id: id(), manufacturer: r.manufacturer || r.Manufacturer || '', name, model: r.model || r.Model || r.SKU || '', factory: r.factory || r['Factory location'] || '', category: r.category || r.Category || '', licence: r.licence || r.Licence || '', mode: r.mode || 'large', status: r.status || 'Needs review', readiness: Number(r.readiness) || 78, createdAt: new Date().toISOString(), roadmap: [] };
        await saveProduct(p); count++;
      }
    }
    if (mongoReady) await mongoDb.collection('imports').insertOne({ id: id(), name: req.file.originalname, count, qcoCount, createdAt: new Date().toISOString() });
    else { const d = localRead(); d.imports.push({ id: id(), name: req.file.originalname, count, qcoCount, createdAt: new Date().toISOString() }); localWrite(d); }
    fs.unlinkSync(req.file.path);
    res.json({ ok: true, count, qcoCount, database: mongoReady ? 'MongoDB' : 'Local JSON fallback' });
  } catch (e) {
    res.status(400).json({ error: 'Could not read database file', detail: e.message });
  }
});



const OFFICIAL_BIS = {
  microwave: {
    product: 'Microwave Oven',
    standard: 'IS 302-2-25:2014',
    standardTitle: 'Safety of household and similar electrical appliances: Part 2 Particular requirements: Section 25 Microwave ovens, including combination microwave ovens',
    generalStandard: 'IS 302-1:2008 + A3:2014',
    source: 'BIS Uniform Test Report Format',
    sourceUrl: 'https://www.bis.gov.in/PDF/UTRFs/UTRF_IS_302_2_25_Microwave_Oven.pdf',
    testingUrl: 'https://lims.bis.gov.in/home/search_is_number/?is_number__doc_no=302',
    certificationUrl: 'https://www.bis.gov.in/product-certification/product-certification-process/?lang=en',
    applicationUrl: 'https://www.bis.gov.in/apply-for-a-license/?lang=en',
    tests: ['Marking and instructions', 'Protection against live parts', 'Power input and current', 'Heating', 'Leakage current and electric strength at operating temperature', 'Impulse voltage', 'Humidity treatment', 'Microwave/radiation safety and door/interlock related requirements'],
    timeline: { testing: 'Indicative: 2–6 weeks', application: 'Indicative: 2–4 months', total: 'Indicative planning window: 3–5 months' }
  }
};

function normalizeText(v){ return String(v || '').trim().toLowerCase(); }
function detectBISProduct(name, category){
  const t = normalizeText(`${name} ${category}`);
  if (t.includes('microwave')) return OFFICIAL_BIS.microwave;
  return null;
}

async function buildComplianceGraph(input={}) {
  const name = input.productName || input.name || 'Unknown product';
  const category = input.category || '';
  const special = detectBISProduct(name, category);
  const qco = await findQcoMatch(name, category);
  const uploaded = (input.evidenceNames || []).map(x => normalizeText(x));
  const has = (...terms) => uploaded.some(n => terms.some(t => n.includes(t)));

  if (!special && !qco) {
    return { verified: false, product: { name, category }, message: 'No verified BIS mapping found in the current 90-product catalogue for this classification. COMPASS will not invent an IS/QCO number. Validate against official BIS sources.', nodes: [], edges: [], priorities: [], resources: [] };
  }

  const isMicrowave = !!special;
  const standard = special ? special.standard : qco.qco_reference?.applicable_standard;
  const standardTitle = special ? special.standardTitle : `Applicable BIS standard from the 90-product QCO dataset: ${standard}`;
  const qcoOrder = qco?.qco_reference?.qco_order_name || 'Official QCO record not mapped for this exact product';
  const scheme = qco?.qco_reference?.certification_scheme || 'Use the applicable BIS conformity-assessment pathway shown by the official BIS source';

  const nodes = [
    {id:'product', type:'product', label:name, status:'DONE', priority:'P0', detail:'Product identity/classification is the starting point for the BIS mapping.'},
    {id:'standard', type:'standard', label:standard, status:has('standard','is302','302-2-25')?'DONE':(isMicrowave?'DONE':'REVIEW'), priority:'P0', detail:standardTitle, sourceUrl:special?.sourceUrl || 'https://www.bis.gov.in/know-your-standard/?lang=en'},
    {id:'qco', type:'qco', label:'QCO / Regulatory applicability', status:qco?'DONE':'REVIEW', priority:'P0', detail:qco ? qcoOrder : (isMicrowave ? 'No microwave-specific row exists in the bundled 90-product dataset. Related oven/cooking-appliance family rows are present, but they are not treated as a substitute for the microwave-specific BIS requirement. Verify the current official BIS/Government notification before claiming QCO applicability.' : 'No QCO row for this exact product in the bundled 90-product dataset; verify the current official BIS/Government notification before claiming applicability.'), sourceUrl:'https://www.bis.gov.in/product-certification/products-under-compulsory-certification/?lang=en'},
    {id:'scheme', type:'scheme', label:'BIS conformity / certification pathway', status:has('certificate','licence','license','registration')?'DONE':'MISSING', priority:'P0', detail:scheme, sourceUrl:special?.certificationUrl || 'https://www.bis.gov.in/product-certification/product-certification-process/?lang=en'},
    {id:'testing', type:'testing', label:'Laboratory testing evidence', status:has('test','lab','report')?'DONE':'MISSING', priority:'P0', detail:isMicrowave ? special.tests.join(' • ') : 'Use the applicable standard and BIS laboratory scope to determine the required tests.', sourceUrl:special?.testingUrl || 'https://lims.bis.gov.in/'},
    {id:'documents', type:'evidence', label:'Technical / compliance documents', status:has('technical','spec','manual','bom','document')?'DONE':'REVIEW', priority:'P1', detail:'Manufacturer, model, ratings, technical specification, instructions and other applicable documentary evidence.'},
    {id:'marking', type:'marking', label:'Marking / label evidence', status:has('mark','label','photo','image')?'DONE':'REVIEW', priority:'P1', detail:'Visible product marking and instructions should be checked against the applicable BIS requirements.'},
    {id:'application', type:'application', label:'BIS application / submission', status:has('application','submitted','acknowledg')?'DONE':'MISSING', priority:'P0', detail:'Follow the official BIS application/certification route applicable to the product and scheme.', sourceUrl:special?.applicationUrl || 'https://www.bis.gov.in/apply-for-a-license/?lang=en'},
    {id:'final', type:'final', label:'Final compliance readiness', status:'REVIEW', priority:'P2', detail:'COMPASS readiness is an evidence-tracking aid, not a legal declaration of certification.'}
  ];
  const weights={product:5,standard:15,qco:10,scheme:15,testing:20,documents:10,marking:10,application:10,final:5};
  let score=0; nodes.forEach(n=>{ if(n.status==='DONE') score += weights[n.id]; else if(n.status==='REVIEW') score += weights[n.id]*0.5; });
  score=Math.round(score);

  const priorities = nodes.filter(n=>['MISSING','REVIEW'].includes(n.status)).map(n=>({id:n.id, title:n.label, priority:n.priority, status:n.status, why:n.detail, action: actionForNode(n.id), sourceUrl:n.sourceUrl||null})).sort((a,b)=>a.priority.localeCompare(b.priority));
  const resources = [
    {title:'BIS Know Your Standard', url:'https://www.bis.gov.in/know-your-standard/?lang=en', kind:'BIS standard discovery'},
    {title:'BIS Product Certification Process', url:'https://www.bis.gov.in/product-certification/product-certification-process/?lang=en', kind:'Official BIS process'},
    {title:'BIS Apply for a License', url:'https://www.bis.gov.in/apply-for-a-license/?lang=en', kind:'Official BIS application guidance'},
    {title:'BIS LIMS — laboratories and scopes', url:'https://lims.bis.gov.in/', kind:'Official BIS laboratory directory'},
    ...(special?[{title:'Microwave UTRF — BIS', url:special.sourceUrl, kind:'Official BIS test-report format'}]:[])
  ];
  const timeline = special ? special.timeline : {testing:'Indicative: 2–6 weeks',application:'Indicative: 2–4 months',total:'Indicative planning window: 3–5 months'};
  return {verified:true, product:{name,category}, standard, standardTitle, qco:qco||null, readiness:score, nodes, edges:[['product','standard'],['standard','qco'],['standard','testing'],['testing','scheme'],['documents','scheme'],['marking','final'],['scheme','application'],['application','final'],['testing','final']], priorities, resources, timeline, disclaimer:'Timelines are indicative planning estimates, not BIS service-level guarantees. Only official BIS sources are treated as regulatory authority.'};
}
function actionForNode(id){
  return ({
    standard:'Confirm the applicable Indian Standard from the official BIS source and attach the source document.',
    qco:'Verify the current QCO / government notification for the exact product classification.',
    scheme:'Identify the applicable BIS conformity-assessment scheme and gather the required application evidence.',
    testing:'Find a BIS laboratory with scope for the applicable IS number, complete required tests, and upload the report.',
    documents:'Upload technical specifications, ratings, instructions, manufacturer details and other applicable evidence.',
    marking:'Upload a clear label/product photograph and check visible marking/instructions against the applicable BIS requirements.',
    application:'Use the official BIS application route for the applicable scheme and retain the acknowledgement/submission evidence.',
    final:'Resolve all P0 blockers, then complete final human review before claiming certification/compliance.'
  }[id] || 'Review the official BIS requirement and attach evidence.');
}

app.post('/api/compliance/graph', async (req,res)=>{
  try { res.json(await buildComplianceGraph(req.body||{})); }
  catch(e){ res.status(500).json({error:'Could not build compliance graph', detail:e.message}); }
});

app.get('/api/compliance/microwave', async (req,res)=>res.json(await buildComplianceGraph({productName:'Microwave Oven',category:'Electrical Appliance',evidenceNames:req.query.evidence ? String(req.query.evidence).split(',') : []})));

app.post('/api/chat', async (req, res) => {
  const msg = String(req.body.message || '').trim();
  if (!msg) return res.status(400).json({ error: 'Message required' });
  const l = msg.toLowerCase();
  let a = '';
  const matches = await qcoFind({ search: msg });
  if (matches.length) {
    const r = matches[0];
    a = `I found a QCO match: ${r.appliance_name}. Applicable standard: ${r.qco_reference?.applicable_standard || 'not listed'}. Certification: ${r.qco_reference?.certification_scheme || 'not listed'}.`;
  } else if (l.includes('standard')) {
    a = 'COMPASS can retrieve applicable standards from the QCO knowledge base and uploaded source documents.';
  } else if (l.includes('licence') || l.includes('license')) {
    a = 'The licence is stored for an AI-assisted consistency review across manufacturer, product, standard, scope and validity.';
  } else {
    a = 'I can help with QCO products, standards, evidence, licence review, scans and your compliance roadmap.';
  }
  const row = { id: id(), question: msg, answer: a, createdAt: new Date().toISOString() };
  if (mongoReady) await mongoDb.collection('chat').insertOne(row);
  else { const d = localRead(); d.chat.push(row); localWrite(d); }
  res.json({ answer: a, matches: matches.slice(0, 5) });
});

app.use((req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

function startServer(port, attemptsLeft = 10) {
  const server = app.listen(port, () => {
    console.log('');
    console.log(`BIS COMPASS running at http://localhost:${port}`);
    if (port !== Number(PORT)) {
      console.log(`Port ${PORT} was already in use, so BIS COMPASS automatically switched to port ${port}.`);
    }
    console.log('Keep this terminal open while using the app.');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      const nextPort = Number(port) + 1;
      console.log(`Port ${port} is already in use. Trying ${nextPort}...`);
      setTimeout(() => startServer(nextPort, attemptsLeft - 1), 150);
      return;
    }
    console.error('Could not start BIS COMPASS:', err.message);
    process.exit(1);
  });
}

connectMongo().then(() => {
  startServer(Number(PORT));
}).catch(err => {
  console.error('MongoDB connection failed:', err.message);
  console.error('Fix MONGO_URI or remove it to use the local JSON fallback.');
  process.exit(1);
});

process.on('SIGINT', async () => { if (mongoClient) await mongoClient.close(); process.exit(0); });
app.post('/api/translate', async (req, res) => {
  try {
    const { text, target } = req.body;

    if (!text || !target) {
      return res.status(400).json({
        error: 'Text and target language are required'
      });
    }

    const response = await fetch(
      'https://translation.googleapis.com/language/translate/v2?' +
      new URLSearchParams({
        key: process.env.GOOGLE_TRANSLATE_API_KEY
      }),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: text,
          source: 'en',
          target: target,
          format: 'text'
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json({
      translatedText:
        data.data.translations[0].translatedText
    });

  } catch (error) {
    console.error('Translation error:', error);

    res.status(500).json({
      error: 'Translation failed'
    });
  }
});
