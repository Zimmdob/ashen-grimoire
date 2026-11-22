// Player feedback: a bug, an idea, a balance note. Sent through the same free relay as the game
// board, on its own private channel; a scheduled GitHub job (.github/workflows/feedback.yml) turns
// each note into an issue on the project page, where Dean (and Claude) can read and act on them.
// Notes that cannot be sent right away wait in local storage and go out next time.

const CHANNEL = 'ashen-grimoire-feedback-h5t8c2w9z4';
const RELAY = 'https://ntfy.sh';
const QUEUE = 'ashen-feedback-queue';

export type FeedbackKind = 'bug' | 'idea' | 'balance' | 'other';
export interface Feedback { kind: FeedbackKind; text: string; name: string; build: string; context: string; t: number }

function queued(): Feedback[] { try { return JSON.parse(localStorage.getItem(QUEUE) ?? '[]') as Feedback[]; } catch { return []; } }
function saveQueue(q: Feedback[]) { try { localStorage.setItem(QUEUE, JSON.stringify(q.slice(-20))); } catch { /* storage unavailable */ } }

async function post(f: Feedback): Promise<boolean> {
  try {
    const r = await fetch(`${RELAY}/${CHANNEL}`, { method: 'POST', body: JSON.stringify(f) });
    return r.ok;
  } catch { return false; }
}

/** Send a note now, or keep it for later if the relay can't be reached. True if it went out. */
export async function sendFeedback(f: Feedback): Promise<boolean> {
  const ok = await post(f);
  if (!ok) saveQueue([...queued(), f]);
  return ok;
}

/** Try again with anything that failed to send earlier. */
export async function flushFeedback() {
  const q = queued();
  if (!q.length) return;
  const left: Feedback[] = [];
  for (const f of q) if (!(await post(f))) left.push(f);
  saveQueue(left);
}
