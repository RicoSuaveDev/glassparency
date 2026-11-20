/**
 * Glassparency devtools — tuning and debugging ("glassparency/devtools").
 * Live overrides of a group's settings, forced hover / pressed states, the
 * raw config blocks, the settings schema and render counters. Not needed to
 * use the glass, so it isn't part of the main entry any more.
 */
import type { GlassGroup, GlassGroupName, GlassProps } from './index';

export declare function isGlassColor(value: unknown): boolean;
export declare const GLASS_SCHEMA: Record<string, { type: string; label: string; section: string; min?: number; max?: number; step?: number; values?: string[] }>;
export declare const GLASS_STATE_KEYS: Array<'hover' | 'pressed' | 'disabled'>;
export declare function glassGroupNames(): string[];
export declare function rawGlassGroup(group: GlassGroupName): GlassGroup;
export declare function rawGlassThemeGroup(group: GlassGroupName): GlassGroup;
export declare function rawGlassDefaults(): GlassGroup;
export declare function setGlassOverride(group: GlassGroupName, props: GlassGroup): void;
export declare function clearGlassOverride(group: GlassGroupName): void;
export declare function getGlassOverride(group: GlassGroupName): GlassGroup;
export declare function setGlassStateOverride(group: GlassGroupName, state: 'hover' | 'pressed' | 'disabled', props: GlassProps): void;
export declare function setGlassForcedState(group: GlassGroupName, state: 'hover' | 'pressed' | 'disabled' | null): void;
export declare function subscribeGlassConfig(fn: (version: number) => void): () => void;
export declare function glassLiveCount(): number;
export declare const glassStats: {
  frames: number;
  lastFrameMs: number;
  snapshots: number;
  lastSnapshotMs: number;
  lastSnapshotAt: number;
  /** Floating canvases: frames that re-used the "everything below" cache / that redrew it. */
  belowHits: number;
  belowMisses: number;
  /** Canvas mode: last frame's element-position sync and drawing (ms). */
  canvasSyncMs: number;
  canvasPaintMs: number;
};
