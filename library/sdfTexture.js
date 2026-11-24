/**
 * =============================================================================
 * glass/sdfTexture.js — A custom shape's distance field as a WebGL texture
 * =============================================================================
 * sdfShape.js makes the field (Float32Array of signed distances in CSS px);
 * this wraps it in a one-channel HALF-FLOAT texture for the liquid shader
 * (GlassCanvas.jsx makeLiquidMaterial, glassMemberSd). Half floats because
 * WebGL 2 can filter them linearly everywhere — 32-bit float textures need
 * OES_texture_float_linear, which phones (iOS) don't have — and their
 * precision (11-bit mantissa) is ~0.03 px near the edge, where it matters.
 *
 * Shared + reference-counted: every glass element showing the same field
 * (same shape, same size) uses one texture; it is freed when the last one
 * lets go. Lives with the WebGL chunk (imports three.js).
 * =============================================================================
 */
import * as THREE from 'three';

const textures = new Map(); // field → { tex, users }

/**
 * Get (and hold) the texture for a field; call release() when done.
 * @param {object} field  from sdfShape.js shapeFieldFor
 * @returns {{ tex: THREE.DataTexture, release(): void }}
 */
export function acquireFieldTexture(field) {
  let hit = textures.get(field);
  if (!hit) {
    const n = field.data.length;
    const half = new Uint16Array(n);
    // (Row 0 of the field is its TOP; a DataTexture's row 0 is v = 0 — the
    // shader flips v, see glassMemberSd.)
    for (let i = 0; i < n; i++) half[i] = THREE.DataUtils.toHalfFloat(field.data[i]);
    const tex = new THREE.DataTexture(half, field.tw, field.th, THREE.RedFormat, THREE.HalfFloatType);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.unpackAlignment = 2; // (rows of 2-byte texels)
    tex.needsUpdate = true;
    hit = { tex, users: 0 };
    textures.set(field, hit);
  }
  hit.users += 1;
  let released = false;
  return {
    tex: hit.tex,
    release() {
      if (released) return;
      released = true;
      hit.users -= 1;
      if (hit.users <= 0) {
        textures.delete(field);
        hit.tex.dispose();
      }
    },
  };
}
