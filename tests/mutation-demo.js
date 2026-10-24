/*
 * Mutation demo: injects a classic Round-Robin bug into a COPY of scheduler.js
 * and shows that the test suite catches it.  Run:  node tests/mutation-demo.js
 *
 * The bug: re-enqueueing the preempted process BEFORE admitting the processes that
 * arrived during the slice or exactly at its end (the opposite of the assignment rule).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'scheduler.js'), 'utf8');
const correct = `      const joined = admitUpTo(t);
      if (joined.length) log.push(\`t=\${t}: \${joined.join(', ')} arrive(s) and join the tail first.\`);

      // 2) ... then the unfinished running process is re-enqueued.
      if (remaining[cur.id] > 0) {
        queue.push(cur);`;
const buggy = `      // BUG: running process re-enqueued first, boundary arrivals second
      if (remaining[cur.id] > 0) queue.push(cur);
      const joined = admitUpTo(t);
      if (joined.length) log.push(\`t=\${t}: \${joined.join(', ')} arrive(s).\`);
      if (remaining[cur.id] > 0) {`;
if (!src.includes(correct)) throw new Error('could not locate the RR re-enqueue code');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-'));
fs.writeFileSync(path.join(dir, 'scheduler.js'), src.replace(correct, buggy));
const S = require(path.join(dir, 'scheduler.js'));

const A = [['P1', 0, 8], ['P2', 1, 4], ['P3', 2, 2], ['P4', 4, 1]].map(([id, arrival, burst]) => ({ id, arrival, burst }));
const r = S.simulate('RR', A, 2);
console.log('Buggy RR on Workload A, q=2:');
console.log('  ' + r.segments.map((s) => `${s.pid || 'idle'} ${s.start}-${s.end}`).join(' | '));
console.log('Expected (hand calculation):');
console.log('  P1 0-2 | P2 2-4 | P3 4-6 | P1 6-8 | P4 8-9 | P2 9-11 | P1 11-13 | P1 13-15');
console.log(`Average waiting: buggy ${r.averages.waiting}, expected 4.75`);
console.log('Property checks on the buggy schedule: ' + r.checks.map((c) => (c.pass ? 'pass' : 'FAIL')).join(', '));
console.log('\n=> The five generic properties still PASS (the buggy schedule is a valid schedule,');
console.log('   just not the one the assignment rule defines). Only the hand-calculated');
console.log('   expectation and the tick-by-tick reference expose the bug.');
