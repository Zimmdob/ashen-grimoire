// The character creator. Appearance (race, gender, build, skin, hair, face, clothes, headwear,
// staff) is purely cosmetic; calling, origin and traits change how you play.

import {
  BEARDS, BUILDS, CLASSES, cleanLook, EYES, GENDER_BUILD, GENDERS, HAIR_COLORS, HAIR_STYLES, HEADS, LOOK_COUNTS,
  ORBS, ORIGINS, OUTFITS, RACES, ROBES, TRAITS, traitBudget, TRAIT_POINTS, TRIMS,
} from '../sim/character';
import { CARDS } from '../sim/cards';
import type { Look, WizardClass } from '../sim/types';
import { wizardSprite } from '../render/sprites';
import { meta, originLocked, saveMeta, type Profile } from './meta';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function portrait(look: Look, scale = 6): string {
  const src = wizardSprite(cleanLook(look)).canvas;
  const c = document.createElement('canvas');
  c.width = src.width * scale;
  c.height = src.height * scale;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL();
}

/** One line describing who someone is: "Elf woman · Tarot Witch · Hedge Witch". */
export function whoLine(p: { cls?: WizardClass; origin?: string; look?: Look }): string {
  const l = cleanLook(p.look);
  const g = ['man', 'woman', 'non-binary'][l.gender] ?? '';
  return `${RACES[l.race].name} ${g} · ${CLASSES[p.cls ?? 'spellwright'].name} · ${ORIGINS[p.origin ?? 'knight']?.name ?? ''}`;
}

const swatches = (key: keyof Look, cols: string[], cur: number) =>
  `<div class="sw">${cols.map((c, i) => `<button type="button" class="swatch ${i === cur ? 'on' : ''}" data-look="${key}" data-v="${i}" style="background:${c}" aria-label="${key} ${i + 1}"></button>`).join('')}</div>`;
const choices = (key: keyof Look, names: string[], cur: number) =>
  `<div class="sw">${names.map((n, i) => `<button type="button" class="btn small ${i === cur ? 'on' : ''}" data-look="${key}" data-v="${i}">${esc(n)}</button>`).join('')}</div>`;
/** Little head-and-shoulders previews for each choice of one field. */
const thumbs = (key: keyof Look, names: string[], look: Look) =>
  `<div class="thumbs">${names.map((n, i) => `<button type="button" class="thumb ${i === look[key] ? 'on' : ''}" data-look="${key}" data-v="${i}" title="${esc(n)}"><img alt="" src="${portrait({ ...look, [key]: i }, 3)}"><span>${esc(n)}</span></button>`).join('')}</div>`;

type Tab = 'look' | 'calling' | 'origin' | 'traits';

