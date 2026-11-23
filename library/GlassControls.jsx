/**
 * =============================================================================
 * glass/GlassControls.jsx — <GlassSwitch> and <GlassSlider> (React)
 * =============================================================================
 * Thin React wrappers round controls.js (which does all the work, so the
 * standalone script and plain-JS users get the very same controls).
 *
 *   <GlassSwitch checked={on} onChange={setOn} aria-label="Wi-Fi" />
 *   <GlassSlider value={vol} onChange={setVol} min={0} max={100} aria-label="Volume" />
 *   <GlassCheckbox checked={on} onChange={setOn}>On Desktop</GlassCheckbox>
 *   <GlassRadio name="size" checked={size === 's'} onChange={() => setSize('s')}>Small</GlassRadio>
 *   <GlassTextField icon={<SearchIcon/>} clearable value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
 *   <GlassTabBar value={tab} onChange={setTab}>{tabs.map((t) => <button data-gp-item key={t}>{t}</button>)}</GlassTabBar>
 *   <GlassSidebar value={page} onChange={setPage}>…[data-gp-item] rows…</GlassSidebar>
 *   <GlassProgress value={0.4} />   <GlassProgress value={null} /> (busy)
 * (The last six are thin wrappers round widgets.js.)
 *
 * pickers.js / overlays.js:
 *   <GlassSegmented value={i} onChange={setI}>{['Day','Week'].map((t) => <button data-gp-item key={t}>{t}</button>)}</GlassSegmented>
 *   <GlassStepper value={n} onChange={setN} min={0} max={10} />
 *   <GlassRangeSlider value={[20, 80]} onChange={setRange} />   <GlassRangeSlider orientation="vertical" value={v} … />
 *   <GlassBlockSlider value={v} onChange={setV}><SunIcon/></GlassBlockSlider>
 *   <GlassPopover label="Info">…content…</GlassPopover>
 *   <GlassMenu label="Actions" onSelect={(i) => …}><button role="menuitem">Copy</button>…</GlassMenu>
 *   <GlassSelect options={[{ value: 'a', label: 'A' }]} value={v} onChange={setV} />
 *   <GlassTooltip text="Share"><button>…</button></GlassTooltip>
 *   <GlassSheet open={open} onClose={() => setOpen(false)} detents={[0.45, 0.92]}>…</GlassSheet>
 *   const toast = useGlassToaster(); toast.show({ title: 'Saved', body: '…' })
 *
 * Both work controlled (checked / value) or uncontrolled (defaultChecked /
 * defaultValue). Extra props (className, style, aria-*, id…) go to the root
 * element; size them with CSS (width / height). `groups` swaps the glass
 * groups used for each part (see controls.js).
 * =============================================================================
 */
import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createSlider, createSwitch } from './controls';
import { createCheckbox, createLensBar, createProgress, createRadio, createTextField } from './widgets';
import { createBlockSlider, createRangeSlider, createSegmented, createStepper } from './pickers';
import { createMenu, createPopover, createSelect, createSheet, createToaster, createTooltip, getGlassOverlay } from './overlays';
import Glass from './Glass';

/** Keep our ref and the caller's ref pointing at the root element. */
function useMergedRef(forwarded) {
  const ref = useRef(null);
  const set = useCallback(
    (node) => {
      ref.current = node;
      if (typeof forwarded === 'function') forwarded(node);
      else if (forwarded) forwarded.current = node;
    },
    [forwarded]
  );
  return [ref, set];
}

/**
 * Liquid Glass on/off switch: click it, or drag the knob.
 * @param {{ checked?: boolean, defaultChecked?: boolean, onChange?: (checked: boolean) => void,
 *           disabled?: boolean, groups?: object, glassProps?: { track?: object } }} props
 */
