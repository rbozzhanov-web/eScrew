const FLIGHT_ROUTE_RE = /^[A-Z]{3,4}\s*→\s*[A-Z]{3,4}$/;
const FLIGHT_NUMBER_RE = /^KC[A-Z0-9]+(?:\s*·\s*DHC)?$/i;
const OFF_BADGES = new Set(['OFF', 'DOFF']);

function leaves(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('*')].filter((node) => node.children.length === 0);
}

function cardFromLeaf(leaf: HTMLElement): HTMLElement | undefined {
  let node = leaf.parentElement ?? undefined;
  for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement ?? undefined) {
    const radius = Number.parseFloat(window.getComputedStyle(node).borderRadius || '0');
    if (radius >= 12 && node.children.length >= 2) return node;
  }
  return leaf.parentElement?.parentElement ?? undefined;
}

function paint(card: HTMLElement | undefined, background: string, border: string) {
  if (!card) return;
  card.style.setProperty('background-color', background, 'important');
  card.style.setProperty('border-color', border, 'important');
}

function applyRosterDayColors() {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('root');
  if (!root) return;
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const flightBackground = dark ? 'rgba(45,125,255,.16)' : '#EEF5FF';
  const flightBorder = dark ? 'rgba(103,165,255,.30)' : '#CFE1FF';
  const offBackground = dark ? 'rgba(69,170,101,.16)' : '#EEF8F1';
  const offBorder = dark ? 'rgba(105,203,132,.30)' : '#CBE8D2';

  for (const leaf of leaves(root)) {
    const text = leaf.textContent?.trim() ?? '';
    if (FLIGHT_ROUTE_RE.test(text)) {
      const card = cardFromLeaf(leaf);
      if (!card) continue;
      const cardLeaves = leaves(card).map((item) => item.textContent?.trim() ?? '');
      if (cardLeaves.some((value) => FLIGHT_NUMBER_RE.test(value))) paint(card, flightBackground, flightBorder);
      continue;
    }
    if (OFF_BADGES.has(text)) paint(cardFromLeaf(leaf), offBackground, offBorder);
  }
}

export function installRosterDayColors() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  let queued = false;
  const apply = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      applyRosterDayColors();
    });
  };
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { subtree: true, childList: true });
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', apply);
}
