/*
 * Test suite for the CPU scheduling simulator.  Run:  node tests/run-tests.js
 *
 *  Part 1  Hand-calculated expectations (Workloads A and B, all four algorithms)
 *  Part 2  Student-designed test cases (idle time, simultaneous arrival + tie, SRTF preemption, equal-remaining)
 *  Part 3  Worked examples from the CSE513 Lecture 02 slides
 *  Part 4  Input validation
 *  Part 5  Randomised cross-check against an independent tick-by-tick reference simulator
 *          + the five required properties on every random workload
 */
'use strict';
const path = require('path');
const S = require(path.join(__dirname, '..', 'scheduler.js'));

let passed = 0;
let failed = 0;
const fail = (msg) => {
  failed++;
  console.log('  FAIL ' + msg);
};
const ok = () => passed++;

// "P1 0-8 | P2 8-12 | idle 12-14" style timeline string from result segments.
function timeline(res) {
  return res.segments.map((s) => `${s.pid === null ? 'idle' : s.pid} ${s.start}-${s.end}`).join(' | ');
}

function expectCase(name, algo, procs, q, exp) {
  const res = S.simulate(algo, procs, q);
  if (!res.ok) return fail(`${name}: simulator rejected input: ${res.errors.join(' ')}`);
  let good = true;
  if (exp.timeline && timeline(res) !== exp.timeline) {
    fail(`${name}: timeline\n      expected ${exp.timeline}\n      got      ${timeline(res)}`);
    good = false;
  }
  for (const key of ['completion', 'turnaround', 'waiting', 'response', 'firstStart']) {
    if (!exp[key]) continue;
    const got = res.rows.map((r) => r[key]);
    if (got.join() !== exp[key].join()) {
      fail(`${name}: ${key} expected [${exp[key]}] got [${got}]`);
      good = false;
    }
  }
  if (exp.avg) {
    for (const [k, v] of Object.entries(exp.avg)) {
      if (Math.abs(res.averages[k] - v) > 0.005) {
        fail(`${name}: average ${k} expected ${v} got ${res.averages[k]}`);
        good = false;
      }
    }
  }
  const badChecks = res.checks.filter((c) => !c.pass);
  if (badChecks.length) {
    fail(`${name}: property check failed: ${badChecks.map((c) => c.name + ' — ' + c.detail).join('; ')}`);
    good = false;
  }
  if (good) {
    ok();
    console.log(`  ok   ${name}`);
  }
  return res;
}

const P = (rows) => rows.map(([id, arrival, burst]) => ({ id, arrival, burst }));

// -----------------------------------------------------------------------------
console.log('\nPart 1 — Required workloads vs. hand calculations');
// -----------------------------------------------------------------------------
const A = P([['P1', 0, 8], ['P2', 1, 4], ['P3', 2, 2], ['P4', 4, 1]]);
const B = P([['P1', 2, 3], ['P2', 2, 1], ['P3', 8, 2], ['P4', 9, 1]]);

expectCase('A / FCFS', 'FCFS', A, null, {
  timeline: 'P1 0-8 | P2 8-12 | P3 12-14 | P4 14-15',
  completion: [8, 12, 14, 15], turnaround: [8, 11, 12, 11], waiting: [0, 7, 10, 10], response: [0, 7, 10, 10],
  avg: { turnaround: 10.5, waiting: 6.75, response: 6.75 },
});
expectCase('A / SJF', 'SJF', A, null, {
  timeline: 'P1 0-8 | P4 8-9 | P3 9-11 | P2 11-15',
  completion: [8, 15, 11, 9], turnaround: [8, 14, 9, 5], waiting: [0, 10, 7, 4], response: [0, 10, 7, 4],
  avg: { turnaround: 9, waiting: 5.25, response: 5.25 },
});
expectCase('A / SRTF', 'SRTF', A, null, {
  timeline: 'P1 0-1 | P2 1-2 | P3 2-4 | P4 4-5 | P2 5-8 | P1 8-15',
  completion: [15, 8, 4, 5], turnaround: [15, 7, 2, 1], waiting: [7, 3, 0, 0], response: [0, 0, 0, 0],
  avg: { turnaround: 6.25, waiting: 2.5, response: 0 },
});
expectCase('A / RR q=2', 'RR', A, 2, {
  timeline: 'P1 0-2 | P2 2-4 | P3 4-6 | P1 6-8 | P4 8-9 | P2 9-11 | P1 11-13 | P1 13-15',
  completion: [15, 11, 6, 9], turnaround: [15, 10, 4, 5], waiting: [7, 6, 2, 4], response: [0, 1, 2, 4],
  avg: { turnaround: 8.5, waiting: 4.75, response: 1.75 },
});

