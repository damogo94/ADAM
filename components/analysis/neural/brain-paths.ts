/**
 * Geometría compartida del núcleo cerebro + descriptores de layout del
 * ConfluenceHero "pipeline neuronal" (estado running de /analysis).
 *
 * El cerebro se define en COORDENADAS LOCALES centradas ~ (240, 292); cada
 * layout lo coloca/escala con un `transform` SVG. Una sola geometría sirve a
 * desktop y portrait (el prototipo la duplicaba; aquí se de-duplica).
 *
 * Portado de design/adam-analysis-running.html (variante de cerebro `top-detailed`,
 * elegida por el owner). NO es decoración: las sinapsis se etiquetan por REGIÓN
 * (a1/a2/a3/deb) y solo se encienden cuando el agente real aterriza.
 */

export type Region = 'a1' | 'a2' | 'a3' | 'deb' | 'est';

/** Contorno anatómico (dos hemisferios + lóbulos). Clase: brainline. */
export const BRAIN_OUTLINE =
  'M240 236 C231 228 220 230 216 238 C210 232 199 234 197 242 C188 238 178 244 178 253 ' +
  'C168 252 159 260 159 270 C150 271 156 281 159 285 C151 290 152 301 159 305 ' +
  'C153 312 158 323 167 325 C170 335 182 341 194 339 C203 348 219 350 230 344 ' +
  'C236 348 244 348 250 344 C261 350 277 348 286 339 C298 341 310 335 313 325 ' +
  'C322 323 327 312 321 305 C328 301 329 290 321 285 C324 281 330 271 321 270 ' +
  'C321 260 312 252 302 253 C302 244 292 238 283 242 C281 234 270 232 264 238 ' +
  'C260 230 249 228 240 236 Z';

/** Cisura interhemisférica central. */
export const BRAIN_FISSURE =
  'M240 236 C236 250 244 258 240 270 C236 282 244 292 240 304 C236 316 245 328 240 344';

/** Circunvoluciones (gyri/sulci), espejadas por hemisferio. */
export const BRAIN_GYRI: string[] = [
  'M232 244 C220 246 216 256 224 262 C214 266 213 277 222 280',
  'M214 250 C200 250 192 260 200 268 C189 272 188 284 198 287',
  'M196 258 C181 258 174 270 184 278 C172 282 171 295 183 298',
  'M179 270 C166 272 162 284 173 290 C162 295 163 308 175 310',
  'M170 286 C160 290 159 301 169 305 C161 311 165 320 176 320',
  'M224 282 C212 286 210 297 220 301 C211 307 213 318 224 319',
  'M205 292 C193 296 191 307 202 311 C194 318 198 328 209 327',
  'M232 304 C221 308 220 319 230 323 C222 330 227 339 236 337',
  'M248 244 C260 246 264 256 256 262 C266 266 267 277 258 280',
  'M266 250 C280 250 288 260 280 268 C291 272 292 284 282 287',
  'M284 258 C299 258 306 270 296 278 C308 282 309 295 297 298',
  'M301 270 C314 272 318 284 307 290 C318 295 317 308 305 310',
  'M310 286 C320 290 321 301 311 305 C319 311 315 320 304 320',
  'M256 282 C268 286 270 297 260 301 C269 307 267 318 256 319',
  'M275 292 C287 296 289 307 278 311 C286 318 282 328 271 327',
  'M248 304 C259 308 260 319 250 323 C258 330 253 339 244 337',
];

export interface Synapse {
  cx: number;
  cy: number;
  region: Region;
  /** Orden de encendido centro→fuera (índice por distancia al centroide). */
  order: number;
}

const RAW_SYNAPSES: { cx: number; cy: number; region: Region }[] = [
  { cx: 208, cy: 254, region: 'a1' },
  { cx: 186, cy: 272, region: 'a1' },
  { cx: 272, cy: 254, region: 'a2' },
  { cx: 294, cy: 272, region: 'a2' },
  { cx: 172, cy: 298, region: 'deb' },
  { cx: 308, cy: 298, region: 'deb' },
  { cx: 214, cy: 292, region: 'a3' },
  { cx: 266, cy: 292, region: 'a3' },
  { cx: 228, cy: 322, region: 'a3' },
];

// Centroide → orden de stagger (centro hacia fuera).
const CENTROID = {
  x: RAW_SYNAPSES.reduce((s, p) => s + p.cx, 0) / RAW_SYNAPSES.length,
  y: RAW_SYNAPSES.reduce((s, p) => s + p.cy, 0) / RAW_SYNAPSES.length,
};
const distToCentroid = (p: { cx: number; cy: number }) =>
  Math.hypot(p.cx - CENTROID.x, p.cy - CENTROID.y);

const sortedByDist = [...RAW_SYNAPSES.keys()].sort(
  (a, b) => distToCentroid(RAW_SYNAPSES[a]!) - distToCentroid(RAW_SYNAPSES[b]!)
);
const ORDER_OF = new Map<number, number>();
sortedByDist.forEach((rawIdx, order) => ORDER_OF.set(rawIdx, order));

