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
 * Both work controlled (checked / value) or uncontrolled (defaultChecked /
 * defaultValue). Extra props (className, style, aria-*, id…) go to the root
 * element; size them with CSS (width / height). `groups` swaps the glass
 * groups used for each part (see controls.js).
 * =============================================================================
 */
import { forwardRef, useCallback, useLayoutEffect, useRef } from 'react';
import { createSlider, createSwitch } from './controls';
import { createCheckbox, createLensBar, createProgress, createRadio, createTextField } from './widgets';

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