expectCase('B / FCFS', 'FCFS', B, null, {
  timeline: 'idle 0-2 | P1 2-5 | P2 5-6 | idle 6-8 | P3 8-10 | P4 10-11',
  completion: [5, 6, 10, 11], waiting: [0, 3, 0, 1], response: [0, 3, 0, 1],
  avg: { turnaround: 2.75, waiting: 1, response: 1 },
});
expectCase('B / SJF', 'SJF', B, null, {
  timeline: 'idle 0-2 | P2 2-3 | P1 3-6 | idle 6-8 | P3 8-10 | P4 10-11',
  completion: [6, 3, 10, 11], waiting: [1, 0, 0, 1], response: [1, 0, 0, 1],
  avg: { turnaround: 2.25, waiting: 0.5, response: 0.5 },
});
expectCase('B / SRTF (equal remaining at t=9: no preemption)', 'SRTF', B, null, {
  timeline: 'idle 0-2 | P2 2-3 | P1 3-6 | idle 6-8 | P3 8-10 | P4 10-11',
  completion: [6, 3, 10, 11], waiting: [1, 0, 0, 1], response: [1, 0, 0, 1],
  avg: { turnaround: 2.25, waiting: 0.5, response: 0.5 },
});
expectCase('B / RR q=2', 'RR', B, 2, {
  timeline: 'idle 0-2 | P1 2-4 | P2 4-5 | P1 5-6 | idle 6-8 | P3 8-10 | P4 10-11',
  completion: [6, 5, 10, 11], waiting: [1, 2, 0, 1], response: [0, 2, 0, 1],
  avg: { turnaround: 2.75, waiting: 1, response: 0.75 },
});

// RR with consecutive slices of the same process must stay identifiable.
{
  const r = S.simulate('RR', A, 2);
  const last2 = r.segments.slice(-2);
  if (last2[0].pid === 'P1' && last2[1].pid === 'P1' && last2[0].slice !== last2[1].slice) {
    ok();
    console.log('  ok   A / RR q=2: consecutive P1 slices [11,13) and [13,15) are separate, numbered segments');
  } else fail('consecutive RR slices were merged');
}

// -----------------------------------------------------------------------------
console.log('\nPart 2 — Student-designed test cases');
// -----------------------------------------------------------------------------
// T1: CPU idle time in the middle of the schedule.
const T1 = P([['P1', 0, 2], ['P2', 5, 3], ['P3', 6, 1]]);
expectCase('T1 idle / FCFS', 'FCFS', T1, null, { timeline: 'P1 0-2 | idle 2-5 | P2 5-8 | P3 8-9', waiting: [0, 0, 2] });
expectCase('T1 idle / SJF', 'SJF', T1, null, { timeline: 'P1 0-2 | idle 2-5 | P2 5-8 | P3 8-9', waiting: [0, 0, 2] });
expectCase('T1 idle / SRTF', 'SRTF', T1, null, { timeline: 'P1 0-2 | idle 2-5 | P2 5-6 | P3 6-7 | P2 7-9', waiting: [0, 1, 0] });
expectCase('T1 idle / RR q=2', 'RR', T1, 2, { timeline: 'P1 0-2 | idle 2-5 | P2 5-7 | P3 7-8 | P2 8-9', waiting: [0, 1, 1] });

// T2: simultaneous arrivals and a scheduling tie. Input order is P2, P1, P3 on purpose:
// the tie between P2 and P1 (same arrival, same burst) must be broken by INPUT POSITION, not by ID.
const T2 = P([['P2', 0, 3], ['P1', 0, 3], ['P3', 0, 1]]);
expectCase('T2 tie / FCFS', 'FCFS', T2, null, { timeline: 'P2 0-3 | P1 3-6 | P3 6-7', waiting: [0, 3, 6] });
expectCase('T2 tie / SJF', 'SJF', T2, null, { timeline: 'P3 0-1 | P2 1-4 | P1 4-7', waiting: [1, 4, 0] });
expectCase('T2 tie / SRTF', 'SRTF', T2, null, { timeline: 'P3 0-1 | P2 1-4 | P1 4-7', waiting: [1, 4, 0] });
expectCase('T2 tie / RR q=2', 'RR', T2, 2, { timeline: 'P2 0-2 | P1 2-4 | P3 4-5 | P2 5-6 | P1 6-7', waiting: [3, 4, 4] });

