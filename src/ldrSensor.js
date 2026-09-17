/**
 * A light-dependent resistor (LDR), as the explanation shows it inside a tip
 * panel's frame: a ceramic disc with the zig-zag track of light-sensitive
 * cadmium sulphide across its face between two electrodes, and two leads out
 * of its back. Face toward +Z, centred on the origin, metres. The face is
 * drawn on a canvas at runtime -- no image files.
 */

import * as THREE from 'three';
import * as C from './constants.js';

let faceTexture = null;

function drawFace() {
  const size = 128;
  const r = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');

  g.fillStyle = '#e8dcc0'; // the ceramic
  g.fillRect(0, 0, size, size);

  g.save();
  g.beginPath();
  g.arc(r, r, r * 0.8, 0, Math.PI * 2);
  g.clip();

  // The two electrodes, down either side.
  const edge = r * 0.42;
  g.fillStyle = '#b9bdc2';
  g.fillRect(0, 0, edge, size);
  g.fillRect(size - edge, 0, edge, size);

  // The track, zig-zagging from one to the other.
  const passes = 8;
  const pitch = (r * 1.44) / (passes - 1);
  let y = r - r * 0.72;
  g.strokeStyle = '#b3441e';
  g.lineWidth = 7;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(edge, y);
  for (let k = 0; k < passes; k++) {
    const x = k % 2 === 0 ? size - edge : edge;
    g.lineTo(x, y);
    if (k < passes - 1) {
      y += pitch;
      g.lineTo(x, y);
    }
  }
  g.stroke();
  g.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildLdrSensor() {
  faceTexture ??= drawFace();

  const r = (C.LDR_DIAMETER / 2) * C.MM;
  const t = C.LDR_THICKNESS * C.MM;
  const body = new THREE.MeshStandardMaterial({ color: 0xd9cba8, roughness: 0.7 });
  const face = new THREE.MeshStandardMaterial({ map: faceTexture, roughness: 0.55 });

  const disc = new THREE.CylinderGeometry(r, r, t, 32);
  disc.rotateX(Math.PI / 2); // axis Y -> Z, so the top cap faces out
  const group = new THREE.Group();
  group.add(new THREE.Mesh(disc, [body, face, body])); // side, top cap, bottom cap

  const metal = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.8, roughness: 0.35 });
  const leadLength = C.LDR_LEAD_LENGTH * C.MM;
  for (const side of [-1, 1]) {
    const lead = new THREE.CylinderGeometry(0.00035, 0.00035, leadLength, 6);
    lead.rotateX(Math.PI / 2);
    lead.translate(side * r * 0.45, 0, -(t / 2 + leadLength / 2));
    group.add(new THREE.Mesh(lead, metal));
  }
  return group;
}
