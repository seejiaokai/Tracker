/* Rebuild the baked "A/G - A/A 2026" chart layout to mirror the FG Master
 * Annex B course map (pages B-23..B-32) as rendered in the user's screenshots
 * (9 Aug 2026). The document reads bottom-to-top, page after page; the app
 * draws top-to-bottom, so each page is flipped and the pages are stacked in
 * course order. x/y below come from reading positions off the screenshots
 * (doc pixels), flipped and scaled so rows sit ~88px apart like every other
 * chart in the app.
 *
 * Vocabulary used to mirror the drawing:
 *  - chains down a column      -> plain prerequisite edges (straight verticals)
 *  - side boxes tapping a column at their own height -> __edgeMeta fromSide/toSide
 *  - buses / collector rails   -> the app's default shared-rail routing (+mid where
 *                                 children sit at different heights)
 *  - the long H wire (DAAR)    -> plain edges: feeds -> DAAR -> DAAR/NAAR -> ST-18
 *  - the NN wire (SA-4 feeding NTR-1 four pages later, tapping off the wire
 *    between SA-4 and SA-5)    -> one free line anchored on that edge
 *  - junction vs crossing      -> coincident segments look joined; genuine
 *                                 crossings keep the hop arc; edge-over-line
 *                                 crossings get explicit unmerge entries so the
 *                                 NN line is hopped, not silently joined.
 */
import fs from 'fs';
import url from 'url';
import path from 'path';

const root = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const SYL_NAME = 'A/G - A/A 2026';

const { SYLLABI } = await import(path.join(root, 'src/data/syllabi.js'));
const syl = SYLLABI[SYL_NAME];
if (!syl) throw new Error('syllabus not found: ' + SYL_NAME);

const N = {};                 // id -> {x,y}
const EM = {};                // edgeMeta
const put = (id, x, y) => {
  if (N[id]) throw new Error('duplicate node ' + id);
  N[id] = { x, y };
};
const K = (p, c) => p + '▸' + c;
const em = (p, c, m) => { EM[K(p, c)] = m; };

/* ---------------- B-23 : ST-01 .. T-02 / OPS-01 ---------------- */
put('ST-01', 417, 60);
put('ACG-01', 417, 158);
put('ST-02', 643, 210);
put('ACG-02', 417, 276);
put('ACG-06', 723, 380);
put('ACG-03', 281, 430); put('ACG-04', 417, 430); put('ACG-05', 566, 430);
put('ACG-07', 723, 454);
put('ACG-08', 417, 582);
put('ACG-09', 417, 682);
put('ST-06', 643, 734);
put('CFT-01', 417, 785);
put('T-01', 417, 876);
put('AVI-01', 417, 962); put('ST-03', 200, 962);
put('AVI-02', 281, 1110); put('AVI-03', 417, 1110); put('AVI-04', 566, 1110);
put('IAT-01', 343, 1318); put('AVI-05', 494, 1318);
put('T-02', 417, 1468); put('OPS-01', 737, 1468);

em('ST-02', 'ACG-02', { fromSide: 'W', toSide: 'N' });
em('ST-06', 'CFT-01', { fromSide: 'W', toSide: 'N' });
/* one shared rail under ACG-02 even though ACG-06 sits higher than the trio */
for (const c of ['ACG-03', 'ACG-04', 'ACG-05', 'ACG-06'])
  em('ACG-02', c, { mid: { x: N[c].x, y: 340 } });

/* ---------------- B-24 : AVI-06..TR(S)-1 ---------------- */
put('AVI-06', 237, 1618); put('AVI-07', 345, 1618); put('AVI-08', 460, 1618); put('AVI-09', 566, 1618);
put('IAT-02', 345, 1757); put('AVI-10', 460, 1757);
put('T-03', 400, 1887);
put('AVI-12', 400, 1997);
put('AVI-11', 237, 2100); put('AVI-14', 400, 2100);
put('AVI-15', 400, 2202);
put('IAT-03', 345, 2352); put('AVI-16', 460, 2352); put('OPS-02', 570, 2344);
put('OPS-04', 765, 2474);
put('T-04', 400, 2525);
put('ST-04', 195, 2581);
put('OPS-03', 672, 2645);
put('ST-05', 195, 2647);
put('TR(S)-1', 400, 2709);