export const BRAIN_SYNAPSES: Synapse[] = RAW_SYNAPSES.map((p, i) => ({
  ...p,
  order: ORDER_OF.get(i)!,
}));

export interface WebEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ra: Region;
  rb: Region;
}

// Red de dendritas: cada sinapsis con sus 2 vecinas más cercanas (sin duplicados).
function computeWeb(): WebEdge[] {
  const seen = new Set<string>();
  const edges: WebEdge[] = [];
  RAW_SYNAPSES.forEach((p, i) => {
    const order = [...RAW_SYNAPSES.keys()]
      .filter((j) => j !== i)
      .sort(
        (a, b) =>
          Math.hypot(RAW_SYNAPSES[a]!.cx - p.cx, RAW_SYNAPSES[a]!.cy - p.cy) -
          Math.hypot(RAW_SYNAPSES[b]!.cx - p.cx, RAW_SYNAPSES[b]!.cy - p.cy)
      );
    for (const j of order.slice(0, 2)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const q = RAW_SYNAPSES[j]!;
      edges.push({ x1: p.cx, y1: p.cy, x2: q.cx, y2: q.cy, ra: p.region, rb: q.region });
    }
  });
  return edges;
}

export const BRAIN_WEB: WebEdge[] = computeWeb();

/** Origen visual del cerebro por layout (centro tras el transform). */
export const BRAIN_LOCAL_CENTER = { x: 240, y: 292 };

// ─── Descriptores de layout ──────────────────────────────────────────────────

export interface ChipLayout {
  agent: 'a1' | 'a2' | 'a3' | 'est';
  cx: number;
  cy: number;
  /** Centro del readout (etiqueta encima del chip). */
  readoutY: number;
  isolated?: boolean;
}

export interface CableLayout {
  /** Región que energiza este cable (su corriente fluye cuando esa región settled). */
  region: Region;
  d: string;
  plug: [number, number];
  isolated?: boolean;
}

export interface DebateLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HeroLayout {
  viewBox: string;
  /** Transform del grupo .brain. */
  brainTransform: string;
  /** transform-origin del .brain (para coreBreath). */
  brainOrigin: string;
  chips: ChipLayout[];
  cables: CableLayout[];
  debate: DebateLayout;
  divider: { x1: number; y1: number; x2: number; y2: number };
  nucleoLabel: { x: number; y: number };
  verdict: { x: number; y: number; w: number; h: number };
}

export const DESKTOP_LAYOUT: HeroLayout = {
  viewBox: '0 28 480 344',
  brainTransform: 'translate(240 268) scale(0.92) translate(-240 -292)',
  brainOrigin: '240px 268px',
  chips: [
    { agent: 'a1', cx: 120, cy: 66, readoutY: 50 },
    { agent: 'a2', cx: 290, cy: 66, readoutY: 50 },
    { agent: 'a3', cx: 430, cy: 66, readoutY: 50, isolated: true },
  ],
  cables: [
    { region: 'a1', d: 'M120 78 C120 106 150 122 185 138', plug: [185, 138] },
    { region: 'a2', d: 'M290 78 C290 106 262 122 245 138', plug: [245, 138] },
    { region: 'deb', d: 'M215 164 C215 186 228 200 240 219', plug: [240, 219] },
    { region: 'a3', d: 'M430 78 C430 140 408 212 312 250', plug: [312, 250], isolated: true },
  ],
  debate: { x: 172, y: 136, w: 86, h: 28 },
  divider: { x1: 352, y1: 52, x2: 352, y2: 242 },
  nucleoLabel: { x: 240, y: 330 },
  verdict: { x: 150, y: 338, w: 180, h: 26 },
};

export const PORTRAIT_LAYOUT: HeroLayout = {
  viewBox: '0 0 360 496',
  brainTransform: 'translate(180 350) scale(1.16) translate(-240 -292)',
  brainOrigin: '180px 350px',
  chips: [
    { agent: 'a1', cx: 96, cy: 64, readoutY: 46 },
    { agent: 'a2', cx: 264, cy: 64, readoutY: 46 },
    { agent: 'a3', cx: 330, cy: 150, readoutY: 134, isolated: true },
  ],
  cables: [
    { region: 'a1', d: 'M96 76 C96 116 122 150 160 168', plug: [160, 168] },
    { region: 'a2', d: 'M264 76 C264 116 238 150 200 168', plug: [200, 168] },
    { region: 'deb', d: 'M180 196 C180 234 180 262 180 285', plug: [180, 285] },
    {
      region: 'a3',
      d: 'M330 162 C330 240 330 305 300 342 C285 360 270 372 252 378',
      plug: [252, 378],
      isolated: true,
    },
  ],
  debate: { x: 137, y: 168, w: 86, h: 28 },
  divider: { x1: 300, y1: 60, x2: 300, y2: 430 },
  nucleoLabel: { x: 180, y: 438 },
  verdict: { x: 100, y: 446, w: 160, h: 28 },
};

/** Etiqueta de dominio por agente (readout mientras calibra). */
export const AGENT_DOMAIN: Record<'a1' | 'a2' | 'a3' | 'est', string> = {
  a1: 'activos',
  a2: 'macro',
  a3: 'técnico',
  est: 'estructura',
};