// T3: SRTF preempts a running process (twice).
const T3 = P([['P1', 0, 7], ['P2', 2, 3], ['P3', 3, 1]]);
expectCase('T3 preemption / SRTF', 'SRTF', T3, null, {
  timeline: 'P1 0-2 | P2 2-3 | P3 3-4 | P2 4-6 | P1 6-11',
  completion: [11, 6, 4], waiting: [4, 1, 0], response: [0, 0, 0],
});
expectCase('T3 same workload / SJF (no preemption)', 'SJF', T3, null, { timeline: 'P1 0-7 | P3 7-8 | P2 8-11' });

// T4 (extra): equal remaining time -> current process keeps the CPU.
const T4 = P([['P1', 0, 4], ['P2', 2, 2]]);
expectCase('T4 equal remaining / SRTF keeps P1', 'SRTF', T4, null, { timeline: 'P1 0-4 | P2 4-6' });

// -----------------------------------------------------------------------------
console.log('\nPart 3 — Worked examples from Lecture 02 slides');
// -----------------------------------------------------------------------------
const L1 = P([['P1', 0, 24], ['P2', 0, 3], ['P3', 0, 3]]);
expectCase('Slides: FCFS 24/3/3 (mean W = 17)', 'FCFS', L1, null, { waiting: [0, 24, 27], avg: { waiting: 17, turnaround: 27 } });
expectCase('Slides: SJF 24/3/3 (mean W = 3)', 'SJF', L1, null, { waiting: [6, 0, 3], avg: { waiting: 3 } });
expectCase('Slides: RR q=4 24/3/3 (W = 6,4,7; R = 0,4,7)', 'RR', L1, 4, {
  waiting: [6, 4, 7], response: [0, 4, 7], avg: { waiting: 17 / 3, response: 11 / 3 },
});
expectCase('Slides: SJF 6/8/7/3 (mean W = 7)', 'SJF', P([['P1', 0, 6], ['P2', 0, 8], ['P3', 0, 7], ['P4', 0, 3]]), null, {
  waiting: [3, 16, 9, 0], avg: { waiting: 7 },
});
expectCase('Slides: SRTF 0/1/2/3, 8/4/9/5 (mean W = 6.5, R = 4.25)', 'SRTF',
  P([['P1', 0, 8], ['P2', 1, 4], ['P3', 2, 9], ['P4', 3, 5]]), null, {
    completion: [17, 5, 26, 10], waiting: [9, 0, 15, 2], response: [0, 0, 15, 2], avg: { waiting: 6.5, response: 4.25 },
  });

// -----------------------------------------------------------------------------
console.log('\nPart 4 — Input validation');
// -----------------------------------------------------------------------------
const invalid = [
  ['duplicate ID', 'FCFS', [{ id: 'P1', arrival: 0, burst: 1 }, { id: 'P1', arrival: 1, burst: 1 }], null],
  ['empty ID', 'FCFS', [{ id: ' ', arrival: 0, burst: 1 }], null],
  ['negative arrival', 'FCFS', [{ id: 'P1', arrival: -1, burst: 1 }], null],
  ['zero burst', 'SJF', [{ id: 'P1', arrival: 0, burst: 0 }], null],
  ['fractional burst', 'SJF', [{ id: 'P1', arrival: 0, burst: '2.5' }], null],
  ['non-numeric arrival', 'SRTF', [{ id: 'P1', arrival: 'abc', burst: 2 }], null],
  ['quantum 0', 'RR', [{ id: 'P1', arrival: 0, burst: 2 }], 0],
  ['quantum missing', 'RR', [{ id: 'P1', arrival: 0, burst: 2 }], ''],
  ['no processes', 'FCFS', [], null],
];
for (const [name, algo, procs, q] of invalid) {
  const r = S.simulate(algo, procs, q);
  if (!r.ok && r.errors.length) {
    ok();
    console.log(`  ok   rejects ${name}: "${r.errors[0]}"`);
  } else fail(`accepted invalid input: ${name}`);
}