em('T-03', 'AVI-11', { mid: { x: 237, y: 1940 } });     /* branch off the T-03 riser */
em('ST-04', 'TR(S)-1', { fromSide: 'E', toSide: 'N' });
em('ST-05', 'TR(S)-1', { fromSide: 'E', toSide: 'N' });
em('OPS-03', 'TR(S)-1', { fromSide: 'W', toSide: 'N' });
em('OPS-02', 'TR(S)-1', { mid: { x: 400, y: 2616 } });  /* joins the riser between ST-04 and ST-05 */

/* ---------------- B-25 : sim column, TR chain, radar column ---------------- */
put('ST-16', 200, 2992); put('TR(S)-2', 470, 2992); put('T-05', 737, 2992);
put('JMP-01', 200, 3067); put('CFT-02', 470, 3072); put('EPT-01', 110, 3086);
put('RDR-01', 737, 3139); put('CFT-03', 470, 3161); put('EPT-02', 110, 3168);
put('RDR-02', 737, 3229); put('CFT-04', 470, 3245);
put('RDR-03', 737, 3315); put('TR(S)-3', 470, 3336); put('TR-1(P)', 260, 3348);
put('TR(S)-4', 470, 3446); put('RDR-04', 737, 3462);
put('TR-2', 260, 3542); put('IAT-04', 645, 3568); put('RDR-05', 795, 3568);
put('TR(S)-5', 470, 3617);
put('T-06', 737, 3699); put('TR(S)-6', 470, 3709);
put('EW-01', 737, 3790); put('TR(S)-LAO', 470, 3806);
put('TR-3', 260, 3819);
put('EW-02', 737, 3877);
put('TR(S)-7', 470, 3905);
put('IAT-05', 737, 3976);
put('EPE', 470, 3993);
put('T-07', 737, 4072);
put('TR-4', 260, 4120);

em('ST-16', 'TR-1(P)', { fromSide: 'E', toSide: 'N' });
em('JMP-01', 'TR-1(P)', { fromSide: 'E', toSide: 'N' });
em('EPT-02', 'TR-1(P)', { fromSide: 'E', toSide: 'N' });
em('TR(S)-3', 'TR-1(P)', { fromSide: 'W', toSide: 'N' });
em('TR(S)-4', 'TR-2', { fromSide: 'W', toSide: 'N' });
em('TR(S)-6', 'TR-3', { fromSide: 'W', toSide: 'N' });
em('EPE', 'TR-4', { fromSide: 'W', toSide: 'N' });

/* ---------------- B-26 : AAW bus, AAM column, INT sims, H-wire start ---------------- */
put('AAW-01', 630, 4350); put('AAW-02', 734, 4350);
put('AAS-04', 352, 4361);
put('IEPE/IPC', 435, 4430);
put('AAW-03', 577, 4449); put('AAW-04', 682, 4449); put('AAW-05', 786, 4449);
put('TR-5(P)', 260, 4510);
put('IAT-06', 617, 4537); put('ST-16B', 732, 4537);
put('T-08', 682, 4638);
put('AAM-01', 682, 4721);
put('TR-6(P)', 260, 4766);
put('AAM-02', 682, 4800);
put('ST-11', 507, 4830);
put('AAM-03', 682, 4880);
put('AAM-04', 682, 4952);
put('ST-09', 507, 4998);
put('AAM-05', 682, 5038);
put('IAT-07', 682, 5132);
put('AAS-01', 682, 5244);
put('AHC-1', 260, 5356); put('INT(S)-1', 435, 5356); put('AAS-02', 682, 5356);
put('INT(S)-2', 435, 5452); put('AAS-03', 682, 5452);
put('INT(S)-3', 435, 5555); put('IAT-08', 682, 5553);
put('DAAR', 150, 6609);                          /* one ball, in-line on the long H wire */
put('INT-1', 260, 5694); put('INT(S)-4', 435, 5694); put('T-10', 682, 5649);

