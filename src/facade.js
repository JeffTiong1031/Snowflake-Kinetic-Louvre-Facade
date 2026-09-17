/**
 * The module field on one tower face: secondary support frame, the 8x20 grid of
 * snowflake modules, and their louvre slats -- with their linkage, the only
 * parts that move.
 *
 * InstancedMeshes, all told:
 *   - secondary frame verticals (GRID_COLS instances, static)
 *   - module frame, hub through brackets, aluminium and PV (MODULE_COUNT each)
 *   - slats, one mesh per chevron row (MODULE_COUNT * 12 instances each)
 *   - the lug on each slat, and the link to it (MODULE_COUNT * 48 instances each)
 *   - the carriage behind each gap (MODULE_COUNT * 6 instances)
 *
 * The moving parts of one module occupy a contiguous instance block in each of
 * their meshes, so a module whose state did not change this frame is skipped
 * wholesale, and only the touched span of each matrix buffer is re-uploaded.
 */

import * as THREE from 'three';
import * as C from './constants.js';
import { FACES, MODULE_FACE, faceToWorld, faceQuaternion } from './tower.js';
import {
  buildModuleStaticGeometry,
  buildSlatGeometries,
  buildBladeLayout,
  buildLinkGeometry,
  buildLugGeometry,
  buildCarriageGeometry,
  sliderShift,
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
  for (let row = 0; row < C.GRID_ROWS; row++) {
    for (let col = 0; col < C.GRID_COLS; col++) {
      const localX = (col - (C.GRID_COLS - 1) / 2) * pitchX;
      const y = baseY + row * pitchY;
      modulePos.push(faceToWorld(face, localX, y, standoff));
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

  const photovoltaic = new THREE.MeshStandardMaterial({
    color: C.PV_COLOR,
    metalness: C.PV_METALNESS,
    roughness: C.PV_ROUGHNESS,
    envMapIntensity: 0.9,
  });

  const hardware = buildModuleStaticGeometry();

  const staticMesh = new THREE.InstancedMesh(hardware.aluminium, aluminium, C.MODULE_COUNT);
  const pvMesh = new THREE.InstancedMesh(hardware.pv, photovoltaic, C.MODULE_COUNT);

  {
    const m = new THREE.Matrix4();
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < C.MODULE_COUNT; i++) {
      m.compose(modulePos[i], faceQuat, one);
      staticMesh.setMatrixAt(i, m);
      pvMesh.setMatrixAt(i, m);
    }
  }

  for (const mesh of [staticMesh, pvMesh]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }

  /* -------------------------------------------------------------- *
   * Slats, the link to each, and the carriage behind each gap
   * -------------------------------------------------------------- */

  const layout = buildBladeLayout();
  const bladeCount = C.MODULE_COUNT * MODULE_BLADE_COUNT;
  const rowCount = C.SLAT_WIDTHS.length;
  /** Slats of one row in one module: a chevron's two halves in each gap. */
  const perRow = MODULE_BLADE_COUNT / rowCount;
  const gapsPerModule = C.ARM_COUNT;

  // One mesh per chevron row -- the rows differ in shape, not just size.
  const bladeMeshes = buildSlatGeometries().map(
    (geo) => new THREE.InstancedMesh(geo, aluminium, C.MODULE_COUNT * perRow)
  );
  const linkMesh = new THREE.InstancedMesh(buildLinkGeometry(), aluminium, bladeCount);
  const lugMesh = new THREE.InstancedMesh(buildLugGeometry(), aluminium, bladeCount);
  const carriageMesh = new THREE.InstancedMesh(
    buildCarriageGeometry(),
    aluminium,
    C.MODULE_COUNT * gapsPerModule
  );
  for (const mesh of [...bladeMeshes, lugMesh, linkMesh, carriageMesh]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // one bounding volume spans the whole field
    scene.add(mesh);
  }

  /** Per layout entry: its row mesh, its slot in the module's block there, and its motion. */
  const rowOf = new Uint8Array(MODULE_BLADE_COUNT);
  const slotOf = new Uint16Array(MODULE_BLADE_COUNT);
  const gapOf = new Uint8Array(MODULE_BLADE_COUNT);
  const hingeSign = new Int8Array(MODULE_BLADE_COUNT);
  const grip = new Float32Array(MODULE_BLADE_COUNT * 3);
  const lug = new Float32Array(MODULE_BLADE_COUNT * 3);
  {
    const next = new Array(rowCount).fill(0);
    layout.forEach((entry, b) => {
      rowOf[b] = entry.row;
      slotOf[b] = next[entry.row]++;
      gapOf[b] = entry.gap;
      hingeSign[b] = entry.hingeSign;
      grip[b * 3] = entry.grip.x;
      grip[b * 3 + 1] = entry.grip.y;
      grip[b * 3 + 2] = entry.grip.z;
      lug[b * 3] = entry.lug.x;
      lug[b * 3 + 1] = entry.lug.y;
      lug[b * 3 + 2] = entry.lug.z;
    });
  }

  /** Per gap: its bisector in world space, and the carriage's world orientation. */
  const bisectorWorld = [];
  const carriageQuat = [];
  for (let g = 0; g < gapsPerModule; g++) {
    const bisector = layout.find((e) => e.gap === g).bisector;
    bisectorWorld.push(bisector.clone().applyQuaternion(faceQuat));
    carriageQuat.push(
      faceQuat
        .clone()
        .multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), bisector))
    );
  }

  // Flat, allocation-free caches of everything that never changes.
  const basePos = new Float32Array(bladeCount * 3);
  const baseQuat = new Float32Array(bladeCount * 4);
  const sliderPos = new Float32Array(bladeCount * 3);

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

        worldPos.copy(entry.slider).applyQuaternion(faceQuat).add(origin);
        sliderPos[i * 3] = worldPos.x;
        sliderPos[i * 3 + 1] = worldPos.y;
        sliderPos[i * 3 + 2] = worldPos.z;
      }
    }
  }

  /* -------------------------------------------------------------- *
   * Per-frame update
   * -------------------------------------------------------------- */

  const closedAngle = C.BLADE_CLOSED_ANGLE_DEG * DEG;
  const openAngle = C.BLADE_OPEN_ANGLE_DEG * DEG;
  const travel = openAngle - closedAngle;
  /** State last written to the buffers, per gap of each module. Starts deliberately invalid. */
  const writtenState = new Float32Array(C.MODULE_COUNT * gapsPerModule).fill(-1);

  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpOrient = new THREE.Quaternion();
  /** Per gap of the module being written: its slats' turn each way, and its carriage's slide. */
  const turnPos = Array.from({ length: gapsPerModule }, () => new THREE.Quaternion());
  const turnNeg = Array.from({ length: gapsPerModule }, () => new THREE.Quaternion());
  const shift = new Float32Array(gapsPerModule);
  const xAxis = new THREE.Vector3(1, 0, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const tmpMatrix = new THREE.Matrix4();
  const gripPos = new THREE.Vector3();
  const lugPos = new THREE.Vector3();
  const slidePos = new THREE.Vector3();
  const linkDir = new THREE.Vector3();
  const linkMid = new THREE.Vector3();
  const linkQuat = new THREE.Quaternion();
  const linkScale = new THREE.Vector3(1, 1, 1);

  const bladeAttrs = bladeMeshes.map((mesh) => mesh.instanceMatrix);
  const linkAttr = linkMesh.instanceMatrix;
  const lugAttr = lugMesh.instanceMatrix;
  const carriageAttr = carriageMesh.instanceMatrix;

  /**
   * @param {Float32Array} states One value per gap of each module, module by
   *   module (MODULE_COUNT * ARM_COUNT): 0 = closed, 1 = open. Each gap has its
   *   own carriage, so each gap's slats can stand at their own angle.
   * @returns {number} How many modules were rewritten (for the stats readout).
   */
  function updateBlades(states) {
    let touched = 0;
    let lowModule = Infinity;
    let highModule = -Infinity;

    for (let m = 0; m < C.MODULE_COUNT; m++) {
      const first = m * gapsPerModule;
      let changed = false;
      for (let g = 0; g < gapsPerModule; g++) {
        if (Math.abs(states[first + g] - writtenState[first + g]) >= 1e-4) {
          changed = true;
          break;
        }
      }
      if (!changed) continue;
      touched++;
      if (m < lowModule) lowModule = m;
      if (m > highModule) highModule = m;

      // Every slat of a gap swings in by that gap's angle about its own hinge;
      // the gap's carriage slides out by the matching amount.
      for (let g = 0; g < gapsPerModule; g++) {
        const state = states[first + g];
        writtenState[first + g] = state;
        const phi = closedAngle + state * travel;
        turnPos[g].setFromAxisAngle(xAxis, phi);
        turnNeg[g].setFromAxisAngle(xAxis, -phi);
        shift[g] = sliderShift(phi);
      }

      const start = m * MODULE_BLADE_COUNT;
      for (let b = 0; b < MODULE_BLADE_COUNT; b++) {
        const i = start + b;
        tmpOrient.set(
          baseQuat[i * 4],
          baseQuat[i * 4 + 1],
          baseQuat[i * 4 + 2],
          baseQuat[i * 4 + 3]
        );
        const g = gapOf[b];
        tmpQuat.multiplyQuaternions(tmpOrient, hingeSign[b] > 0 ? turnPos[g] : turnNeg[g]);
        tmpPos.set(basePos[i * 3], basePos[i * 3 + 1], basePos[i * 3 + 2]);

        tmpMatrix.compose(tmpPos, tmpQuat, one);
        tmpMatrix.toArray(bladeAttrs[rowOf[b]].array, (m * perRow + slotOf[b]) * 16);

        // The lug is rigid with its slat.
        lugPos.set(lug[b * 3], lug[b * 3 + 1], lug[b * 3 + 2]).applyQuaternion(tmpQuat).add(tmpPos);
        tmpMatrix.compose(lugPos, tmpQuat, one);
        tmpMatrix.toArray(lugAttr.array, i * 16);

        // The link: from the lug's tip to its slider on the carriage.
        gripPos.set(grip[b * 3], grip[b * 3 + 1], grip[b * 3 + 2]).applyQuaternion(tmpQuat).add(tmpPos);
        slidePos
          .set(sliderPos[i * 3], sliderPos[i * 3 + 1], sliderPos[i * 3 + 2])
          .addScaledVector(bisectorWorld[g], shift[g]);
        linkDir.subVectors(gripPos, slidePos);
        const length = linkDir.length();
        linkMid.addVectors(gripPos, slidePos).multiplyScalar(0.5);
        linkQuat.setFromUnitVectors(xAxis, linkDir.divideScalar(length));
        linkScale.x = length;
        tmpMatrix.compose(linkMid, linkQuat, linkScale);
        tmpMatrix.toArray(linkAttr.array, i * 16);
      }

      for (let g = 0; g < gapsPerModule; g++) {
        tmpPos.copy(modulePos[m]).addScaledVector(bisectorWorld[g], shift[g]);
        tmpMatrix.compose(tmpPos, carriageQuat[g], one);
        tmpMatrix.toArray(carriageAttr.array, (m * gapsPerModule + g) * 16);
      }
    }

    if (touched > 0) {
      const span = highModule - lowModule + 1;
      for (const attr of bladeAttrs) {
        markRange(attr, lowModule * perRow * 16, span * perRow * 16);
        attr.needsUpdate = true;
      }
      markRange(linkAttr, lowModule * MODULE_BLADE_COUNT * 16, span * MODULE_BLADE_COUNT * 16);
      markRange(lugAttr, lowModule * MODULE_BLADE_COUNT * 16, span * MODULE_BLADE_COUNT * 16);
      lugAttr.needsUpdate = true;
      markRange(carriageAttr, lowModule * gapsPerModule * 16, span * gapsPerModule * 16);
      linkAttr.needsUpdate = true;
      carriageAttr.needsUpdate = true;
    }
    return touched;
  }

  // Draw something sensible before the first sun update lands.
  updateBlades(new Float32Array(C.MODULE_COUNT * gapsPerModule).fill(1));

  return {
    updateBlades,
    modulePos,
    bladeCount,
    fieldCenter,
    fieldWidth,
    fieldHeight,
    faceQuat,
    facadeNormal: new THREE.Vector3(0, 0, 1).applyQuaternion(faceQuat).normalize(),
    meshes: { bladeMeshes, lugMesh, linkMesh, carriageMesh, staticMesh, pvMesh, frameMesh },
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