/** Draw the creator into `host`; calls `done` when the player confirms. */
export function openCreator(host: HTMLElement, done: () => void) {
  const p: Profile = JSON.parse(JSON.stringify(meta.profile));
  p.look = cleanLook(p.look);
  let tab: Tab = 'look';
  const render = () => {
    const l = p.look;
    const left = traitBudget(p.traits);
    let body = '';
    if (tab === 'look') {
      const race = RACES[l.race];
      body = `
        <h3 class="sub">Race <small>${esc(race.desc)}</small></h3>${thumbs('race', RACES.map((r) => r.name), l)}
        <h3 class="sub">Gender</h3>${choices('gender', GENDERS, l.gender)}
        <h3 class="sub">Build</h3>${choices('build', BUILDS, l.build)}
        <h3 class="sub">Skin</h3>${swatches('skin', race.skins, l.skin)}
        <h3 class="sub">Hair</h3>${thumbs('hair', HAIR_STYLES, l)}
        <h3 class="sub">Hair colour</h3>${swatches('hairColor', HAIR_COLORS, l.hairColor)}
        <h3 class="sub">Facial hair</h3>${choices('beard', BEARDS, l.beard)}
        <h3 class="sub">Eyes</h3>${swatches('eyes', EYES, l.eyes)}
        <h3 class="sub">Clothes</h3>${thumbs('outfit', OUTFITS, l)}
        <h3 class="sub">Colour</h3>${swatches('robe', ROBES, l.robe)}
        <h3 class="sub">Trim</h3>${swatches('trim', TRIMS, l.trim)}
        <h3 class="sub">Headwear</h3>${thumbs('head', HEADS, l)}
        <h3 class="sub">Staff orb</h3>${swatches('orb', ORBS, l.orb)}
        <p class="k">Looks are cosmetic: race and gender never change the rules.</p>`;
    } else if (tab === 'calling') {
      body = `<h3 class="sub">Calling <small>How you pay for spells, and what makes you different.</small></h3><div class="classes">${(Object.keys(CLASSES) as WizardClass[]).map((c) => `<button type="button" class="cls ${c === p.cls ? 'on' : ''}" data-cls="${c}"><b>${CLASSES[c].name}</b><span>${esc(CLASSES[c].desc)}</span></button>`).join('')}</div>`;
    } else if (tab === 'origin') {
      body = `<h3 class="sub">Origin <small>Where you come from: a starting spell and a perk.</small></h3><div class="classes origins">${Object.entries(ORIGINS).map(([id, o]) => {
        const locked = originLocked(id);
        return `<button type="button" class="cls ${id === p.origin ? 'on' : ''}" data-origin="${id}" ${locked ? 'disabled' : ''}><b>${esc(o.name)}${locked ? ' <small>(Sanctum)</small>' : ''}</b><span>${esc(o.desc)} Starts with ${esc(CARDS[o.card]?.name ?? o.card)}.</span></button>`;
      }).join('')}</div>`;
    } else {
      body = `<h3 class="sub">Traits and flaws <small>${left} of ${TRAIT_POINTS} points left. Flaws give points back.</small></h3><div class="traits">${Object.entries(TRAITS).map(([id, t]) => {
        const on = p.traits.includes(id);
        const cant = !on && left - t.cost < 0;
        return `<button type="button" class="trait ${on ? 'on' : ''} ${t.cost < 0 ? 'flaw' : ''}" data-trait="${id}" ${cant ? 'disabled' : ''}><b>${esc(t.name)}</b> <small>${t.cost > 0 ? `costs ${t.cost}` : `gives ${-t.cost}`}</small><span>${esc(t.desc)}</span></button>`;
      }).join('')}</div>`;
    }
    const tabs: [Tab, string][] = [['look', 'Appearance'], ['calling', 'Calling'], ['origin', 'Origin'], ['traits', 'Traits']];
    const scroll = host.querySelector('.sheet')?.scrollTop ?? 0;
    host.innerHTML = `<div class="panel wide"><h2>Your spellwright</h2>
      <div class="creator">
        <div class="doll"><img alt="Your spellwright" src="${portrait(l, 10)}">
          <label class="f">Name<input class="f" id="cname" maxlength="20" value="${esc(p.name)}"></label>
          <p class="k">${esc(whoLine(p))}</p>
          <div class="row"><button type="button" class="btn small" id="crand">Random look</button><button type="button" class="btn ember" id="csave">Done</button></div>
        </div>
        <div class="sheet">
          <div class="tabs" role="tablist">${tabs.map(([t, n]) => `<button type="button" role="tab" class="btn small ${t === tab ? 'on' : ''}" data-tab="${t}" aria-selected="${t === tab}">${n}</button>`).join('')}</div>
          ${body}
        </div>
      </div></div>`;
    const sheet = host.querySelector<HTMLElement>('.sheet');
    if (sheet) sheet.scrollTop = scroll;
    host.querySelector<HTMLInputElement>('#cname')!.addEventListener('input', (e) => { p.name = (e.target as HTMLInputElement).value.slice(0, 20); });
    for (const b of host.querySelectorAll<HTMLButtonElement>('[data-tab]')) b.addEventListener('click', () => { tab = b.dataset.tab as Tab; host.querySelector('.sheet')?.scrollTo(0, 0); render(); });
    for (const b of host.querySelectorAll<HTMLButtonElement>('[data-cls]')) b.addEventListener('click', () => { p.cls = b.dataset.cls as WizardClass; render(); });
    for (const b of host.querySelectorAll<HTMLButtonElement>('[data-origin]')) b.addEventListener('click', () => { p.origin = b.dataset.origin!; render(); });
    for (const b of host.querySelectorAll<HTMLButtonElement>('[data-trait]')) b.addEventListener('click', () => {
      const id = b.dataset.trait!;
      p.traits = p.traits.includes(id) ? p.traits.filter((t) => t !== id) : [...p.traits, id];
      if (traitBudget(p.traits) < 0) p.traits = p.traits.filter((t) => t !== id);
      render();
    });
    for (const b of host.querySelectorAll<HTMLButtonElement>('[data-look]')) b.addEventListener('click', () => {
      const key = b.dataset.look as keyof Look;
      const v = Number(b.dataset.v);
      p.look = cleanLook({ ...p.look, [key]: v });
      if (key === 'gender') p.look.build = GENDER_BUILD[v] ?? p.look.build;
      if (key === 'race') {
        p.look.skin = Math.min(p.look.skin, RACES[v].skins.length - 1);
        if (RACES[v].name === 'Dwarf' && p.look.gender === 0 && p.look.beard === 0) p.look.beard = 4;
      }
      render();
    });
    host.querySelector('#crand')!.addEventListener('click', () => {
      const r = (n: number) => Math.floor(Math.random() * n);
      const race = r(RACES.length);
      const gender = r(GENDERS.length);
      const look = {} as Look;
      for (const k of Object.keys(LOOK_COUNTS) as (keyof Look)[]) look[k] = r(LOOK_COUNTS[k]);
      look.race = race;
      look.gender = gender;
      look.build = Math.random() < 0.7 ? GENDER_BUILD[gender] : r(BUILDS.length);
      look.skin = r(RACES[race].skins.length);
      look.beard = gender === 0 && Math.random() < 0.6 ? 1 + r(BEARDS.length - 1) : 0;
      look.hairColor = Math.random() < 0.75 ? r(10) : r(HAIR_COLORS.length);
      p.look = cleanLook(look);
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