em('IEPE/IPC', 'TR-5(P)', { fromSide: 'W', toSide: 'N' });
em('AAS-04', 'TR-5(P)', { fromSide: 'W', toSide: 'N' });
em('ST-11', 'INT(S)-1', { fromSide: 'W', toSide: 'N' });
em('ST-09', 'INT(S)-1', { fromSide: 'W', toSide: 'N' });
em('IAT-07', 'INT(S)-1', { fromSide: 'W', toSide: 'N' });
em('INT(S)-1', 'AHC-1', { fromSide: 'W', toSide: 'E' });
em('INT(S)-4', 'INT-1', { fromSide: 'W', toSide: 'E' });
em('AAS-04', 'T-10', { fromSide: 'S', toSide: 'W', mid: { x: 380, y: 4420 } });
/* the three user-confirmed DAAR feeds, all joining the H wire at x=150 */
em('TR-4', 'DAAR', { fromSide: 'W', toSide: 'N' });
em('AAS-04', 'DAAR', { fromSide: 'W', toSide: 'N' });
em('INT(S)-2', 'DAAR', { fromSide: 'W', toSide: 'N' });
/* T-10 sits just above INT(S)-4 and to its right; without sides the default
   elbow lands arrowless on the ball's shoulder (agent-audit find, 9 Aug) */
em('T-10', 'INT(S)-4', { fromSide: 'W', toSide: 'E' });

/* ---------------- B-27 : LASDT, AGR/AGD/AGS ladder, SA(S)-1 ---------------- */
put('JMP-03', 390, 5926); put('AAM-09', 573, 5926); put('AGR-01', 757, 5926);
put('OPS-05', 390, 6020); put('ST-10 LASDT', 573, 6020); put('AGR-02', 757, 6022);
put('LASDT(S)-1', 480, 6073);
put('AGR-03', 757, 6105);
put('LASDT-1', 260, 6164);
put('AGR-04', 757, 6191);
put('IAT-09', 757, 6276);
put('T-11', 757, 6369);
put('AGS-01', 643, 6468); put('AGD-01', 757, 6468);
put('LASDT-2', 260, 6511);
put('AGS-02', 643, 6562); put('AGD-02', 757, 6562);
put('AGS-03', 643, 6652); put('AGD-03', 757, 6652);
put('AGD-04', 757, 6746);
put('AGD-05', 757, 6841);
put('AGD-06', 757, 6938);
put('ST-13', 398, 7041); put('IAT-10', 757, 7042);
put('T-12', 757, 7127);
put('AGW-01', 757, 7207);
put('SA(S)-1', 480, 7260);

em('INT(S)-4', 'LASDT(S)-1', { mid: { x: 480, y: 5960 } });
em('AAM-09', 'LASDT(S)-1', { fromSide: 'W', toSide: 'N' });
em('OPS-05', 'LASDT(S)-1', { fromSide: 'E', toSide: 'N' });
em('ST-10 LASDT', 'LASDT(S)-1', { fromSide: 'W', toSide: 'N' });
em('JMP-03', 'LASDT-1', { fromSide: 'W', toSide: 'N' });
em('LASDT(S)-1', 'LASDT-1', { fromSide: 'W', toSide: 'N' });
em('ST-13', 'SA(S)-1', { fromSide: 'E', toSide: 'N' });
em('AGW-01', 'SA(S)-1', { fromSide: 'W', toSide: 'E' });

