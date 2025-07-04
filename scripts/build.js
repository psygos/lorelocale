// Build script for Hidden Places
// Generate static HTML into dist/ from data JSON files.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import DottedMapPkg from 'dotted-map';
const DottedMap = DottedMapPkg.default || DottedMapPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DIST_DIR = path.join(ROOT, 'dist');
const TEMPLATE_DIR = path.join(ROOT, 'src', 'templates');
const ASSETS_SRC = path.join(ROOT, 'src');

// Ensure dist dir
fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

// Copy static assets (styles.css & enhance.js) directly to dist root
['styles.css', 'enhance.js'].forEach((fname) => {
  const src = path.join(ASSETS_SRC, fname);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(DIST_DIR, fname));
  }
});

const indexTemplate = fs.readFileSync(path.join(TEMPLATE_DIR, 'index.html'), 'utf8');
const cityTemplate = fs.readFileSync(path.join(TEMPLATE_DIR, 'city.html'), 'utf8');
const editionsTemplate = fs.readFileSync(path.join(TEMPLATE_DIR, 'editions.html'), 'utf8');

// Helper: render simple {{key}} placeholders (no loops)
function simpleRender(template, data) {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
    // Support dot notation
    const value = key.split('.').reduce((acc, k) => acc?.[k], data);
    return value != null ? value : '';
  });
}

// ---- Data layout normalisation -------------------------------------------
// We enforce: each city has its own directory, and edition files are numbered
//   data/<city>/<n>.json  (edition n)
// Any legacy file of the form data/<city>.json (excluding cities.json) is
// migrated automatically into data/<city>/0.json on first build.

fs.readdirSync(DATA_DIR).forEach((entry) => {
  if (entry.endsWith('.json') && entry !== 'cities.json') {
    const slug = path.basename(entry, '.json');
    const dirPath = path.join(DATA_DIR, slug);
    const srcPath = path.join(DATA_DIR, entry);
    // Create directory if needed
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath);
    const destPath = path.join(dirPath, '0.json');
    if (!fs.existsSync(destPath)) {
      fs.renameSync(srcPath, destPath);
    } else {
      // Destination already exists; remove the legacy file to avoid confusion
      fs.unlinkSync(srcPath);
    }
  }
});

// Gather city slugs: now directories only.
let citySlugs = [];
fs.readdirSync(DATA_DIR).forEach((entry) => {
  const full = path.join(DATA_DIR, entry);
  if (fs.lstatSync(full).isDirectory()) {
    citySlugs.push(entry);
  }
});

// (Re)generate cities.json strictly from directory list so downstream UIs are consistent.
const citiesJsonPath = path.join(DATA_DIR, 'cities.json');
citySlugs = Array.from(new Set(citySlugs)).sort();
fs.writeFileSync(
  citiesJsonPath,
  JSON.stringify(
    citySlugs.map((s) => ({ slug: s, name: s.charAt(0).toUpperCase() + s.slice(1) })),
    null,
    2
  )
);

// Create dotted map background (grid only)
const worldMap = new DottedMap({ height: 60, grid: 'vertical' });

let cityCirclesSvg = '';

// Utility: zero-pad edition numbers (e.g., 0 -> "00")
function padEdition(n) {
  return String(n).padStart(2, '0');
}

