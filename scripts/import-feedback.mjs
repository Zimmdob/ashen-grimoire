// Run by .github/workflows/feedback.yml: reads players' feedback notes from the relay channel
// and files each one as a GitHub issue (once; the note's id is recorded in the issue body).
import { execFileSync } from 'node:child_process';

const CHANNEL = 'ashen-grimoire-feedback-h5t8c2w9z4';
const LABELS = { bug: ['bug', 'd73a4a'], idea: ['idea', '0e8a16'], balance: ['balance', 'fbca04'], other: ['feedback', 'c5def5'] };

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });

// Notes show up on the job's page (and through the API), so a quiet run can still be checked.
const notice = (m) => console.log(`::notice title=feedback::${m}`);
const res = await fetch(`https://ntfy.sh/${CHANNEL}/json?poll=1&since=24h`, { headers: { 'user-agent': 'ashen-grimoire-feedback-importer' } });
if (!res.ok) throw new Error(`relay said ${res.status}`);
const raw = await res.text();
notice(`relay answered ${res.status} with ${raw.split('\n').filter((l) => l.trim()).length} line(s): ${raw.slice(0, 160).replace(/\s+/g, ' ')}`);
const notes = [];
for (const line of raw.split('\n')) {
  if (!line.trim()) continue;
  let ev; try { ev = JSON.parse(line); } catch { continue; }
  if (ev.event !== 'message' || !ev.message) continue;
  let f; try { f = JSON.parse(ev.message); } catch { continue; }
  if (!f || typeof f.text !== 'string' || !f.text.trim()) continue;
  notes.push({ id: ev.id, ...f });
}
if (!notes.length) { notice('No feedback notes found.'); process.exit(0); }

for (const [name, color] of Object.values(LABELS)) {
  try { gh('label', 'create', name, '--color', color, '--force'); } catch { /* exists */ }
}
const seen = gh('issue', 'list', '--state', 'all', '--label', 'feedback', '--limit', '500', '--json', 'body', '--jq', '.[].body');
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
let filed = 0;
for (const f of notes) {
  const marker = `relay-note:${f.id}`;
  if (seen.includes(marker)) continue;
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
  filed++;
}
notice(`Found ${notes.length} note(s), filed ${filed} new issue(s).`);
