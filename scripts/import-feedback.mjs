// Run by .github/workflows/feedback.yml: files players' feedback notes as GitHub issues.
// It first catches up on the last day of notes, then (with --watch) stays connected to the relay
// and files each new note within seconds, until shortly before the job's time limit. Each note's
// relay id is recorded in its issue body, so nothing is ever filed twice.
import { execFileSync } from 'node:child_process';

const CHANNEL = 'ashen-grimoire-feedback-h5t8c2w9z4';
const RELAY = `https://ntfy.sh/${CHANNEL}`;
const LABELS = { bug: ['bug', 'd73a4a'], idea: ['idea', '0e8a16'], balance: ['balance', 'fbca04'], other: ['feedback', 'c5def5'] };
const WATCH = process.argv.includes('--watch');
const WATCH_MINUTES = Number(process.env.WATCH_MINUTES || 340);

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });
// Notes show up on the job's page (and through the API), so a quiet run can still be checked.
const notice = (m) => console.log(`::notice title=feedback::${m}`);
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

for (const [name, color] of Object.values(LABELS)) {
  try { gh('label', 'create', name, '--color', color, '--force'); } catch { /* exists */ }
}
const seen = new Set((gh('issue', 'list', '--state', 'all', '--label', 'feedback', '--limit', '1000', '--json', 'body', '--jq', '.[].body')
  .match(/relay-note:[A-Za-z0-9]+/g) ?? []));

/** One relay event line in; files an issue if it is a new feedback note. */
function handle(line) {
  if (!line.trim()) return false;
  let ev; try { ev = JSON.parse(line); } catch { return false; }
  if (ev.event !== 'message' || !ev.message) return false;
  let f; try { f = JSON.parse(ev.message); } catch { return false; }
  if (!f || typeof f.text !== 'string' || !f.text.trim()) return false;
  const marker = `relay-note:${ev.id}`;
  if (seen.has(marker)) return false;
  const kind = LABELS[f.kind] ? f.kind : 'other';
  const who = clip(String(f.name || 'A player').replace(/[\r\n]/g, ' '), 40);
  const title = `[${kind[0].toUpperCase()}${kind.slice(1)}] ${clip(f.text.replace(/\s+/g, ' ').trim(), 70)}`;
  const body = [
    `**From:** ${who}`,
    `**When:** ${new Date(f.t || Date.now()).toISOString().replace('T', ' ').slice(0, 16)} UTC`,
    '',
    f.text.trim().slice(0, 1500).split('\n').map((l) => `> ${l}`).join('\n'),
    '',
    f.context ? `**What they were doing:** ${clip(String(f.context), 900)}` : '',
    '',
    `<sub>Sent from inside the game. ${marker}</sub>`,
  ].join('\n');
  const labels = ['feedback', LABELS[kind][0]].filter((v, i, a) => a.indexOf(v) === i).join(',');
  gh('issue', 'create', '--title', title, '--body', body, '--label', labels);
  seen.add(marker);
  console.log(`Filed: ${title}`);
  return true;
}

// 1. catch up on anything from the last day
const res = await fetch(`${RELAY}/json?poll=1&since=24h`, { headers: { 'user-agent': 'ashen-grimoire-feedback-importer' } });
if (!res.ok) throw new Error(`relay said ${res.status}`);
let filed = 0;
for (const line of (await res.text()).split('\n')) if (handle(line)) filed++;
notice(`Caught up: filed ${filed} new issue(s).`);
if (!WATCH) process.exit(0);

// 2. stay connected and file new notes as they arrive, reconnecting if the stream drops
const deadline = Date.now() + WATCH_MINUTES * 60_000;
notice(`Listening for new feedback for ${WATCH_MINUTES} minutes.`);
while (Date.now() < deadline) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(1000, deadline - Date.now()));
  try {
    // since=2m covers anything sent while reconnecting; already-filed notes are skipped
    const r = await fetch(`${RELAY}/json?since=2m`, { headers: { 'user-agent': 'ashen-grimoire-feedback-importer' }, signal: ctrl.signal });
    if (!r.ok || !r.body) throw new Error(`relay said ${r.status}`);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        try { if (handle(line)) filed++; } catch (e) { console.log(`Could not file a note: ${e.message}`); }
      }
    }
  } catch (e) {
    if (Date.now() < deadline && e.name !== 'AbortError') { console.log(`Stream dropped (${e.message}); reconnecting.`); await new Promise((r) => setTimeout(r, 5000)); }
  } finally { clearTimeout(timer); }
}
notice(`Done listening: filed ${filed} issue(s) in this run.`);