export const GlassSwitch = forwardRef(function GlassSwitch({ checked, defaultChecked = false, onChange, disabled = false, groups, glassProps, ...rest }, forwarded) {
  const [ref, setRef] = useMergedRef(forwarded);
  const ctl = useRef(null);
  const controlled = checked !== undefined;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const groupsKey = JSON.stringify({ groups: groups || {}, glassProps: glassProps || {} });

  useLayoutEffect(() => {
    const c = createSwitch(ref.current, {
      checked: controlled ? Boolean(checked) : Boolean(defaultChecked),
      disabled,
      controlled,
      groups,
      props: glassProps,
      onChange: (v) => onChangeRef.current?.(v),
    });
    ctl.current = c;
    return () => {
      c.destroy();
      ctl.current = null;
    };
    // (re-created only when the glass groups change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsKey]);

  useLayoutEffect(() => {
    ctl.current?.update({ checked: controlled ? Boolean(checked) : undefined, disabled });
  }, [checked, controlled, disabled]);

  // aria-checked, role and the knob are written by controls.js.
  return <button ref={setRef} type="button" {...rest} />;
});

/**
 * Liquid Glass slider: drag the knob, click the track, or use the keyboard.
 * @param {{ value?: number, defaultValue?: number, min?: number, max?: number, step?: number,
 *           onChange?: (value: number) => void, onChangeEnd?: (value: number) => void,
 *           disabled?: boolean, groups?: object }} props
 */
export const GlassSlider = forwardRef(function GlassSlider(
  { value, defaultValue, min = 0, max = 100, step = 1, onChange, onChangeEnd, disabled = false, groups, glassProps, ...rest },
  forwarded
) {
  const [ref, setRef] = useMergedRef(forwarded);
  const ctl = useRef(null);
  const controlled = value !== undefined;
  const cb = useRef({ onChange, onChangeEnd });
  cb.current = { onChange, onChangeEnd };
  const groupsKey = JSON.stringify({ groups: groups || {}, glassProps: glassProps || {} });

  useLayoutEffect(() => {
    const c = createSlider(ref.current, {
      value: controlled ? value : defaultValue ?? min,
      min,
      max,
      step,
      disabled,
      controlled,
      groups,
      props: glassProps,
      onChange: (v) => cb.current.onChange?.(v),
      onChangeEnd: (v) => cb.current.onChangeEnd?.(v),
    });
    ctl.current = c;
    return () => {
      c.destroy();
      ctl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsKey]);

  useLayoutEffect(() => {
    ctl.current?.update({ value: controlled ? value : undefined, min, max, step, disabled });
  }, [value, controlled, min, max, step, disabled]);

  // role, aria-value* and the parts are written by controls.js.
  return <div ref={setRef} {...rest} />;
});

/**
 * Shared plumbing for the widgets.js wrappers: create on mount (again when
 * the glass groups / per-part props change), pass later prop changes to
 * update(), destroy on unmount.
 */
function useWidget(ref, create, opts, update, deps) {
  const ctl = useRef(null);
  const key = JSON.stringify({ g: opts.groups || {}, p: opts.props || {} });
  useLayoutEffect(() => {
    const c = create(ref.current, opts);
    ctl.current = c;
    return () => {
      c.destroy();
      ctl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useLayoutEffect(() => {
    if (ctl.current) ctl.current.update(update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Checkbox and radio share one wrapper. */
function makeCheck(create, displayName) {
  const C = forwardRef(function GlassCheck({ checked, defaultChecked = false, onChange, disabled = false, name, groups, glassProps, children, ...rest }, forwarded) {
    const [ref, setRef] = useMergedRef(forwarded);
    const cb = useRef(onChange);
    cb.current = onChange;
    const controlled = checked !== undefined;
    useWidget(
      ref,
      create,
      { checked: controlled ? Boolean(checked) : Boolean(defaultChecked), disabled, name, groups, props: glassProps, onChange: (v) => cb.current?.(v) },
      { checked: controlled ? Boolean(checked) : undefined, disabled },
      [checked, controlled, disabled]
    );
    // role, aria-checked and the glass box are written by widgets.js.
    return (
      <button ref={setRef} type="button" {...rest}>
        {children}
      </button>
    );
  });
  C.displayName = displayName;
  return C;
}

/**
 * Liquid Glass checkbox; children are its label.
 * @param {{ checked?: boolean, defaultChecked?: boolean, onChange?: (checked: boolean) => void,
 *           disabled?: boolean, groups?: object, glassProps?: { box?: object } }} props
 */
export const GlassCheckbox = makeCheck(createCheckbox, 'GlassCheckbox');
/**
 * Liquid Glass radio button; radios with the same `name` uncheck each other.
 * onChange(true) is called when the user picks it.
 */
export const GlassRadio = makeCheck(createRadio, 'GlassRadio');

/**
 * Liquid Glass text field. Input props (value, onChange, placeholder, type…)
 * go to the <input>; className / style go to the glass wrapper.
 * @param {{ icon?: React.ReactNode, clearable?: boolean, onClear?: () => void,
 *           className?: string, style?: object, groups?: object, glassProps?: object }} props
 */
export const GlassTextField = forwardRef(function GlassTextField({ icon, clearable = false, onClear, className, style, groups, glassProps, ...inputProps }, forwarded) {
  const wrap = useRef(null);
  const cb = useRef(onClear);
  cb.current = onClear;
  useWidget(wrap, createTextField, { clearable, groups, props: glassProps, onClear: () => cb.current?.() }, {}, [inputProps.value]);
  return (
    <div ref={wrap} className={className} style={style}>
      {icon}
      <input ref={forwarded} {...inputProps} />
    </div>
  );
});

/** Tab bar / sidebar: children are the items — give each one `data-gp-item`. */
function makeLensBar(orientation, displayName) {
  const C = forwardRef(function GlassLensBar({ value, defaultValue = 0, onChange, lensScale, inset, groups, glassProps, children, ...rest }, forwarded) {
    const [ref, setRef] = useMergedRef(forwarded);
    const cb = useRef(onChange);
    cb.current = onChange;
    const controlled = value !== undefined;
    useWidget(
      ref,
      createLensBar,
      { orientation, value: controlled ? value : defaultValue, lensScale, inset, groups, props: glassProps, onChange: (i) => cb.current?.(i) },
      { value: controlled ? value : undefined, lensScale, inset },
      [value, controlled, lensScale, inset]
    );
    return (
      <div ref={setRef} {...rest}>
        {children}
      </div>
    );
  });
  C.displayName = displayName;
  return C;
}
/**
 * iOS-style glass tab bar with a liquid lens.
 * @param {{ value?: number, defaultValue?: number, onChange?: (index: number) => void,
 *           lensScale?: number, inset?: number, groups?: object, glassProps?: object }} props
 */
export const GlassTabBar = makeLensBar('horizontal', 'GlassTabBar');
/** Glass sidebar with a sliding liquid selection lens (same props as GlassTabBar). */
export const GlassSidebar = makeLensBar('vertical', 'GlassSidebar');

/**
 * Liquid Glass progress bar: value 0–1, or null = busy (sliding drop).
 * @param {{ value?: number|null, bead?: boolean, groups?: object, glassProps?: object }} props
 */
export const GlassProgress = forwardRef(function GlassProgress({ value = null, bead = false, groups, glassProps, ...rest }, forwarded) {
  const [ref, setRef] = useMergedRef(forwarded);
  useWidget(ref, createProgress, { value, bead, groups, props: glassProps }, { value, bead }, [value, bead]);
  return <div ref={setRef} {...rest} />;
});

// =============================================================================
// pickers.js — segmented control, stepper, range / vertical / block sliders
// =============================================================================
/**
 * Liquid Glass segmented control; children are the segments — give each one
 * `data-gp-item`.
 * @param {{ value?: number, defaultValue?: number, onChange?: (index: number) => void,
 *           groups?: object, glassProps?: object }} props
 */
export const GlassSegmented = forwardRef(function GlassSegmented({ value, defaultValue = 0, onChange, lensScale, inset, groups, glassProps, children, ...rest }, forwarded) {
  const [ref, setRef] = useMergedRef(forwarded);
  const cb = useRef(onChange);
  cb.current = onChange;
  const controlled = value !== undefined;
  useWidget(
    ref,
    createSegmented,
    { value: controlled ? value : defaultValue, lensScale, inset, groups, props: glassProps, onChange: (i) => cb.current?.(i) },
    { value: controlled ? value : undefined, ...(lensScale !== undefined ? { lensScale } : {}), ...(inset !== undefined ? { inset } : {}) },
    [value, controlled, lensScale, inset]
  );
  return (
    <div ref={setRef} {...rest}>
      {children}
    </div>
  );
});

/**
 * Liquid Glass stepper (− value +): tap to step, hold to repeat.
 * @param {{ value?: number, defaultValue?: number, min?: number, max?: number, step?: number, wrap?: boolean,
 *           showValue?: boolean, format?: (value: number) => string,
 *           onChange?: (value: number) => void, disabled?: boolean, groups?: object, glassProps?: { body?: object } }} props
 */
export const GlassStepper = forwardRef(function GlassStepper({ value, defaultValue, min = 0, max = 100, step = 1, wrap, showValue = true, format, onChange, disabled = false, groups, glassProps, ...rest }, forwarded) {
  const [ref, setRef] = useMergedRef(forwarded);
  const cb = useRef(onChange);
  cb.current = onChange;
  const controlled = value !== undefined;
  useWidget(
    ref,
    createStepper,
    { value: controlled ? value : defaultValue ?? min, min, max, step, wrap, showValue, format, disabled, groups, props: glassProps, onChange: (v) => cb.current?.(v) },
    { ...(controlled ? { value } : {}), min, max, step, disabled, showValue, ...(format ? { format } : {}) },
    [value, controlled, min, max, step, disabled, showValue, format]
  );
  return <div ref={setRef} {...rest} />;
});

/**
 * Liquid Glass slider with two knobs (value [low, high]) or one standing up
 * (orientation "vertical", value a number). The orientation and whether it
 * has one or two knobs are read when it's created.
 * @param {{ value?: number|[number, number], defaultValue?: number|[number, number], min?: number, max?: number, step?: number,
 *           orientation?: 'horizontal'|'vertical', onChange?: (v: any) => void, onChangeEnd?: (v: any) => void,
 *           disabled?: boolean, groups?: object, glassProps?: { track?: object } }} props
 */
export const GlassRangeSlider = forwardRef(function GlassRangeSlider(
  { value, defaultValue, min = 0, max = 100, step = 1, orientation = 'horizontal', onChange, onChangeEnd, disabled = false, groups, glassProps, ...rest },
  forwarded
) {
  const [ref, setRef] = useMergedRef(forwarded);
  const cb = useRef({ onChange, onChangeEnd });
  cb.current = { onChange, onChangeEnd };
  const controlled = value !== undefined;
  const start = controlled ? value : defaultValue ?? [min, max];
  // (two knobs or one, and the orientation, are fixed per instance: a change re-creates it)
  const shape = `${Array.isArray(start) ? 2 : 1}${orientation}`;
  useWidget(
    ref,
    createRangeSlider,
    { value: start, min, max, step, orientation, disabled, groups: { ...(groups || {}), _shape: shape }, props: glassProps, onChange: (v) => cb.current.onChange?.(v), onChangeEnd: (v) => cb.current.onChangeEnd?.(v) },
    { ...(controlled ? { value } : {}), min, max, step, disabled },
    [controlled ? JSON.stringify(value) : null, min, max, step, disabled]
  );
  return <div ref={setRef} {...rest} />;
});

/**
 * Control Center-style block slider (no knob: the white fill is the value).
 * Children (an icon) sit at its start.
 * @param {{ value?: number, defaultValue?: number, min?: number, max?: number, step?: number,
 *           orientation?: 'vertical'|'horizontal', onChange?: (v: number) => void, onChangeEnd?: (v: number) => void,
 *           disabled?: boolean, groups?: object, glassProps?: { body?: object } }} props
 */
export const GlassBlockSlider = forwardRef(function GlassBlockSlider(
  { value, defaultValue, min = 0, max = 100, step = 1, orientation = 'vertical', onChange, onChangeEnd, disabled = false, groups, glassProps, children, ...rest },
  forwarded
) {
  const [ref, setRef] = useMergedRef(forwarded);
  const cb = useRef({ onChange, onChangeEnd });
  cb.current = { onChange, onChangeEnd };
  const controlled = value !== undefined;
  useWidget(
    ref,
    createBlockSlider,
    { value: controlled ? value : defaultValue ?? min, min, max, step, orientation, disabled, groups: { ...(groups || {}), _o: orientation }, props: glassProps, onChange: (v) => cb.current.onChange?.(v), onChangeEnd: (v) => cb.current.onChangeEnd?.(v) },
    { ...(controlled ? { value } : {}), min, max, step, disabled },
    [value, controlled, min, max, step, disabled]
  );
  return (
    <div ref={setRef} {...rest}>
      {children}
    </div>
  );
});

// =============================================================================
// overlays.js — popover, menu, select, tooltip, sheet, toasts
// =============================================================================
/**
 * The trigger button + panel shared by the popover, menu and select. The
 * trigger is a glass button (group `triggerGroup`); the panel is laid out
 * where it opens (position: fixed) and grows out of the button.
 */
function useOverlayPair(create, opts, deps) {
  // The panel is rendered straight into the shared glass overlay (a portal),
  // so createPopover never has to move a node React owns.
  const [host] = useState(() => (typeof document !== 'undefined' ? getGlassOverlay() : null));
  const anchor = useRef(null);
  const panel = useRef(null);
  const ctl = useRef(null);
  const key = JSON.stringify(deps);
  useLayoutEffect(() => {
    const c = create(anchor.current, panel.current, opts);
    ctl.current = c;
    return () => {
      c.destroy();
      ctl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { anchor, panel, ctl, host };
}
/** The panel: in the overlay (portal), or in place where there's no document (SSR). */
const inHost = (host, node) => (host ? createPortal(node, host) : node);

/**
 * Liquid Glass popover: a glass button whose panel grows out of it.
 * @param {{ label: React.ReactNode, children: React.ReactNode, triggerGroup?: string, triggerClassName?: string,
 *           triggerGlass?: object, className?: string, group?: string, glassProps?: object,
 *           placement?: 'auto'|'bottom'|'top', align?: 'start'|'center'|'end', onOpenChange?: (open: boolean) => void,
 *           'aria-label'?: string }} props
 */
export function GlassPopover({ label, children, triggerGroup = 'button', triggerClassName, triggerGlass, className, group, glassProps, placement, align, onOpenChange, 'aria-label': ariaLabel, ...rest }) {
  const cb = useRef(onOpenChange);
  cb.current = onOpenChange;
  const { anchor, panel, host } = useOverlayPair(createPopover, { group, props: glassProps, placement, align, onOpenChange: (o) => cb.current?.(o) }, [group, glassProps, placement, align]);
  return (
    <span data-gp-anchor-wrap="" {...rest}>
      <Glass ref={anchor} as="button" type="button" group={triggerGroup} glass={triggerGlass} className={triggerClassName} aria-label={ariaLabel}>
        {label}
      </Glass>
      {inHost(
        host,
        <div ref={panel} className={className}>
          {children}
        </div>
      )}
    </span>
  );
}

/**
 * Liquid Glass menu: children are the items (<button role="menuitem">…).
 * @param {{ label: React.ReactNode, children: React.ReactNode, onSelect?: (index: number, item: HTMLElement) => void } & object} props
 */
export function GlassMenu({ label, children, onSelect, triggerGroup = 'button', triggerClassName, triggerGlass, className, group, glassProps, placement, align, onOpenChange, 'aria-label': ariaLabel, ...rest }) {
  const cb = useRef({ onSelect, onOpenChange });
  cb.current = { onSelect, onOpenChange };
  const { anchor, panel, host } = useOverlayPair(
    createMenu,
    { group, props: glassProps, placement, align, onSelect: (i, it) => cb.current.onSelect?.(i, it), onOpenChange: (o) => cb.current.onOpenChange?.(o) },
    [group, glassProps, placement, align]
  );
  return (
    <span data-gp-anchor-wrap="" {...rest}>
      <Glass ref={anchor} as="button" type="button" group={triggerGroup} glass={triggerGlass} className={triggerClassName} aria-label={ariaLabel}>
        {label}
      </Glass>
      {inHost(
        host,
        <div ref={panel} role="menu" className={className}>
          {children}
        </div>
      )}
    </span>
  );
}

const CHEVRON = (
  <svg data-gp-chevron="" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CHECK = (
  <svg data-gp-check-mark="" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5.5 12.5l4.25 4.25L18.5 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Liquid Glass select (a pop-up button).
 * @param {{ options: { value: string, label: React.ReactNode }[], value?: string, onChange?: (value: string) => void,
 *           placeholder?: React.ReactNode } & object} props
 */
export function GlassSelect({ options = [], value, onChange, placeholder = 'Choose…', triggerGroup = 'button', triggerClassName, triggerGlass, className, group, glassProps, placement, align, 'aria-label': ariaLabel, ...rest }) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const values = options.map((o) => String(o.value));
  const { anchor, panel, ctl, host } = useOverlayPair(
    createSelect,
    { value, group, props: glassProps, placement, align, onChange: (v) => cb.current?.(v) },
    [group, glassProps, placement, align, values]
  );
  useLayoutEffect(() => {
    ctl.current?.update({ value });
  }, [value, ctl]);
  const picked = options.find((o) => String(o.value) === String(value));
  return (
    <span data-gp-anchor-wrap="" {...rest}>
      <Glass ref={anchor} as="button" type="button" group={triggerGroup} glass={triggerGlass} className={triggerClassName} data-gp-select-trigger="" aria-label={ariaLabel}>
        <span data-gp-select-label="">{picked ? picked.label : placeholder}</span>
        {CHEVRON}
      </Glass>
      {inHost(
        host,
        <div ref={panel} className={className}>
          {options.map((o) => (
            <button key={String(o.value)} type="button" role="option" data-value={String(o.value)}>
              {CHECK}
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/**
 * Liquid Glass tooltip round its children (shown on hover / keyboard focus).
 * @param {{ text: string, placement?: 'top'|'bottom', delay?: number, group?: string, glassProps?: object, children: React.ReactNode }} props
 */
export function GlassTooltip({ text, placement, delay, group, glassProps, children, ...rest }) {
  const ref = useRef(null);
  const ctl = useRef(null);
  const key = JSON.stringify({ placement, delay, group });
  useLayoutEffect(() => {
    const c = createTooltip(ref.current, { text, placement, delay, group, props: glassProps });
    ctl.current = c;
    return () => c.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useLayoutEffect(() => {
    ctl.current?.update({ text, props: glassProps || {} });
  }, [text, glassProps]);
  return (
    <span ref={ref} data-gp-tooltip-anchor="" {...rest}>
      {children}
    </span>
  );
}

/**
 * Liquid Glass bottom sheet (rendered into the shared glass overlay).
 * @param {{ open: boolean, onClose?: () => void, detents?: number[], detent?: number,
 *           onDetentChange?: (index: number) => void, className?: string, glassProps?: object,
 *           children: React.ReactNode, 'aria-label'?: string }} props
 */
export function GlassSheet({ open, onClose, detents, detent = 0, onDetentChange, className, groups, glassProps, children, ...rest }) {
  const ref = useRef(null);
  const ctl = useRef(null);
  const cb = useRef({ onClose, onDetentChange });
  cb.current = { onClose, onDetentChange };
  const [host, setHost] = useState(null);
  useLayoutEffect(() => setHost(getGlassOverlay()), []);
  const key = JSON.stringify({ detents, groups });
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const c = createSheet(ref.current, { detents, groups, props: glassProps, onClose: () => cb.current.onClose?.(), onDetentChange: (i) => cb.current.onDetentChange?.(i) });
    ctl.current = c;
    return () => {
      c.destroy();
      ctl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, host]);
  useLayoutEffect(() => {
    ctl.current?.update({ props: glassProps || {} });
  }, [glassProps]);
  useLayoutEffect(() => {
    const c = ctl.current;
    if (!c) return;
    if (open) c.open(detent);
    else c.close();
  }, [open, detent, host]);
  if (!host) return null;
  return createPortal(
    <div ref={ref} className={className} {...rest}>
      {children}
    </div>,
    host
  );
}

/**
 * Toasts: const toast = useGlassToaster(); toast.show({ title, body, icon, duration, props }).
 * @param {{ group?: string, max?: number, duration?: number }} [opts]
 */
export function useGlassToaster(opts) {
  const ref = useRef(null);
  const key = JSON.stringify(opts || {});
  const api = useMemo(
    () => ({
      show: (t) => (ref.current ? ref.current.show(t) : () => {}),
      clear: () => ref.current?.clear(),
    }),
    []
  );
  useEffect(() => {
    const t = createToaster(opts);
    ref.current = t;
    return () => {
      t.destroy();
      ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return api;
}
