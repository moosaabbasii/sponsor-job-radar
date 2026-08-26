import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dataPath = join(root, 'data', 'store.json');
const publicDir = join(root, 'public');
const port = Number(process.env.PORT || 3000);
let refreshing = false;

// Seeded from the MyVisaJobs FY2025 IT/Math H-1B LCA report.  These are
// employer leads, not claims that every current opening offers sponsorship.
const h1bUniverse = [
  ['Amazon.Com Services',11786],['Cognizant Technology Solutions Us',10915],['Microsoft',8312],['Tata Consultancy Services',7796],['Google',7440],['Meta Platforms',5663],['Infosys',5116],['Ernst & Young U.S',4496],['Wal-Mart Associates',3906],['Apple',3902],['Amazon Web Services',3328],['Deloitte Consulting',3030],['Ibm',2983],['Jpmorgan Chase &',2896],['Capgemini America',2740],['Hcl America',2740],['Accenture',2685],['Ltimindtree',2540],['Amazon Development Center U.S',2409],['Compunnel Software Group',2259],['Wipro',2127],['Salesforce',1662],['Mphasis',1661],['Fidelity Technology Group, Llc D/B/A Fidelity Investments',1649],['Tech Mahindra (Americas)',1150],['Oracle America',1099],['Bytedance',1022],['Nvidia',1001],['Citibank, N.A',999],['Adobe',985],['Cisco Systems',980],['Paypal',961],['Federal Express',911],['Ust Global',830],['Intel',814],['U.S. Bank National Association',809],['Tiktok',769],['Tesla',762],['Kforce',760],['Cgi Technologies And Solutions',743],['Virtusa',740],['Linkedin',736],['Randstad Digital',731],['Capital One Services',728],['Uber Technologies',727],['Qualcomm Technologies',710],['Charter Communications',698],['Bank Of America N.A',687],['Servicenow',674],['Ford Motor',635],['American Express Travel Related Services',629],['Hexaware Technologies',623],['Morgan Stanley Services Group',612],['Optum Services',606],['Amazon Data Services',591],['Visa Technology & Operations',589],['Skilltune Technologies',580],['Comcast Cable Communications',572],['Deloitte & Touche',566],['Barclays Services',561],['Charles Schwab &',558],['At&T Services',556],['Infinite Computer Solutions',554],['Pricewaterhousecoopers Advisory Services',551],['Wells Fargo Bank, N.A',549],['Synechron',541],['Mastercard Technologies',526],['Persistent Systems',504],['Goldman Sachs Services',496],['Palo Alto Networks',490],['Hewlett Packard Enterprise',477],['Elevance Health',477],['Fis Management Services',474],['Goldman Sachs &',474],['Ebay',462],['Adp Technology Services',460],['Doordash',457],['Fidelity Technology Group',457],['T-Mobile Usa',446],['Innova Solutions',440],['Expedia',435],['Intuit',425],['Fiserv Solutions',410],['Caremark',407],['Citiustech',404],['Capital One, National Association',399],['Mastech Digital Technologies',394],['Cvs Pharmacy',390],['Visa U.S.A',388],['Lowe\'s Companies',388],['Dfs Corporate Services',381],['Snap',377],['People Tech Group',367],['Bloomberg',365],['General Motors',362],['Infocons',361],['Htc Global Services',358],['V-Soft Consulting Group',353],['Sap America',352],['Snowflake',351]
].map(([name, h1bLcas], index) => ({
  id: `h1b-${String(index + 1).padStart(3, '0')}`,
  name, ats: null, board: null, sponsorship: 'historical-evidence', category: 'unmapped',
  h1bLcas, h1bRank: index + 1, fiscalYear: 2025, source: 'MyVisaJobs IT/Math H-1B LCA report'
}));

const seed = {
  companies: [
    { id: 'ashby', name: 'Ashby', ats: 'ashby', board: 'Ashby', sponsorship: 'unknown', category: 'direct', h1bLcas: null },
    { id: 'lever', name: 'Lever', ats: 'lever', board: 'lever', sponsorship: 'unknown', category: 'direct', h1bLcas: null }
  ],
  jobs: [],
  lastRefresh: null,
  lastRefreshSummary: null
};

