// The character creator: name, class, origin, traits and flaws on a point budget, and a paper-doll
// look (robe, trim, orb, headwear, shadow) with a live preview.

import { CLASSES, HEADS, ORBS, ORIGINS, ROBES, ROBES_HI, SKINS, TRAITS, TRIMS, traitBudget, TRAIT_POINTS } from '../sim/character';
import { CARDS } from '../sim/cards';
import type { Look, WizardClass } from '../sim/types';
import { wizardSprite } from '../render/sprites';
import { meta, originLocked, saveMeta, type Profile } from './meta';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function portrait(look: Look, scale = 6): string {
  const set = wizardSprite({ robe: ROBES[look.robe], robeHi: ROBES_HI[look.robe], trim: TRIMS[look.trim], orb: ORBS[look.orb], skin: SKINS[look.skin], head: look.head });
  const src = set.canvas;
  const c = document.createElement('canvas');
  c.width = src.width * scale;
  c.height = src.height * scale;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL();
}

const swatches = (key: keyof Look, cols: string[], cur: number) =>
  `<div class="sw">${cols.map((c, i) => `<button type="button" class="swatch ${i === cur ? 'on' : ''}" data-look="${key}" data-v="${i}" style="background:${c}" aria-label="${key} ${i + 1}"></button>`).join('')}</div>`;

/** Draw the creator into `host`; calls `done` when the player confirms. */
export function openCreator(host: HTMLElement, done: () => void) {
  const p: Profile = JSON.parse(JSON.stringify(meta.profile));
  const render = () => {
    const left = traitBudget(p.traits);
    const classes = (Object.keys(CLASSES) as WizardClass[]).map((c) => `<button type="button" class="cls ${c === p.cls ? 'on' : ''}" data-cls="${c}"><b>${CLASSES[c].name}</b><span>${esc(CLASSES[c].desc)}</span></button>`).join('');
    const origins = Object.entries(ORIGINS).map(([id, o]) => {
      const locked = originLocked(id);
      return `<button type="button" class="cls ${id === p.origin ? 'on' : ''}" data-origin="${id}" ${locked ? 'disabled' : ''}><b>${esc(o.name)}${locked ? ' <small>(Sanctum)</small>' : ''}</b><span>${esc(o.desc)} Starts with ${esc(CARDS[o.card]?.name ?? o.card)}.</span></button>`;
    }).join('');
    const traits = Object.entries(TRAITS).map(([id, t]) => {
      const on = p.traits.includes(id);
      const cant = !on && left - t.cost < 0;
      return `<button type="button" class="trait ${on ? 'on' : ''} ${t.cost < 0 ? 'flaw' : ''}" data-trait="${id}" ${cant ? 'disabled' : ''}><b>${esc(t.name)}</b> <small>${t.cost > 0 ? `costs ${t.cost}` : `gives ${-t.cost}`}</small><span>${esc(t.desc)}</span></button>`;
    }).join('');
    host.innerHTML = `<div class="panel wide"><h2>Your spellwright</h2>
      <div class="creator">
        <div class="doll"><img alt="Your spellwright" src="${portrait(p.look)}">
          <label class="f">Name<input class="f" id="cname" maxlength="20" value="${esc(p.name)}"></label>
          <div class="k">Robe</div>${swatches('robe', ROBES, p.look.robe)}
          <div class="k">Trim</div>${swatches('trim', TRIMS, p.look.trim)}
          <div class="k">Orb</div>${swatches('orb', ORBS, p.look.orb)}
          <div class="k">Shadow</div>${swatches('skin', SKINS, p.look.skin)}
          <div class="k">Headwear</div><div class="sw">${HEADS.map((h, i) => `<button type="button" class="btn small ${i === p.look.head ? 'on' : ''}" data-look="head" data-v="${i}">${esc(h)}</button>`).join('')}</div>
        </div>
        <div class="sheet">
          <h3 class="sub">Calling</h3><div class="classes">${classes}</div>
          <h3 class="sub">Origin</h3><div class="classes origins">${origins}</div>
          <h3 class="sub">Traits and flaws <small>${left} of ${TRAIT_POINTS} points left. Flaws give points back.</small></h3><div class="traits">${traits}</div>
        </div>
      </div>
      <div class="row"><button type="button" class="btn ember" id="csave">Done</button><button type="button" class="btn small" id="crand">Randomize look</button></div></div>`;
    host.querySelector<HTMLInputElement>('#cname')!.addEventListener('input', (e) => { p.name = (e.target as HTMLInputElement).value.slice(0, 20); });
    for (const b of host.querySelectorAll<HTMLButtonElement>('[data-cls]')) b.addEventListener('click', () => { p.cls = b.dataset.cls as WizardClass; render(); });
    for (const b of host.querySelectorAll<HTMLButtonElement>('[data-origin]')) b.addEventListener('click', () => { p.origin = b.dataset.origin!; render(); });
    for (const b of host.querySelectorAll<HTMLButtonElement>('[data-trait]')) b.addEventListener('click', () => {
      const id = b.dataset.trait!;
      p.traits = p.traits.includes(id) ? p.traits.filter((t) => t !== id) : [...p.traits, id];
      if (traitBudget(p.traits) < 0) p.traits = p.traits.filter((t) => t !== id);
      render();
    });
    for (const b of host.querySelectorAll<HTMLButtonElement>('[data-look]')) b.addEventListener('click', () => { (p.look as unknown as Record<string, number>)[b.dataset.look!] = Number(b.dataset.v); render(); });
    host.querySelector('#crand')!.addEventListener('click', () => {
      const r = (n: number) => Math.floor(Math.random() * n);
      p.look = { robe: r(ROBES.length), trim: r(TRIMS.length), orb: r(ORBS.length), head: r(HEADS.length), skin: r(SKINS.length) };
      render();
    });
    host.querySelector('#csave')!.addEventListener('click', () => {
      p.name = p.name.trim() || 'Vox';
      meta.profile = p;
      saveMeta();
      done();
    });
  };
  render();
}
