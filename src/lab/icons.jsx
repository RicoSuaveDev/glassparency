/**
 * src/lab/icons.jsx — A few line icons for the lab (stroke = currentColor,
 * so they take the tab bar / sidebar accent colour).
 */
const PATHS = {
  x: 'M7 7l10 10M17 7L7 17',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20',
  home: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  radio: 'M12 12h.01M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8',
  library: 'M6 3h12M5 6h14M5 9h14v11H5zM11 17.5a1.5 1.5 0 1 1-1.5-1.5H11v-4.5l3-1',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  mic: 'M15 4l5 5-8 8-5-5zM7 12l-4 8 8-4',
  album: 'M7 4h10M5 7h14M4 10h16v10H4z',
  note: 'M9 18a2.5 2.5 0 1 1-2.5-2.5H9V5l9-2v12a2.5 2.5 0 1 1-2.5-2.5H18',
  // Toys page (morphing toolbar)
  plus: 'M12 5v14M5 12h14',
  pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  share: 'M12 3v12M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  // New controls (block sliders, toasts, popover)
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  speaker: 'M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5h.01',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  sort: 'M4 7h16M7 12h10M10 17h4',
};

export function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] || ''} />
    </svg>
  );
}
