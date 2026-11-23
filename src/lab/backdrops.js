/**
 * =============================================================================
 * src/lab/backdrops.js — The photos the lab's glass bends
 * =============================================================================
 * Unsplash (free to use), loaded straight from their CDN with CORS — nothing
 * is stored in the repo. Colourful and full of detail, so the refraction is
 * easy to see. "Image URL" in the lab shows any picture you paste (the glass
 * canvas needs one served with CORS; without it you see the CSS copy).
 * =============================================================================
 */
const unsplash = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=2400&q=80`;

/** The Backdrop choices (label + image). "lake" is the default. */
export const BACKDROPS = {
  lake: { label: 'Lake', url: unsplash('photo-1501785888041-af3ef285b470') },
  paint: { label: 'Paint', url: unsplash('photo-1557672172-298e090bd0f1') },
  city: { label: 'City', url: unsplash('photo-1477959858617-67f85cf4f1df') },
  mountains: { label: 'Mountains', url: unsplash('photo-1493246507139-91e8fad9978e') },
};
