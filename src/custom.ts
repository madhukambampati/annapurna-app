import type { Draft } from "./types.js";

function clean(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/** Identity of the custom food terms the owner priced. Pickup is intentionally excluded. */
export function customTermsKey(draft: Draft): string {
  const request = clean(draft.custom?.request ?? "");
  const items = draft.items.map((it) => `${it.id}:${it.pack}:${it.qty}`).sort();
  return JSON.stringify({ request, items, notes: clean(draft.notes) });
}

/** A custom price is usable only when it was quoted for the exact current custom terms. */
export function customQuoteIsCurrent(draft: Draft): boolean {
  const custom = draft.custom;
  return !!custom && custom.price != null && !!custom.quote_key && custom.quote_key === customTermsKey(draft);
}

export function clearCustomQuote(draft: Draft): Draft {
  if (!draft.custom) return draft;
  return { ...draft, custom: { ...draft.custom, price: null, approved: false, quote_key: null } };
}