// Collect city data first to generate city pages and circles
citySlugs.forEach((slug) => {
  const cityDir = path.join(DATA_DIR, slug);
  const editions = fs
    .readdirSync(cityDir)
    .filter((f) => f.endsWith('.json') && /^(\d+)\.json$/.test(f))
    .map((f) => Number(path.basename(f, '.json')))
    .sort((a, b) => a - b);

  if (editions.length === 0) {
    console.warn(`⚠️  No edition JSON found in ${cityDir}; skipping city.`);
    return;
  }

  const getEditionPath = (ed) => path.join(cityDir, `${ed}.json`);

  // Use edition 0 for world map representation (or the first available)
  const reprEdition = editions.includes(0) ? 0 : editions[0];
  const cityDataForPin = JSON.parse(fs.readFileSync(getEditionPath(reprEdition), 'utf8'));

  // Determine representative coordinates for the city
  let cityLat, cityLon;
  if (typeof cityDataForPin.city?.latitude === 'number' && typeof cityDataForPin.city?.longitude === 'number') {
    cityLat = cityDataForPin.city.latitude;
    cityLon = cityDataForPin.city.longitude;
  } else {
    const coords = cityDataForPin.places.filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number');
    if (coords.length) {
      cityLat = coords.reduce((sum, p) => sum + p.latitude, 0) / coords.length;
      cityLon = coords.reduce((sum, p) => sum + p.longitude, 0) / coords.length;
    }
  }

  if (typeof cityLat === 'number' && typeof cityLon === 'number') {
    const pin = worldMap.getPin({ lat: cityLat, lng: cityLon });
    const cityNameRaw = cityDataForPin.city?.name || slug;
    const cityNameEsc = cityNameRaw.replace(/"/g, '&quot;');
    const latestEdition = editions[editions.length - 1];
    cityCirclesSvg += `\n  <a xlink:href="${slug}-edition-${padEdition(latestEdition)}.html" target="_self"><g class="city-pin" data-label="${cityNameEsc}"><circle cx="${pin.x}" cy="${pin.y}" r="0.6" fill="#c8a882" stroke="#8b7355" stroke-width="0.1" /><text class="city-label" x="${pin.x}" y="${pin.y - 1.2}" text-anchor="middle">${cityNameRaw}</text></g></a>`;
  }

  // Build each edition page
  editions.forEach((edNum) => {
    const data = JSON.parse(fs.readFileSync(getEditionPath(edNum), 'utf8'));
    const edHtml = buildCityPage(data, slug, edNum);
    const edFileName = `${slug}-edition-${padEdition(edNum)}.html`;
    fs.writeFileSync(path.join(DIST_DIR, edFileName), edHtml);

    // No alias page; edition-specific only.
  });

  // Build edition selection page
  const cityName = cityDataForPin.city?.name || slug;
  const editionLinksHtml = editions
    .map((ed) => {
      const pad = padEdition(ed);
      return `<a class="edition-link" href="${slug}-edition-${pad}.html">edition: ${pad}</a>`;
    })
    .join('\n');

  const editionsHtmlPage = simpleRender(editionsTemplate, {
    city_name: cityName,
    city_slug: slug,
    edition_links_html: editionLinksHtml,
  });
  fs.writeFileSync(path.join(DIST_DIR, `${slug}-editions.html`), editionsHtmlPage);
});

// Base grid SVG
let svgMap = worldMap.getSVG({
  radius: 0.2,
  color: '#d4d0c8',
  backgroundColor: '#faf9f7',
  shape: 'circle',
});

// Inject city circles before closing tag
svgMap = svgMap.replace('</svg>', `${cityCirclesSvg}\n</svg>`);

// Build index page
const indexHtml = simpleRender(indexTemplate, {
  map_svg: svgMap,
});
fs.writeFileSync(path.join(DIST_DIR, 'index.html'), indexHtml);

console.log('Build complete – pages written to dist/.');

// ---------------- city page builder -------------
function buildCityPage(data, slug, editionNum) {
  // Compute relative positions for markers based on bounding box of all places
  const minLat = Math.min(...data.places.map((p) => p.latitude));
  const maxLat = Math.max(...data.places.map((p) => p.latitude));
  const minLon = Math.min(...data.places.map((p) => p.longitude));
  const maxLon = Math.max(...data.places.map((p) => p.longitude));

  const getPos = (lat, lon) => {
    let top, left;
    if (maxLat !== minLat) {
      top = ((maxLat - lat) / (maxLat - minLat)) * 80 + 10; // padding 10%
    } else {
      top = 50;
    }
    if (maxLon !== minLon) {
      left = ((lon - minLon) / (maxLon - minLon)) * 80 + 10;
    } else {
      left = 50;
    }
    return { top: top.toFixed(2), left: left.toFixed(2) };
  };

  // Build markers HTML & cards & capture positions
  const markerPositions = [];
  // Lightweight quadtree node
  class QTNode {
    constructor(x, y, w, h, cap = 4) {
      this.x = x; this.y = y; this.w = w; this.h = h; this.cap = cap;
      this.points = [];
      this.divided = false;
    }
    contains(p){return p.x>=this.x&&p.x<this.x+this.w&&p.y>=this.y&&p.y<this.y+this.h;}
    intersects(cx,cy,r){const dx=Math.max(this.x-cx,0,cx-(this.x+this.w));const dy=Math.max(this.y-cy,0,cy-(this.y+this.h));return dx*dx+dy*dy<=r*r;}
    subdivide(){const hw=this.w/2,hh=this.h/2;this.nw=new QTNode(this.x,this.y,hw,hh,this.cap);this.ne=new QTNode(this.x+hw,this.y,hw,hh,this.cap);this.sw=new QTNode(this.x,this.y+hh,hw,hh,this.cap);this.se=new QTNode(this.x+hw,this.y+hh,hw,hh,this.cap);this.divided=true;}
    insert(p){if(!this.contains(p))return false;if(this.points.length<this.cap){this.points.push(p);return true;}if(!this.divided)this.subdivide();return this.nw.insert(p)||this.ne.insert(p)||this.sw.insert(p)||this.se.insert(p);} 
    query(cx,cy,r,found){if(!this.intersects(cx,cy,r))return;for(const p of this.points){if((p.x-cx)**2+(p.y-cy)**2<=r**2)found.push(p);}if(this.divided){this.nw.query(cx,cy,r,found);this.ne.query(cx,cy,r,found);this.sw.query(cx,cy,r,found);this.se.query(cx,cy,r,found);}}
  }

  const markersHtml = data.places
    .map((p) => {
      // If explicit percentages provided, use them directly; else derive from lat/lon
      const percTop = p.topPercent != null ? p.topPercent : getPos(p.latitude, p.longitude).top;
      const percLeft = p.leftPercent != null ? p.leftPercent : getPos(p.latitude, p.longitude).left;

      markerPositions.push({ t: parseFloat(percTop), l: parseFloat(percLeft) });

      const markerClass = `marker-${p.marker}`;
      const safeName = p.name.replace(/"/g, '&quot;');
      if (p.marker === 'text') {
        const label = p.markerLabel ?? p.type;
        return `<button class="marker marker-text" style="top:${percTop}%;left:${percLeft}%" data-place="${p.id}" data-label="${safeName}">${label}</button>`;
      }
      return `<div class="marker ${markerClass}" style="top:${percTop}%;left:${percLeft}%" data-place="${p.id}" data-label="${safeName}"></div>`;
    })
    .join('\n');

  const placeCardsHtml = data.places
    .map((p) => {
      const stories = p.stories.map((s) => `<p class="place-story">${s}</p>`).join('\n');
      const sources = p.sources
        .map((s) => `<div><a href="${s.url}" target="_blank">${s.title}</a></div>`)
        .join('');
      return `
<div class="place-card" id="card-${p.id}">
  <button class="place-close">×</button>
  <div class="place-type">${p.type}</div>
  <h3 class="place-name">${p.name}</h3>
  <p class="place-soul">${p.soul}</p>
  ${stories}
  <div class="place-source"><strong>sources:</strong><br>${sources}</div>
  <p class="place-details">${p.details}</p>
</div>`;
    })
    .join('\n');

  // ----------- quadtree-based fragment placement -------------
  const qt = new QTNode(0, 0, 100, 100);
  markerPositions.forEach((p) => qt.insert({ x: p.l, y: p.t }));
  const radius = 8; // minimum percent distance
  const fragmentsHtml = data.fragments
    .map((f, idx) => {
      let top, left, attempts = 0;
      while (attempts < 40) {
        const seed = idx * 97 + attempts * 31;
        top = ( (seed * 37) % 80) + 10;
        left = ((seed * 71) % 80) + 10;
        const nearby = [];
        qt.query(left, top, radius, nearby);
        if (nearby.length === 0) break;
        attempts++;
      }
      qt.insert({ x: left, y: top });
      return `<div class="fragment" style="top:${top}%;left:${left}%" data-fragment="${f.id}">${f.short.replace(/\n/g, '<br>')}</div>`;
    })
    .join('\n');

  const fragmentCardsHtml = data.fragments
    .map((f) => {
      return `
<div class="fragment-expanded" id="fragment-${f.id}">
  <button class="fragment-close">×</button>
  <p>${f.long}</p>
</div>`;
    })
    .join('\n');

  // ---- legend ------------------------------------------------------------
  const MARKER_ORDER = ['dot', 'square', 'line', 'ring', 'cross', 'text'];
  const usedTypes = new Set(data.places.map((p) => p.marker));
  const legendHtml = MARKER_ORDER
    .filter((type) => usedTypes.has(type) && data.legend[type])
    .map((type) => {
      const desc = data.legend[type];
      const icon = type === 'text'
        ? `<span class="marker marker-text legend-icon">T</span>`
        : `<span class="marker marker-${type} legend-icon"></span>`;
      return `<div class="legend-item">${icon}<span>${desc}</span></div>`;
    })
    .join('');

  const page = simpleRender(cityTemplate, {
    page_title: `${data.city.name} · Unflattened`,
    city_name: data.city.name,
    city_tagline: data.city.tagline,
    accent_color: data.style.accentColor,
    font_family: data.style.font,
    markers_html: markersHtml,
    fragments_html: fragmentsHtml,
    legend_html: legendHtml,
    place_cards_html: placeCardsHtml,
    fragment_cards_html: fragmentCardsHtml,
    edition_padded: padEdition(editionNum),
    edition_select_url: `${slug}-editions.html`,
  });
  return page;
}