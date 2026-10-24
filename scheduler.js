/*
 * CSE513 Assignment 1 — CPU Scheduling Simulator
 * Scheduling engine (no dependencies). Works in the browser (window.Scheduler)
 * and in Node.js (require('./scheduler.js')) so the same code is tested and shown.
 *
 * Model: one CPU, one CPU burst per process, no I/O, zero context-switch cost,
 * integer times. An interval [start, end) gives (end - start) units of CPU time.
 *
 * Result shape returned by every algorithm:
 *   segments: [{ pid | null (idle), start, end, slice? }]   -> Gantt chart
 *   log:      [string]                                        -> decision trace
 *   rows:     [{ id, arrival, burst, firstStart, completion,
 *                turnaround, waiting, response }]             -> results table
 *   averages: { turnaround, waiting, response }
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Input validation
  // ---------------------------------------------------------------------------

  // Accept numbers or numeric strings; require a plain integer (no "2.5", "1e3", "").
  function parseInteger(value) {
    if (typeof value === 'number') return Number.isInteger(value) ? value : NaN;
    const s = String(value == null ? '' : value).trim();
    return /^-?\d+$/.test(s) ? Number(s) : NaN;
  }

  /**
   * Validates raw rows [{id, arrival, burst}] and the quantum.
   * Returns { ok, errors: [string], processes: [{id, arrival, burst, index}], quantum }.
   * `index` is the position in the input list and is used as the final tie-breaker.
   */
  function validate(rawProcesses, rawQuantum, needQuantum) {
    const errors = [];
    const processes = [];
    const seen = new Map();

    if (!Array.isArray(rawProcesses) || rawProcesses.length === 0) {
      errors.push('Add at least one process.');
    } else {
      rawProcesses.forEach((p, i) => {
        const row = `Row ${i + 1}`;
        const id = String(p.id == null ? '' : p.id).trim();
        const arrival = parseInteger(p.arrival);
        const burst = parseInteger(p.burst);

        if (id === '') errors.push(`${row}: process ID is empty.`);
        else if (seen.has(id)) errors.push(`${row}: process ID "${id}" is already used in row ${seen.get(id)}. IDs must be unique.`);
        else seen.set(id, i + 1);

        if (Number.isNaN(arrival)) errors.push(`${row}: arrival time "${p.arrival}" is not an integer.`);
        else if (arrival < 0) errors.push(`${row}: arrival time must be nonnegative (got ${arrival}).`);

        if (Number.isNaN(burst)) errors.push(`${row}: CPU burst "${p.burst}" is not an integer.`);
        else if (burst <= 0) errors.push(`${row}: CPU burst must be a positive integer (got ${burst}).`);

        processes.push({ id, arrival, burst, index: i });
      });
    }

    let quantum = null;
    if (needQuantum) {
      quantum = parseInteger(rawQuantum);
      if (Number.isNaN(quantum)) errors.push(`Time quantum "${rawQuantum}" is not an integer.`);
      else if (quantum <= 0) errors.push(`Time quantum must be a positive integer (got ${quantum}).`);
    }

    return { ok: errors.length === 0, errors, processes, quantum };
  }

  // ---------------------------------------------------------------------------
  // 2. Shared helpers
  // ---------------------------------------------------------------------------

  // Tie-breaking rule from the assignment: earlier arrival, then earlier input position.
  function tieBreak(a, b) {
    return a.arrival - b.arrival || a.index - b.index;
  }

  // Lowest element of `list` according to `compare` (stable: first one wins on equality).
  function pickMin(list, compare) {
    let best = list[0];
    for (let i = 1; i < list.length; i++) if (compare(list[i], best) < 0) best = list[i];
    return best;
  }

  // Adds a Gantt segment, merging with the previous one when the same process
  // simply continues (used by SRTF so an arrival without preemption does not split a bar).
  function pushSegment(segments, pid, start, end, mergeable) {
    if (end <= start) return;
    const last = segments[segments.length - 1];
    if (mergeable && last && last.pid === pid && last.end === start && !last.slice) {
      last.end = end;
    } else {
      segments.push({ pid, start, end });
    }
  }

  // Builds the results table and averages from per-process first start / completion.
  function buildResult(processes, segments, log, firstStart, completion) {
    const rows = processes.map((p) => {
      const turnaround = completion[p.id] - p.arrival;
      return {
        id: p.id,
        arrival: p.arrival,
        burst: p.burst,
        firstStart: firstStart[p.id],
        completion: completion[p.id],
        turnaround,
        waiting: turnaround - p.burst,
        response: firstStart[p.id] - p.arrival,
      };
    });
    const avg = (key) => rows.reduce((s, r) => s + r[key], 0) / rows.length;
    return {
      segments,
      log,
      rows,
      averages: { turnaround: avg('turnaround'), waiting: avg('waiting'), response: avg('response') },
    };
  }

  const fmtRem = (list, rem) => list.map((p) => `${p.id}=${rem[p.id]}`).join(', ');

  // ---------------------------------------------------------------------------
  // 3. Non-preemptive algorithms: FCFS and SJF
  //    The only decision point is "the CPU just became free". The chosen process
  //    then runs its whole burst.
  // ---------------------------------------------------------------------------

  function runNonPreemptive(processes, chooser, name) {
    const segments = [];
    const log = [];
    const firstStart = {};
    const completion = {};
    const pending = processes.slice(); // not yet started
    let t = 0;

    while (pending.length > 0) {
      const ready = pending.filter((p) => p.arrival <= t);

      if (ready.length === 0) {
        // Ready queue empty -> CPU idles until the next arrival.
        const next = Math.min(...pending.map((p) => p.arrival));
        segments.push({ pid: null, start: t, end: next });
        log.push(`t=${t}: ready queue empty -> CPU idle until next arrival at t=${next}.`);
        t = next;
        continue;
      }

      const chosen = chooser(ready);
      const why =
        ready.length === 1
          ? 'only ready process'
          : name === 'FCFS'
          ? `earliest arrival among {${ready.map((p) => `${p.id}@${p.arrival}`).join(', ')}}`
          : `shortest burst among {${ready.map((p) => `${p.id}:${p.burst}`).join(', ')}}`;
      log.push(`t=${t}: CPU free -> run ${chosen.id} (${why}) until t=${t + chosen.burst}.`);

      firstStart[chosen.id] = t;
      segments.push({ pid: chosen.id, start: t, end: t + chosen.burst });
      t += chosen.burst;
      completion[chosen.id] = t;
      pending.splice(pending.indexOf(chosen), 1);
    }
    log.push(`t=${t}: all processes finished.`);
    return buildResult(processes, segments, log, firstStart, completion);
  }

  function fcfs(processes) {
    return runNonPreemptive(processes, (ready) => pickMin(ready, tieBreak), 'FCFS');
  }

  function sjf(processes) {
    return runNonPreemptive(
      processes,
      (ready) => pickMin(ready, (a, b) => a.burst - b.burst || tieBreak(a, b)),
      'SJF'
    );
  }

  // ---------------------------------------------------------------------------
  // 4. SRTF (preemptive SJF)
  //    Decision points: whenever a process arrives or the running one finishes.
  //    Between two decision points nothing can change, so we jump directly
  //    from one event to the next (event-driven simulation).
  // ---------------------------------------------------------------------------

  function srtf(processes) {
    const segments = [];
    const log = [];
    const firstStart = {};
    const completion = {};
    const remaining = {};
    processes.forEach((p) => (remaining[p.id] = p.burst));

    let unfinished = processes.slice();
    let current = null;
    let t = 0;
    const byRemaining = (a, b) => remaining[a.id] - remaining[b.id] || tieBreak(a, b);

    while (unfinished.length > 0) {
      const ready = unfinished.filter((p) => p.arrival <= t);

      if (ready.length === 0) {
        const next = Math.min(...unfinished.map((p) => p.arrival));
        segments.push({ pid: null, start: t, end: next });
        log.push(`t=${t}: ready queue empty -> CPU idle until t=${next}.`);
        t = next;
        continue;
      }

      const best = pickMin(ready, byRemaining);
      if (current === null) {
        current = best;
        log.push(
          `t=${t}: select ${current.id} (shortest remaining among {${fmtRem(ready, remaining)}}).`
        );
      } else if (best !== current && remaining[best.id] < remaining[current.id]) {
        // Preempt only on a STRICTLY shorter remaining time.
        log.push(
          `t=${t}: ${best.id} has remaining ${remaining[best.id]} < ${current.id}'s ${remaining[current.id]} -> PREEMPT ${current.id}, run ${best.id}.`
        );
        current = best;
      } else {
        // An arrival happened but nobody is strictly shorter: keep running.
        const arrivedNow = ready.filter((p) => p.arrival === t && p !== current);
        if (arrivedNow.length) {
          log.push(
            `t=${t}: ${arrivedNow.map((p) => `${p.id} (remaining ${remaining[p.id]})`).join(', ')} arrive(s); ${current.id} has ${remaining[current.id]} -> no strictly shorter job, keep ${current.id}.`
          );
        }
      }

      if (firstStart[current.id] === undefined) firstStart[current.id] = t;

      // Run until the current process finishes or the next arrival, whichever is first.
      const futureArrivals = unfinished.filter((p) => p.arrival > t).map((p) => p.arrival);
      const nextArrival = futureArrivals.length ? Math.min(...futureArrivals) : Infinity;
      const end = Math.min(t + remaining[current.id], nextArrival);

      pushSegment(segments, current.id, t, end, true);
      remaining[current.id] -= end - t;
      t = end;

      if (remaining[current.id] === 0) {
        completion[current.id] = t;
        log.push(`t=${t}: ${current.id} completes.`);
        unfinished = unfinished.filter((p) => p !== current);
        current = null;
      }
    }
    log.push(`t=${t}: all processes finished.`);
    return buildResult(processes, segments, log, firstStart, completion);
  }

  // ---------------------------------------------------------------------------
  // 5. Round Robin with quantum q
  //    FIFO ready queue. Arrivals join the tail. At the end of a slice, processes
  //    that arrived during the slice OR exactly at its end are enqueued BEFORE the
  //    unfinished running process is re-enqueued. A finished process never rejoins.
  // ---------------------------------------------------------------------------

  function roundRobin(processes, quantum) {
    const segments = [];
    const log = [];
    const firstStart = {};
    const completion = {};
    const remaining = {};
    processes.forEach((p) => (remaining[p.id] = p.burst));

    // Arrival order; equal arrivals keep input order (tie-break rule).
    const arrivals = processes.slice().sort(tieBreak);
    let nextIdx = 0;
    const queue = [];
    let t = 0;
    let done = 0;
    let sliceNo = 0;

    const admitUpTo = (time) => {
      const joined = [];
      while (nextIdx < arrivals.length && arrivals[nextIdx].arrival <= time) {
        queue.push(arrivals[nextIdx]);
        joined.push(arrivals[nextIdx].id);
        nextIdx++;
      }
      return joined;
    };

    const first = admitUpTo(0);
    if (first.length) log.push(`t=0: ${first.join(', ')} arrive(s) -> queue [${queue.map((p) => p.id).join(', ')}].`);

    while (done < processes.length) {
      if (queue.length === 0) {
        const next = arrivals[nextIdx].arrival;
        segments.push({ pid: null, start: t, end: next });
        log.push(`t=${t}: ready queue empty -> CPU idle until t=${next}.`);
        t = next;
        const joined = admitUpTo(t);
        log.push(`t=${t}: ${joined.join(', ')} arrive(s) -> queue [${queue.map((p) => p.id).join(', ')}].`);
        continue;
      }

      const cur = queue.shift();
      const run = Math.min(quantum, remaining[cur.id]);
      if (firstStart[cur.id] === undefined) firstStart[cur.id] = t;
      sliceNo++;
      // Every RR slice is its own segment (slice number shown in the Gantt chart),
      // so consecutive slices of the same process remain identifiable.
      segments.push({ pid: cur.id, start: t, end: t + run, slice: sliceNo });
      log.push(
        `t=${t}: dequeue ${cur.id} (remaining ${remaining[cur.id]}) -> runs ${run} unit(s) [slice #${sliceNo}].`
      );
      t += run;
      remaining[cur.id] -= run;

      // 1) arrivals during the slice and at its exact end join first ...
      const joined = admitUpTo(t);
      if (joined.length) log.push(`t=${t}: ${joined.join(', ')} arrive(s) and join the tail first.`);

      // 2) ... then the unfinished running process is re-enqueued.
      if (remaining[cur.id] > 0) {
        queue.push(cur);
        log.push(
          `t=${t}: quantum expired, ${cur.id} has ${remaining[cur.id]} left -> back to tail. Queue [${queue.map((p) => p.id).join(', ')}].`
        );
      } else {
        completion[cur.id] = t;
        done++;
        log.push(`t=${t}: ${cur.id} completes. Queue [${queue.map((p) => p.id).join(', ') || 'empty'}].`);
      }
    }
    log.push(`t=${t}: all processes finished.`);
    return buildResult(processes, segments, log, firstStart, completion);
  }

  // ---------------------------------------------------------------------------
  // 6. Public entry point
  // ---------------------------------------------------------------------------

  const ALGORITHMS = {
    FCFS: { label: 'First-Come, First-Served (FCFS)', run: fcfs },
    SJF: { label: 'Shortest Job First (SJF, non-preemptive)', run: sjf },
    SRTF: { label: 'Shortest Remaining Time First (SRTF, preemptive)', run: srtf },
    RR: { label: 'Round Robin (RR)', run: roundRobin, needsQuantum: true },
  };

  /** simulate('RR', [{id:'P1', arrival:0, burst:8}, ...], 2) */
  function simulate(algorithm, rawProcesses, rawQuantum) {
    const algo = ALGORITHMS[algorithm];
    if (!algo) return { ok: false, errors: [`Unknown algorithm "${algorithm}".`] };
    const v = validate(rawProcesses, rawQuantum, !!algo.needsQuantum);
    if (!v.ok) return { ok: false, errors: v.errors };
    const result = algo.run(v.processes, v.quantum);
    result.ok = true;
    result.algorithm = algorithm;
    result.quantum = v.quantum;
    result.checks = verify(v.processes, result);
    return result;
  }

  // ---------------------------------------------------------------------------
  // 7. Property checks — run on EVERY simulation, independent of the algorithm.
  // ---------------------------------------------------------------------------

  function verify(processes, result) {
    const segs = result.segments;
    const checks = [];
    const add = (name, pass, detail) => checks.push({ name, pass, detail: pass ? '' : detail });

    // (a) Every process receives exactly its specified CPU burst.
    const cpu = {};
    segs.forEach((s) => s.pid !== null && (cpu[s.pid] = (cpu[s.pid] || 0) + (s.end - s.start)));
    const badBurst = processes.filter((p) => cpu[p.id] !== p.burst);
    add(
      'Every process receives exactly its CPU burst',
      badBurst.length === 0,
      badBurst.map((p) => `${p.id}: got ${cpu[p.id] || 0}, expected ${p.burst}`).join('; ')
    );

    // (b) No process runs before its arrival.
    const arrival = {};
    processes.forEach((p) => (arrival[p.id] = p.arrival));
    const early = segs.filter((s) => s.pid !== null && s.start < arrival[s.pid]);
    add(
      'No process runs before its arrival',
      early.length === 0,
      early.map((s) => `${s.pid} runs at ${s.start} but arrives at ${arrival[s.pid]}`).join('; ')
    );

    // (c) No overlap on the single CPU, and the timeline is continuous from 0.
    let overlap = '';
    for (let i = 0; i < segs.length; i++) {
      const prevEnd = i === 0 ? 0 : segs[i - 1].end;
      if (segs[i].start !== prevEnd || segs[i].end <= segs[i].start) {
        overlap = `segment ${i + 1} [${segs[i].start}, ${segs[i].end}) does not start at ${prevEnd}`;
        break;
      }
    }
    add('Processes do not overlap on the single CPU', overlap === '', overlap);

    // (d) Waiting and response times are nonnegative.
    const neg = result.rows.filter((r) => r.waiting < 0 || r.response < 0);
    add(
      'Waiting and response times are nonnegative',
      neg.length === 0,
      neg.map((r) => `${r.id}: W=${r.waiting}, R=${r.response}`).join('; ')
    );

    // (e) CPU never idle while a process is ready: during an idle interval [a, b)
    //     no process may be "in the system" (arrived but not completed).
    const completion = {};
    result.rows.forEach((r) => (completion[r.id] = r.completion));
    const idleViolations = [];
    segs
      .filter((s) => s.pid === null)
      .forEach((s) =>
        processes.forEach((p) => {
          if (p.arrival < s.end && completion[p.id] > s.start && p.arrival <= s.start) {
            idleViolations.push(`${p.id} ready during idle [${s.start}, ${s.end})`);
          } else if (p.arrival > s.start && p.arrival < s.end) {
            idleViolations.push(`${p.id} arrives at ${p.arrival} inside idle [${s.start}, ${s.end})`);
          }
        })
      );
    add('CPU is never idle while a process is ready', idleViolations.length === 0, idleViolations.join('; '));

    return checks;
  }

  const api = { simulate, validate, verify, fcfs, sjf, srtf, roundRobin, ALGORITHMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Scheduler = api;
})(typeof window !== 'undefined' ? window : this);
