/**
 * Glassparency — "glassparency/tailwind": the Tailwind CSS plugin (v4 @plugin, v3 plugins: [...]).
 * Classes: glass, glass-clear, glass-frosted, glass-tinted, glass-smoke,
 * glass-group-<name>, glass-tint-<colour>.
 */
export interface GlassparencyTailwindOptions {
  /** The plain-CSS stand-in until the glass attaches (default true). */
  fallback?: boolean;
  /** Group names offered by glass-group-* (default: the built-in ones). */
  groups?: string[];
}
interface TailwindPluginWithOptions {
  (options?: GlassparencyTailwindOptions): { handler: (api: any) => void; config?: unknown };
  __isOptionsFunction: true;
}
declare const glassparency: TailwindPluginWithOptions;
export default glassparency;