// -----------------------------------------------------------------------------
console.log('\nPart 5 — Randomised cross-check vs. tick-by-tick reference simulator');
// -----------------------------------------------------------------------------
// An independent, deliberately naive implementation: it advances time ONE unit at a
// time and re-applies the scheduling rule each tick. It shares no code with scheduler.js.
function reference(algo, procs, q) {
  const n = procs.length;
  const rem = procs.map((p) => p.burst);
  const arrived = (i, t) => procs[i].arrival <= t;
  const tieKey = (i) => [procs[i].arrival, i];
  const less = (ka, kb) => { for (let k = 0; k < ka.length; k++) if (ka[k] !== kb[k]) return ka[k] < kb[k]; return false; };
  const ticks = [];
  let running = -1, used = 0, left = n, t = 0;
  const queue = [];
  const order = procs.map((_, i) => i).sort((a, b) => procs[a].arrival - procs[b].arrival || a - b);
  while (left > 0) {
    if (algo === 'RR') {
      order.filter((i) => procs[i].arrival === t).forEach((i) => queue.push(i));
      if (running !== -1 && rem[running] === 0) running = -1;
      if (running !== -1 && used === q) { queue.push(running); running = -1; }
      if (running === -1 && queue.length) { running = queue.shift(); used = 0; }
    } else {
      if (running !== -1 && rem[running] === 0) running = -1;
      const cands = [];
      for (let i = 0; i < n; i++) if (arrived(i, t) && rem[i] > 0) cands.push(i);
      const key = (i) => (algo === 'FCFS' ? tieKey(i) : algo === 'SJF' ? [procs[i].burst, ...tieKey(i)] : [rem[i], ...tieKey(i)]);
      let best = -1;
      for (const i of cands) if (best === -1 || less(key(i), key(best))) best = i;
      if (running === -1) running = best;
      else if (algo === 'SRTF' && best !== -1 && rem[best] < rem[running]) running = best;
    }
    if (running === -1) ticks.push(null);
    else {
      ticks.push(procs[running].id);
      rem[running]--; used++;
      if (rem[running] === 0) left--;
    }
    t++;
  }
  return ticks;
}

function ticksOf(res) {
  const out = [];
  res.segments.forEach((s) => { for (let t = s.start; t < s.end; t++) out.push(s.pid); });
  return out;
}

let seed = 513;
const rand = (k) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % k; };
let randomCases = 0;
let randomFailures = 0;
for (let trial = 0; trial < 2000; trial++) {
  const n = 1 + rand(7);
  const procs = [];
  for (let i = 0; i < n; i++) procs.push({ id: 'P' + (i + 1), arrival: rand(12), burst: 1 + rand(8) });
  const q = 1 + rand(5);
  for (const algo of ['FCFS', 'SJF', 'SRTF', 'RR']) {
    randomCases++;
    const res = S.simulate(algo, procs, q);
    const ref = reference(algo, procs, q).join(',');
    const got = ticksOf(res).join(',');
    const badCheck = res.checks.find((c) => !c.pass);
    if (ref !== got || badCheck) {
      randomFailures++;
      if (randomFailures <= 5) {
        fail(`${algo} q=${q} ${JSON.stringify(procs)}\n      ref ${ref}\n      got ${got}` + (badCheck ? `\n      check: ${badCheck.name} ${badCheck.detail}` : ''));
      }
    }
  }
}
if (randomFailures === 0) {
  ok();
  console.log(`  ok   ${randomCases} random algorithm-workload runs match the reference and pass all 5 property checks`);
}

// -----------------------------------------------------------------------------
console.log('\nPart 6 — The property checker itself catches broken schedules');
// -----------------------------------------------------------------------------
// A check that can never fail proves nothing, so feed deliberately corrupted results.
{
  const procs = S.validate(A, 2, true).processes;
  const good = S.roundRobin(procs, 2);
  const corrupt = (name, mutate, expectedCheck) => {
    const r = JSON.parse(JSON.stringify(good));
    mutate(r);
    const c = S.verify(procs, r).find((x) => x.name.startsWith(expectedCheck));
    if (c && !c.pass) { ok(); console.log(`  ok   detects ${name}: ${c.detail}`); }
    else fail(`checker missed: ${name}`);
  };
  corrupt('a process given one unit too few', (r) => { r.segments[0].end = 1; r.segments[1].start = 1; }, 'Every process');
  corrupt('a process started before arrival', (r) => { r.segments[1].pid = 'P4'; }, 'No process runs before');
  corrupt('two segments overlapping', (r) => { r.segments[1].start = 1; }, 'Processes do not overlap');
  corrupt('negative waiting time', (r) => { r.rows[0].waiting = -1; }, 'Waiting and response');
  corrupt('idle CPU while P1 is ready', (r) => {
    r.segments.splice(1, 0, { pid: null, start: 2, end: 3 });
    for (let i = 2; i < r.segments.length; i++) { r.segments[i].start++; r.segments[i].end++; }
  }, 'CPU is never idle');
}

// -----------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