/* ---------------- B-28 : SA ladder and its sims, AGS-04..AGW-03 ---------------- */
put('SA(S)-2', 480, 7551);
put('ST-17', 345, 7626);
put('AGS-04', 700, 7704);
put('JMP-04', 345, 7791); put('AGS-05', 700, 7802);
put('OPS-07', 345, 7872); put('AGS-06', 700, 7900);
put('SA-1', 260, 7970); put('AGS-07', 645, 7991); put('IAT-11', 750, 7991);
put('T-13', 700, 8085);
put('SA(S)-3', 480, 8164); put('AGW-02', 700, 8164);
put('SA-2', 260, 8277); put('AGW-03', 700, 8284);
put('SA(S)-4', 480, 8447);
put('T-14', 578, 8560);
put('SA-3', 260, 8583);
put('JMP-05', 578, 8642);
put('SA(S)-5', 480, 8719); put('IAT-12', 578, 8719);
put('SA-4', 260, 8866);

em('SA(S)-2', 'SA-1', { fromSide: 'W', toSide: 'N' });
em('ST-17', 'SA-1', { fromSide: 'W', toSide: 'N' });
em('AGS-04', 'SA-1', { fromSide: 'W', toSide: 'N' });
em('JMP-04', 'SA-1', { fromSide: 'W', toSide: 'N' });
em('OPS-07', 'SA-1', { fromSide: 'W', toSide: 'N' });
em('SA(S)-3', 'SA-2', { fromSide: 'W', toSide: 'N' });
em('AGW-02', 'SA(S)-3', { fromSide: 'W', toSide: 'E' });   /* oval sits in-line on this run */
em('SA(S)-4', 'SA-3', { fromSide: 'W', toSide: 'N' });
em('SA(S)-5', 'SA-4', { fromSide: 'W', toSide: 'N' });
em('IAT-12', 'SA(S)-5', { fromSide: 'W', toSide: 'E' });
em('AGW-03', 'T-14', { mid: { x: 578, y: 8514 } });

/* ---------------- B-29 : SA-5/6, BFM start, SA(S)-6/7 ---------------- */
put('OPS-06', 563, 9187);
put('SA(S)-6', 480, 9336);
put('SA-5', 260, 9523); put('SA(S)-7', 480, 9523);
put('SA-6', 260, 9744);
put('AAM-06', 335, 9893);
put('BFM-1', 260, 10000);
put('BFM-2', 260, 10237);
put('AAM-07', 335, 10376);
put('BFM-3', 260, 10483);

em('OPS-06', 'SA(S)-6', { fromSide: 'W', toSide: 'N' });
em('SA(S)-7', 'SA-5', { fromSide: 'W', toSide: 'E' });
em('AAM-06', 'BFM-1', { fromSide: 'W', toSide: 'N' });
em('AAM-07', 'BFM-3', { fromSide: 'W', toSide: 'N' });
/* the SS wire: SA(S)-7 out of its E side, then one long drop into SAN-1 (B-32) */
em('SA(S)-7', 'SAN-1', { fromSide: 'E', mid: { x: 645, y: 9523 } });
em('SA(S)-7', 'ACM(S)-1', { fromSide: 'S', toSide: 'N' }); /* the T wire, straight down the sim lane */

/* ---------------- B-30 : BFM-4..7, ACM start, ST-10 ACM column ---------------- */
put('BFM-4', 260, 10836);
put('JMP-02', 185, 10996); put('AAM-08', 320, 10996);
put('BFM-5', 260, 11121);
put('BFM-6', 260, 11409);
put('ST-10 ACM', 715, 11625);
put('BFM-7', 260, 11681);
put('AAM-10', 320, 11852);
put('ACM(S)-1', 480, 11937); put('AAM-11', 685, 11937);
put('ACM-1', 260, 12001);
put('T-09', 715, 12060);

em('JMP-02', 'BFM-5', { fromSide: 'E', toSide: 'N' });
em('AAM-08', 'BFM-5', { fromSide: 'W', toSide: 'N' });
em('ST-10 ACM', 'AAM-10', { fromSide: 'S', toSide: 'E' });
em('ST-10 ACM', 'ACM(S)-1', { fromSide: 'W', toSide: 'N' });
em('AAM-11', 'ACM(S)-1', { fromSide: 'W', toSide: 'E' });
em('AAM-10', 'ACM-1', { fromSide: 'W', toSide: 'N' });

