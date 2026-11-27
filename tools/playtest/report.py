#!/usr/bin/env python3
"""Summarise playtest-lab runs (JSON lines from lab.ts) against the design targets."""
import json, sys, statistics as S
from collections import defaultdict

runs = [json.loads(l) for f in sys.argv[1:] for l in open(f) if l.strip()]
def pct(x): return f"{100*x:5.1f}%"
def med(a): return S.median(a) if a else 0
def p90(a): return sorted(a)[int(len(a)*0.9)] if a else 0
print(f"{len(runs)} runs\n")

print("== Flow: outcome by skill and difficulty (targets on Normal: novice dies ~act 2-3, average wins 25-40%, expert 70%+)")
g = defaultdict(list)
for r in runs: g[(r['diff'], r['skill'])].append(r)
for k in sorted(g):
    rs = g[k]
    print(f"  {k[0]:9} {k[1]:8} n={len(rs):4}  win {pct(sum(r['won'] for r in rs)/len(rs))}  acts cleared avg {S.mean(r['acts'] for r in rs):.2f}  run {med([r['secs'] for r in rs])/60:5.1f} min  level {S.mean(r['level'] for r in rs):.1f}")

print("\n== Where runs end (act.room.kind[.twist]), top 12")
d = defaultdict(int)
for r in runs:
    if r['deathRoom']: d[r['deathRoom']] += 1
for k, v in sorted(d.items(), key=lambda x: -x[1])[:12]: print(f"  {k:28} {v}")

rooms = [(r, x) for r in runs for x in r['rooms']]
print("\n== Pacing (targets: fights 15-45s, bosses 45-90s, idle < 5%)")
for kind in ['fight', 'elite', 'boss']:
    xs = [x for _, x in rooms if x['kind'] == kind]
    if not xs: continue
    secs = [x['secs'] for x in xs]
    print(f"  {kind:6} n={len(xs):5}  median {med(secs):5.1f}s  p90 {p90(secs):5.1f}s  idle {pct(S.mean(x['idle'] for x in xs))}  danger {pct(S.mean(x['danger'] for x in xs))}  timeouts {sum(1 for s in secs if s >= 399)}")

print("\n== Sawtooth: hits per minute and time-to-kill by act and room (expert+average)")
cell = defaultdict(lambda: [0, 0.0, []])
for r, x in rooms:
    if r['skill'] == 'novice': continue
    key = (x['act'], 'B' if x['kind'] == 'boss' else min(x['room'], 3))
    c = cell[key]; c[0] += x['hits']; c[1] += x['secs']; c[2].append(x['ttk'])
for a in range(6):
    line = []
    for rm in [1, 2, 3, 'B']:
        c = cell.get((a, rm))
        if c and c[1] > 0: line.append(f"{rm}: {60*c[0]/c[1]:4.1f}/min ttk {med([t for t in c[2] if t>0]):4.1f}s")
    if line: print(f"  act {a}  " + "  |  ".join(line))

print("\n== Fairness: what hits you (all skills)")
cz = defaultdict(int)
for _, x in rooms:
    for k, v in x['causes'].items(): cz[k] += v
tot = sum(cz.values()) or 1
for k, v in sorted(cz.items(), key=lambda x: -x[1]): print(f"  {k:10} {v:6}  {pct(v/tot)}")

print("\n== Bosses (expert+average)")
bz = defaultdict(list)
for r, x in rooms:
    if x['kind'] == 'boss' and r['skill'] != 'novice': bz[x['boss'] or '?'].append(x)
for b, xs in sorted(bz.items(), key=lambda kv: -len(kv[1])):
    print(f"  {b:10} n={len(xs):4}  median {med([x['secs'] for x in xs]):5.1f}s  deaths {pct(sum(x['died'] for x in xs)/len(xs))}  hits/min {60*sum(x['hits'] for x in xs)/max(1,sum(x['secs'] for x in xs)):4.1f}")

print("\n== Twists (all fights): length and lethality")
tw = defaultdict(list)
for _, x in rooms:
    if x['kind'] != 'boss': tw[x['twist'] or '-'].append(x)
for t, xs in sorted(tw.items(), key=lambda kv: kv[0]):
    print(f"  {t:10} n={len(xs):5}  median {med([x['secs'] for x in xs]):5.1f}s  hits/min {60*sum(x['hits'] for x in xs)/max(1,sum(x['secs'] for x in xs)):4.1f}  deaths {pct(sum(x['died'] for x in xs)/len(xs))}  timeouts {sum(1 for x in xs if x['secs']>=399)}")

print("\n== Rewards: seconds between level-ups (target ~40-75s)")
lt = [t for r in runs for t in r['levelTimes']]
print(f"  median {med(lt):.1f}s  p90 {p90(lt):.1f}s  levels per run {S.mean(r['level'] for r in runs):.1f}")

def lift(name, has):
    pool = [r for r in runs if r['skill'] != 'novice']
    a = [r['acts'] for r in pool if has(r)]; b = [r['acts'] for r in pool if not has(r)]
    if len(a) < 15 or len(b) < 15: return None
    return S.mean(a) - S.mean(b), len(a)
print("\n== Choice balance: acts cleared with vs without (average+expert). |lift| > 0.6 is suspicious")
print("  classes:")
for c in sorted({r['cls'] for r in runs}):
    rs = [r for r in runs if r['cls'] == c and r['skill'] != 'novice']
    if rs: print(f"    {c:12} win {pct(sum(r['won'] for r in rs)/len(rs))}  acts {S.mean(r['acts'] for r in rs):.2f}")
for label, keys, get in [('boons', sorted({k for r in runs for k in r['boons']}), lambda r, k: r['boons'].get(k, 0) > 0), ('relics', sorted({k for r in runs for k in r['relics']}), lambda r, k: k in r['relics'])]:
    res = []
    for k in keys:
        l = lift(k, lambda r, k=k: get(r, k))
        if l: res.append((l[0], k, l[1]))
    res.sort()
    print(f"  {label}: weakest " + ", ".join(f"{k} {v:+.2f}" for v, k, n in res[:5]))
    print(f"  {label}: strongest " + ", ".join(f"{k} {v:+.2f}" for v, k, n in res[-5:][::-1]))
