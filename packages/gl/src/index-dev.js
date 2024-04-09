import createREGL from '@maptalks/regl';
import * as reshader from '@maptalks/reshader.gl';

export {
    glMatrix,
    mat2, mat2d, mat3, mat4,
    quat, quat2,
    vec2, vec3, vec4,
} from 'gl-matrix';
export { createREGL, reshader };

export * from './index.js';

import transcoders from '../src/transcoders';
export { transcoders };


import * as maptalks from 'maptalks';
import chunk from '../build/worker.js';
maptalks.registerWorkerAdapter('@maptalks/terrain', chunk);