/* ---------------- B-31 : ACM-2/3, TI sims, TI-1/2, LASDT-3 ---------------- */
put('ACM-2', 260, 12405);
put('ACM(S)-2', 480, 12549);
put('ST-12', 370, 12618); put('AAM-12', 700, 12618);
put('ACM-3', 260, 12669); put('TI(S)-1', 480, 12682);
put('AAM-13', 700, 12754);
put('TI(S)-2', 480, 12826);
put('TI-1', 260, 12922);
put('LASDT-3', 260, 13154);
put('TI(S)-3', 480, 13290);
put('TI-2', 260, 13394);

em('ACM(S)-2', 'ACM-3', { fromSide: 'W', toSide: 'N' });
em('ST-12', 'TI(S)-1', { fromSide: 'E', toSide: 'N' });
em('AAM-12', 'TI(S)-1', { fromSide: 'W', toSide: 'N' });
em('AAM-13', 'TI(S)-2', { fromSide: 'W', toSide: 'N' });
em('TI(S)-2', 'TI-1', { fromSide: 'W', toSide: 'N' });
em('TI(S)-3', 'TI-2', { fromSide: 'W', toSide: 'N' });

/* ---------------- B-32 : TI-3..ST-18, night column, SAT/SATN finish ---------------- */
put('AAM-14', 190, 13614);
put('NVG-01', 770, 13672);
put('TI-3', 260, 13733);
put('NVG-LAB', 770, 13864); put('DCA(S)-1', 551, 13877);
put('AGS-08', 706, 13952);
put('DCA-1', 260, 13989);
put('ST-15', 525, 14034); put('ST-14', 706, 14053);
put('NTR-1', 462, 14141); put('NTR(S)-1', 770, 14141);
put('DAAR/NAAR', 150, 14322);
put('NTR-2', 462, 14341); put('SAN-1', 645, 14341);
put('SAT(S)-1', 400, 14458);
put('SATN-1', 528, 14546);
put('SAT-1', 260, 14616); put('SAT(S)-2', 400, 14616);
put('SAT-2', 260, 14818);
put('ST-18', 260, 15003);

em('AAM-14', 'TI-3', { fromSide: 'E', toSide: 'N' });
em('DCA(S)-1', 'DCA-1', { fromSide: 'W', toSide: 'N' });
em('AGS-08', 'NTR(S)-1', { fromSide: 'E', toSide: 'N' });
em('ST-14', 'NTR(S)-1', { fromSide: 'E', toSide: 'N' });
em('NTR(S)-1', 'NTR-1', { fromSide: 'W', toSide: 'E' });
em('SAT(S)-2', 'SAT-1', { fromSide: 'W', toSide: 'E' });

/* ---------------- the NN wire as a drawn line ----------------
 * Taps the SA-4 -> SA-5 wire between the two jets, runs down four pages and
 * arrows into NTR-1 from above, exactly like the drawing. Anchoring the top
 * end on that edge means the line IS the SA-4 -> NTR-1 prerequisite on
 * screen, so no second arrow is drawn for it. */
const sa4 = N['SA-4'], sa5 = N['SA-5'], ntr1 = N['NTR-1'];
const tapY = 9100;
const u = (tapY - (sa4.y + 30)) / ((sa5.y - 30) - (sa4.y + 30));
const NN = {
  id: 'Lnnwire',
  a: { t: 'edge', p: 'SA-4', c: 'SA-5', i: 0, u: +u.toFixed(4) },
  b: { t: 'ball', id: 'NTR-1', side: 'N' },
  pts: [
    { x: sa4.x, y: tapY },
    { x: 420, y: tapY },
    { x: 420, y: ntr1.y - 61 },
    { x: ntr1.x, y: ntr1.y - 61 },
    { x: ntr1.x, y: ntr1.y - 30 },
  ],
};
/* edges whose horizontals cross the NN line: keep the hop arc so a crossing
 * never reads as a junction (edge-over-line pairs default to flush). */
