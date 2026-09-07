/**
 * The module field on one tower face: secondary support frame, the 8x20 grid of
 * snowflake modules, and the ~9,600 blades that move.
 *
 * Three InstancedMeshes total:
 *   - secondary frame verticals (GRID_COLS instances, static)
 *   - module hardware, hub through brackets (MODULE_COUNT instances, static)
 *   - blades (MODULE_COUNT * 60 instances, updated per frame when they change)
 *
 * Blades of one module occupy a contiguous instance block, so a module whose
 * state did not change this frame is skipped wholesale, and only the touched
 * span of the matrix buffer is re-uploaded.
 */

import * as THREE from 'three';
import * as C from './constants.js';
import { FACES, MODULE_FACE, faceToWorld, faceQuaternion } from './tower.js';
import {
  buildModuleStaticGeometry,
  buildBladeGeometry,
  buildBladeLayout,
  MODULE_BLADE_COUNT,
} from './snowflakeModule.js';

const DEG = Math.PI / 180;

export function buildFacade(scene) {
  const face = FACES[MODULE_FACE];
  const faceQuat = faceQuaternion(face);

  const aluminium = new THREE.MeshStandardMaterial({
    color: C.ALUMINIUM_COLOR,
    metalness: C.ALUMINIUM_METALNESS,
    roughness: C.ALUMINIUM_ROUGHNESS,
    envMapIntensity: 1.2,
  });

  /* -------------------------------------------------------------- *
   * Module placement
   * -------------------------------------------------------------- */

  const pitchX = C.MODULE_PITCH_X * C.MM;
  const pitchY = C.MODULE_PITCH_Y * C.MM;
  const standoff = C.MODULE_STANDOFF * C.MM;
  const baseY = C.GRID_BASE_HEIGHT * C.MM;

  const modulePos = [];
  /** Normalised grid coordinates, used by the sun response. */
  const moduleU = new Float32Array(C.MODULE_COUNT);
  const moduleV = new Float32Array(C.MODULE_COUNT);

  let idx = 0;
  for (let row = 0; row < C.GRID_ROWS; row++) {
    for (let col = 0; col < C.GRID_COLS; col++) {
      const localX = (col - (C.GRID_COLS - 1) / 2) * pitchX;
      const y = baseY + row * pitchY;
      modulePos.push(faceToWorld(face, localX, y, standoff));
      moduleU[idx] = C.GRID_COLS === 1 ? 0.5 : col / (C.GRID_COLS - 1);
      moduleV[idx] = C.GRID_ROWS === 1 ? 0.5 : row / (C.GRID_ROWS - 1);
      idx++;
    }
  }

  const fieldWidth = (C.GRID_COLS - 1) * pitchX;
  const fieldHeight = (C.GRID_ROWS - 1) * pitchY;
  const fieldCenter = faceToWorld(face, 0, baseY + fieldHeight / 2, standoff);

  /* -------------------------------------------------------------- *
   * Secondary support frame
   * -------------------------------------------------------------- */

  const frameMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.9, roughness: 0.45 }),
    C.GRID_COLS
  );
  frameMesh.castShadow = true;
  frameMesh.receiveShadow = true;

  {
    const m = new THREE.Matrix4();
    const runHeight = fieldHeight + pitchY * 1.2;
    const s = new THREE.Vector3(
      C.SECONDARY_FRAME_WIDTH * C.MM,
      runHeight,
      C.SECONDARY_FRAME_DEPTH * C.MM
    );
    for (let col = 0; col < C.GRID_COLS; col++) {
      const localX = (col - (C.GRID_COLS - 1) / 2) * pitchX;
      const pos = faceToWorld(
        face,
        localX,
        baseY + fieldHeight / 2,
        C.SECONDARY_FRAME_OFFSET * C.MM
      );
      m.compose(pos, faceQuat, s);
      frameMesh.setMatrixAt(col, m);
    }
    frameMesh.instanceMatrix.needsUpdate = true;
  }
  scene.add(frameMesh);

  /* -------------------------------------------------------------- *
   * Static module hardware
   * -------------------------------------------------------------- */

  const staticMesh = new THREE.InstancedMesh(
    buildModuleStaticGeometry(),
    aluminium,
    C.MODULE_COUNT
  );
  staticMesh.castShadow = true;
  staticMesh.receiveShadow = true;

  {
    const m = new THREE.Matrix4();
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < C.MODULE_COUNT; i++) {
      m.compose(modulePos[i], faceQuat, one);
      staticMesh.setMatrixAt(i, m);
    }
    staticMesh.instanceMatrix.needsUpdate = true;
  }
  scene.add(staticMesh);

  /* -------------------------------------------------------------- *
   * Blades
   * -------------------------------------------------------------- */

  const layout = buildBladeLayout();
  const bladeCount = C.MODULE_COUNT * MODULE_BLADE_COUNT;

  const bladeMesh = new THREE.InstancedMesh(buildBladeGeometry(), aluminium, bladeCount);
  bladeMesh.castShadow = true;
  bladeMesh.receiveShadow = true;
  bladeMesh.frustumCulled = false; // one bounding volume spans the whole field

  // Flat, allocation-free caches of everything that never changes.
  const basePos = new Float32Array(bladeCount * 3);
  const baseQuat = new Float32Array(bladeCount * 4);
  const baseScale = new Float32Array(bladeCount * 3);
  const hingeSign = new Int8Array(bladeCount);

  {
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();

    for (let mIdx = 0; mIdx < C.MODULE_COUNT; mIdx++) {
      const origin = modulePos[mIdx];
      for (let b = 0; b < MODULE_BLADE_COUNT; b++) {
        const entry = layout[b];
        const i = mIdx * MODULE_BLADE_COUNT + b;

        worldPos.copy(entry.origin).applyQuaternion(faceQuat).add(origin);
        worldQuat.copy(faceQuat).multiply(entry.quat);

        basePos[i * 3] = worldPos.x;
        basePos[i * 3 + 1] = worldPos.y;
        basePos[i * 3 + 2] = worldPos.z;

        baseQuat[i * 4] = worldQuat.x;
        baseQuat[i * 4 + 1] = worldQuat.y;
        baseQuat[i * 4 + 2] = worldQuat.z;
        baseQuat[i * 4 + 3] = worldQuat.w;

        baseScale[i * 3] = entry.scale.x;
        baseScale[i * 3 + 1] = entry.scale.y;
        baseScale[i * 3 + 2] = entry.scale.z;

        hingeSign[i] = entry.hingeSign;
      }
    }
  }

  scene.add(bladeMesh);

  /* -------------------------------------------------------------- *
   * Per-frame blade update
   * -------------------------------------------------------------- */

  const openAngle = C.BLADE_OPEN_ANGLE_DEG * DEG;
  /** Angle last written to the buffer, per module. Starts deliberately invalid. */
  const writtenState = new Float32Array(C.MODULE_COUNT).fill(-1);

  const tmpPos = new THREE.Vector3();
  const tmpScale = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpOrient = new THREE.Quaternion();
  const hingePos = new THREE.Quaternion();
  const hingeNeg = new THREE.Quaternion();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const tmpMatrix = new THREE.Matrix4();

  const attr = bladeMesh.instanceMatrix;

  /**
   * @param {Float32Array} states One value per module, 0 = closed, 1 = open.
   * @returns {number} How many modules were rewritten (for the stats readout).
   */
  function updateBlades(states) {
    let touched = 0;
    let lowBlade = Infinity;
    let highBlade = -Infinity;

    for (let m = 0; m < C.MODULE_COUNT; m++) {
      const state = states[m];
      if (Math.abs(state - writtenState[m]) < 1e-4) continue;
      writtenState[m] = state;
      touched++;

      const phi = state * openAngle;
      hingePos.setFromAxisAngle(xAxis, phi);
      hingeNeg.setFromAxisAngle(xAxis, -phi);

      const start = m * MODULE_BLADE_COUNT;
      const end = start + MODULE_BLADE_COUNT;
      if (start < lowBlade) lowBlade = start;
      if (end > highBlade) highBlade = end;

      for (let i = start; i < end; i++) {
        tmpOrient.set(
          baseQuat[i * 4],
          baseQuat[i * 4 + 1],
          baseQuat[i * 4 + 2],
          baseQuat[i * 4 + 3]
        );
        tmpQuat.multiplyQuaternions(tmpOrient, hingeSign[i] > 0 ? hingePos : hingeNeg);

        tmpPos.set(basePos[i * 3], basePos[i * 3 + 1], basePos[i * 3 + 2]);
        tmpScale.set(baseScale[i * 3], baseScale[i * 3 + 1], baseScale[i * 3 + 2]);

        tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
        tmpMatrix.toArray(attr.array, i * 16);
      }
    }

    if (touched > 0) {
      markRange(attr, lowBlade * 16, (highBlade - lowBlade) * 16);
      attr.needsUpdate = true;
    }
    return touched;
  }

  // Draw something sensible before the first sun update lands.
  updateBlades(new Float32Array(C.MODULE_COUNT).fill(1));

  return {
    updateBlades,
    moduleU,
    moduleV,
    modulePos,
    bladeCount,
    fieldCenter,
    fieldWidth,
    fieldHeight,
    faceQuat,
    facadeNormal: new THREE.Vector3(0, 0, 1).applyQuaternion(faceQuat).normalize(),
    meshes: { bladeMesh, staticMesh, frameMesh },
  };
}

/**
 * Upload only the touched span of an instance matrix buffer.
 * three renamed this API in r159; support both spellings.
 */
function markRange(attribute, offset, count) {
  if (typeof attribute.clearUpdateRanges === 'function') {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(offset, count);
  } else if (attribute.updateRange) {
    attribute.updateRange.offset = offset;
    attribute.updateRange.count = count;
  }
}