async function store() {
  if (!existsSync(dataPath)) {
    await mkdir(dirname(dataPath), { recursive: true });
    await writeFile(dataPath, JSON.stringify(seed, null, 2));
    return structuredClone(seed);
  }
  const db = JSON.parse(await readFile(dataPath, 'utf8'));
  const existingIds = new Set(db.companies.map((company) => company.id));
  const missing = h1bUniverse.filter((company) => !existingIds.has(company.id));
  if (missing.length) { db.companies.push(...missing); await save(db); }
  return db;
}
async function save(value) { await writeFile(dataPath, JSON.stringify(value, null, 2)); }
const id = (value) => createHash('sha256').update(value).digest('hex').slice(0, 24);
const asText = (value) => (value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

async function getJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'SponsorJobRadar/0.1 (personal job tracker)' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function collect(company) {
  if (company.ats === 'greenhouse') {
    const json = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company.board)}/jobs?content=true`);
    return json.jobs.map((job) => ({
      externalId: String(job.id), title: job.title, location: job.location?.name || 'Unspecified',
      department: job.departments?.map((d) => d.name).join(', ') || '', url: job.absolute_url,
      description: asText(job.content), postedAt: job.updated_at || null, sourceUpdatedAt: job.updated_at || null,
      remote: /remote|anywhere/i.test(`${job.title} ${job.location?.name || ''}`)
    }));
  }
  if (company.ats === 'lever') {
    const json = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(company.board)}?mode=json`);
    return json.map((job) => ({
      externalId: job.id, title: job.text, location: job.categories?.location || 'Unspecified',
      department: job.categories?.team || job.categories?.department || '', url: job.hostedUrl,
      description: asText(job.descriptionPlain || job.description), postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
      sourceUpdatedAt: job.updatedAt ? new Date(job.updatedAt).toISOString() : null,
      remote: /remote|anywhere/i.test(`${job.text} ${job.categories?.location || ''} ${job.descriptionPlain || ''}`)
    }));
  }
  if (company.ats === 'ashby') {
    const json = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company.board)}?includeCompensation=true`);
    return (json.jobs || []).filter((job) => job.isListed !== false).map((job) => ({
      externalId: job.id || job.jobUrl, title: job.title, location: job.location || 'Unspecified',
      department: job.department || job.team || '', url: job.jobUrl || job.applyUrl,
      description: asText(job.descriptionPlain || job.descriptionHtml), postedAt: job.publishedAt || null,
      sourceUpdatedAt: job.updatedAt || job.publishedAt || null, remote: Boolean(job.isRemote) || /remote|anywhere/i.test(`${job.title} ${job.location || ''}`),
      compensation: job.compensation?.summary || null
    }));
  }
  throw new Error(`Unsupported ATS: ${company.ats}`);
}

async function refresh(companyIds) {
  if (refreshing) throw new Error('A refresh is already running.');
  refreshing = true;
  try {
    const db = await store();
    const selected = companyIds?.length ? db.companies.filter((c) => companyIds.includes(c.id)) : db.companies;
    const targets = selected.filter((company) => company.ats && company.board);
    const now = new Date().toISOString();
    const results = await Promise.all(targets.map(async (company) => {
      try { return { company, jobs: await collect(company), error: null }; }
      catch (error) { return { company, jobs: [], error }; }
    }));
    let added = 0, updated = 0;
    const errors = [];
    for (const result of results) {
      const { company, jobs, error } = result;
      company.lastCheckedAt = now;
      if (error) { company.lastError = error.message; errors.push(`${company.name}: ${error.message}`); continue; }
      company.lastError = null;
      const liveKeys = new Set(jobs.map((raw) => `${company.id}:${raw.externalId}`));
      for (const job of db.jobs) if (job.companyId === company.id && job.status === 'open' && !liveKeys.has(job.key)) job.status = 'closed';
      for (const raw of jobs) {
        const key = `${company.id}:${raw.externalId}`;
        const fingerprint = id(JSON.stringify([raw.title, raw.location, raw.department, raw.description, raw.sourceUpdatedAt]));
        const existing = db.jobs.find((job) => job.key === key);
        if (existing) { Object.assign(existing, raw, { fingerprint, lastSeenAt: now, status: 'open' }); updated++; }
        else { db.jobs.push({ ...raw, key, id: id(key), companyId: company.id, companyName: company.name, ats: company.ats, fingerprint, firstSeenAt: now, lastSeenAt: now, status: 'open' }); added++; }
      }
    }
    db.lastRefresh = now;
    db.lastRefreshSummary = { added, updated, companies: targets.length, errors };
    await save(db);
    return db.lastRefreshSummary;
  } finally { refreshing = false; }
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
function filteredJobs(db, query) {
  const q = (query.get('q') || '').toLowerCase();
  const company = query.get('company') || '';
  const remote = query.get('remote') === 'true';
  const hours = Number(query.get('hours') || 0);
  const cutoff = hours ? Date.now() - hours * 3600000 : 0;
  return db.jobs.filter((job) => {
    const haystack = `${job.title} ${job.companyName} ${job.location} ${job.department} ${job.description}`.toLowerCase();
    return job.status === 'open' && (!q || haystack.includes(q)) && (!company || job.companyId === company) && (!remote || job.remote) && (!cutoff || new Date(job.firstSeenAt).getTime() >= cutoff);
  }).sort((a, b) => new Date(b.firstSeenAt) - new Date(a.firstSeenAt));
}

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/status') { const db = await store(); return send(res, 200, { ...db.lastRefreshSummary, lastRefresh: db.lastRefresh, refreshing, jobs: db.jobs.length, companies: db.companies }); }
    if (url.pathname === '/api/jobs') { const db = await store(); return send(res, 200, { jobs: filteredJobs(db, url.searchParams) }); }
    if (url.pathname === '/api/companies') { const db = await store(); return send(res, 200, { companies: db.companies }); }
    if (url.pathname === '/api/refresh' && req.method === 'POST') { const summary = await refresh(); return send(res, 200, summary); }
    if (url.pathname === '/api/companies' && req.method === 'POST') {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw); const db = await store();
      if (!input.name || !input.ats || !input.board || !['greenhouse', 'lever', 'ashby'].includes(input.ats)) return send(res, 400, { error: 'Name, supported ATS, and board token are required.' });
      const company = { id: id(`${input.name}:${input.ats}:${input.board}`), name: input.name.trim(), ats: input.ats, board: input.board.trim(), sponsorship: input.sponsorship || 'unknown', category: input.category || 'direct', h1bLcas: null };
      db.companies.push(company); await save(db); return send(res, 201, { company });
    }
    const file = url.pathname === '/' ? join(publicDir, 'index.html') : join(publicDir, url.pathname);
    if (!file.startsWith(publicDir) || !existsSync(file)) return send(res, 404, 'Not found', 'text/plain');
    return send(res, 200, await readFile(file, 'utf8'), mime[extname(file)] || 'text/plain');
  } catch (error) { return send(res, 500, { error: error.message }); }
}).listen(port, () => console.log(`Sponsor Job Radar running at http://localhost:${port}`));