const LK = '\u0000L';
const mkey = (a, b) => [a, b].sort().join('|');
const UNMERGES = [
  K('SA(S)-7', 'SA-5'),
  K('ST-10 ACM', 'AAM-10'),
  K('ACM(S)-2', 'ACM-3'),
  K('ST-12', 'TI(S)-1'),
  K('TI(S)-2', 'TI-1'),
  K('TI(S)-3', 'TI-2'),
  K('DCA(S)-1', 'DCA-1'),
].map(k => mkey(LK + NN.id, k));
/* The two-target buses route every edge along one shared rail, but a straight
 * riser that happens to sit under a parent spans the rail, so sibling edges
 * hop it and the rail reads as cut (agent-audit find, 9 Aug). These crossings
 * ARE the rail: merge them so the bus stays one unbroken line. */
const MERGES = [
  [K('AVI-06', 'AVI-10'), K('AVI-07', 'IAT-02')],
  [K('AVI-09', 'IAT-02'), K('AVI-08', 'AVI-10')],
  [K('ST-03', 'AVI-04'), K('AVI-01', 'AVI-03')],
].map(([a, b]) => mkey(a, b));
/* These two ids are wider than any other ball label; every other chart keeps
 * the default size, so shrink just these (same idea as AVI-12 in 2026). */
const FONT = { 'ST-10 ACM': 7, 'ST-10 LASDT': 6 };

/* ================= validation ================= */
const ids = new Set(syl.map(e => e.id));
const laidOut = Object.keys(N);
const missing = [...ids].filter(id => !N[id]);
const extra = laidOut.filter(id => !ids.has(id));
if (missing.length) throw new Error('events with no position: ' + missing.join(', '));
if (extra.length) throw new Error('positions for unknown events: ' + extra.join(', '));

const edgeSet = new Set();
syl.forEach(e => (e.prereqs || []).forEach(p => edgeSet.add(K(p, e.id))));
const badMeta = Object.keys(EM).filter(k => !edgeSet.has(k));
if (badMeta.length) throw new Error('edgeMeta for non-edges: ' + badMeta.join(', '));
const badMerge = MERGES.flatMap(k => k.split('|')).filter(k => !edgeSet.has(k));
if (badMerge.length) throw new Error('merge names a non-edge: ' + badMerge.join(', '));
const badFont = Object.keys(FONT).filter(id => !ids.has(id));
if (badFont.length) throw new Error('font override for unknown event: ' + badFont.join(', '));
if (!edgeSet.has(K('SA-4', 'NTR-1'))) throw new Error('NN line covers a link that does not exist');

let clashes = [];
for (let i = 0; i < laidOut.length; i++)
  for (let j = i + 1; j < laidOut.length; j++) {
    const a = N[laidOut[i]], b = N[laidOut[j]];
    if (Math.abs(a.x - b.x) < 62 && Math.abs(a.y - b.y) < 62)
      clashes.push(laidOut[i] + ' / ' + laidOut[j]);
  }
if (clashes.length) throw new Error('balls overlap: ' + clashes.join(', '));

/* ================= bake into src/data/layouts.js ================= */
const layFile = path.join(root, 'src/data/layouts.js');
const src = fs.readFileSync(layFile, 'utf8');
const m = src.match(/export const DEFAULT_LAYOUTS = (\{.*\});?\s*$/s);
if (!m) throw new Error('could not parse layouts.js');
const all = JSON.parse(m[1].replace(/;\s*$/, ''));

const out = {};
for (const id of laidOut) out[id] = N[id];
out.__edgeMeta = EM;
out.__merges = MERGES;
out.__font = FONT;
out.__unmerges = UNMERGES;
out.__lines = [NN];
out.__derived = [];
all[SYL_NAME] = out;

fs.writeFileSync(layFile, src.slice(0, m.index) +
  'export const DEFAULT_LAYOUTS = ' + JSON.stringify(all) + ';\n');
console.log('baked', laidOut.length, 'positions,', Object.keys(EM).length,
  'routed edges, 1 drawn line,', UNMERGES.length, 'kept hops ->', path.relative(root, layFile));
