/**
 * The louvre control's ray tracing, off the main thread, so moving the sun
 * never stalls a frame. Given the sun (module-local unit vector {x, y, z}),
 * answers with each gap's opening angle.
 */

import * as C from './constants.js';
import { gapOpenAngles } from './louvreControl.js';

self.onmessage = ({ data }) => {
  const angles = gapOpenAngles(data, new Float32Array(C.ARM_COUNT));
  self.postMessage(angles, [angles.buffer]);
};
