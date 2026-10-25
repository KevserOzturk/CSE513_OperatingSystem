# CPU Scheduling Simulator (CSE513 Assignment 1)

A browser-based simulator for **FCFS**, **SJF (non-preemptive)**, **SRTF (preemptive)** and **Round Robin** CPU scheduling.
It draws a labelled Gantt chart (including idle intervals and numbered RR time slices), a results table with
first start, completion, turnaround, waiting and response times, and their averages. It also shows a step-by-step
decision trace and runs five correctness checks automatically on every simulation.

**Live site:** `[https://<your-github-username>.github.io/cse513-cpu-scheduler/](https://kevserozturk.github.io/CSE513_OperatingSystem/)`

## Run locally

No build step, no server, no installation.

1. Download or clone this folder.
2. Open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari). Double-clicking the file works.

`dist/cpu-scheduler-single.html` is the same app with the engine inlined into one file. You can send it as a single attachment.

## Run the tests

Requires [Node.js](https://nodejs.org/) 18 or newer. There are no npm dependencies.

```bash
node tests/run-tests.js      # 40 checks: hand calculations, own test cases, lecture examples,
                             # input validation, 8000 randomised runs vs. a reference simulator
node tests/mutation-demo.js  # injects a known Round-Robin bug and shows what catches it
```

## Files

| File | Purpose |
|---|---|
| `index.html` | User interface: process table, algorithm and quantum selection, Gantt chart, results, checks, trace |
| `scheduler.js` | Scheduling engine with no UI code. The browser and the tests load the same file. |
| `tests/run-tests.js` | Automated test suite |
| `tests/mutation-demo.js` | Bug-injection experiment used in the report |
| `tools/build-single-file.js` | Builds `dist/cpu-scheduler-single.html` |

## Model and rules

- The model has one CPU and gives each process one CPU burst, with no I/O and zero context-switch cost.
- All times are integers. Arrival ≥ 0, burst ≥ 1, quantum ≥ 1. Process IDs must be unique.
- An interval `[2, 5)` gives 3 units of CPU time.
- **FCFS:** runs the earliest-arriving ready process.
- **SJF:** when the CPU becomes free, runs the shortest burst.
- **SRTF:** runs the shortest remaining time and preempts only when another process is *strictly* shorter.
- **Ties:** earlier arrival wins, then earlier position in the input list.
- **RR:** uses a FIFO queue. Processes that arrive during a slice or exactly at its end are enqueued *before* the preempted process. A completed process never rejoins the queue.

## Limitations

- This simulator models scheduling *policies* only. It does not reproduce a real OS scheduler (e.g. Linux CFS/EEVDF).
- Each process has a single CPU burst. The simulator has no I/O phases, priorities, multiple CPUs or context-switch overhead. The "CPU dispatches" column in the comparison view counts how many switches a real system would pay for.
- Times must be integers.
- The Gantt chart scrolls horizontally for long schedules.
- Fonts load from Google Fonts. When you are offline, the page falls back to system fonts and works the same.
