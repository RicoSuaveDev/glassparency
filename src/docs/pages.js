/**
 * =============================================================================
 * src/docs/pages.js — Every playground page, in sidebar order
 * =============================================================================
 * The 1.5.1 controls (controls.jsx) followed by the 1.5.2 features and the
 * framework setup page (controls152.jsx). Docs.jsx (sidebar) and
 * Playground.jsx (the page) read this list, never the two files directly.
 * =============================================================================
 */
import { CONTROLS, SECTIONS as CONTROL_SECTIONS } from './controls';
import { CONTROLS_152, SECTION_152, SECTION_SETUP } from './controls152';

export const PAGES = [...CONTROLS, ...CONTROLS_152];
export const SECTIONS = [...CONTROL_SECTIONS, SECTION_152, SECTION_SETUP];
