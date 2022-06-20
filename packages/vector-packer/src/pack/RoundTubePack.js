import LinePack from './LinePack';
import { EXTRUDE_SCALE, LINE_DISTANCE_SCALE } from './LinePack';
import { vec3, vec4 } from 'gl-matrix';
import { extend } from '../style/Util';

export default class RoundTubePack extends LinePack {
    constructor(features, symbol, options) {
        symbol = extend({}, symbol);
        // fix lineJoin and lineCap
        symbol['lineJoin'] = 'miter';
        symbol['lineCap'] = 'butt';
        super(features, symbol, options);
        if (this.options.radialSegments % 2 === 1) {
            this.options.radialSegments--;
        }
    }

    getFormat() {
        const { lineWidthFn, lineColorFn, lineOpacityFn, linePatternAnimSpeedFn, linePatternGapFn } = this._fnTypes;
        const format = [
            ...this.getPositionFormat(),
            {
                type: Int8Array,
                size: 4,
                name: 'aTubeNormal'
            },
            {
                type: this.options.positionType || Uint16Array,
                width: 1,
                name: 'aLinesofar'
            }
        ];
        if (this.iconAtlas) {
            format.push(
                {
                    type: Int8Array,
                    width: 1,
                    name: 'aNormalDistance'
                }
            );
            const max = this.getIconAtlasMaxValue();
            format.push({
                type: max > 255 ? Uint16Array : Uint8Array,
                width: 4,
                name: 'aTexInfo'
            });
        }
        if (lineWidthFn) {
            format.push(
                {
                    type: Uint16Array,
                    width: 1,
                    name: 'aLineWidth'
                }
            );
        }
        if (lineColorFn) {
            format.push(
                {
                    type: Uint8Array,
                    width: 4,
                    name: 'aColor'
                }
            );
        }
        if (lineOpacityFn) {
            format.push(
                {
                    type: Uint8Array,
                    width: 1,
                    name: 'aOpacity'
                }
            );
        }
        if (linePatternAnimSpeedFn) {
            format.push({
                type: Int8Array,
                width: 1,
                name: 'aLinePatternAnimSpeed'
            });
        }
        if (linePatternGapFn) {
            format.push({
                type: Int8Array,
                width: 1,
                name: 'aLinePatternGap'
            });
        }

        return format;
    }

    addHalfVertex(currentVertex, extrudeX, extrudeY, round, up, dir, segment, normalDistance) {
        const { x, y, z } = currentVertex;
        // scale down so that we can store longer distances while sacrificing precision.
        const linesofar = this.scaledDistance * LINE_DISTANCE_SCALE;

        const segments = this.options.radialSegments / 2;

        // const factor = up ? 1 : -1;
        // TEMP_EXTRUDE.x = extrudeX * factor;
        // TEMP_EXTRUDE.y = extrudeY * factor;
        // const { x: dirx, y: diry } = TEMP_EXTRUDE._perp();
        // const dirz = normal.z;

        // const factor = 1;//up ? 1 : -1;
        // TEMP_EXTRUDE.x = normal.x * factor;
        // TEMP_EXTRUDE.y = normal.y * factor;
        // const { x: dirx, y: diry } = TEMP_EXTRUDE._perp()._mult(-1);

        // const dz = this.prevVertex ? z - this.prevVertex.z : 0;
        // *100 是因为zScale是把厘米转为glres point，所以要把米转为厘米
        // const altitudeToLocal = getAltitudeToLocal(this.options);
        // console.log(segment.dir);
        // console.log(dirx, diry, normal.z);
        const { x: dirx, y: diry, z: dirz } = segment.dir;
        // console.log(dirx, diry, dirz);
        // console.log(segment.dir.x, segment.dir.y, segment.dir.z);
        const radialOffsets = getRadialVertexes(1, segments, dirx, diry, dirz, extrudeX, extrudeY, up);

        if (this.prevVertex) {
            this.fillTubeElements(up);
        }

        this.fillData(this.data, x, y, z || 0, radialOffsets, up, linesofar, normalDistance);
    }

    fillTubeElements(up) {
        const segments = this.options.radialSegments / 2;
        const positionSize = this.needAltitudeAttribute() ? 2 : 3;
        const currentOffset = this.data.aPosition.length / positionSize;
        for (let i = 0; i < segments; i++) {
            // d-------b
            // |       |
            // c-------a
            const a = i + currentOffset;
            const c = i + currentOffset - segments * 2;
            let b, d;
            if (i === segments - 1 && up) {
                // 如果是up是最后一个点
                // b是该圆圈中的第一个点
                // d是上一个圆圈的第一个点
                // - segments * 2 + 1 就是用圆圈的最后一个点的序号找到圆圈第一个点的序号
                b = i + currentOffset - segments * 2 + 1;
                d = i + currentOffset - segments * 2 - segments * 2 + 1;
            } else {
                // b是圆圈上下一个点
                // d是上一个圆圈对应的下一个点
                // 如果up为false，且最后一个点，则b是up上第一个点，但序号仍然是 i + currentOffset + 1
                b = i + currentOffset + 1;
                d = i + currentOffset + 1 - segments * 2;
            }
            // 因为LinePack.addElements中会加入 ths.offset，所以这里要减去this.offset
            super.addElements(a - this.offset, b - this.offset, c - this.offset);
            super.addElements(c - this.offset, b - this.offset, d - this.offset);
        }
    }

    fillData(data, x, y, altitude, radialOffsets, up, linesofar, normalDistance) {
        const { lineWidthFn, lineColorFn, lineOpacityFn, linePatternAnimSpeedFn, linePatternGapFn } = this._fnTypes;
        const segments = radialOffsets.length;
        for (let i = 0; i < segments; i++) {
            this.fillPosition(data, x, y, altitude);
            vec4.scale(radialOffsets[i], radialOffsets[i], EXTRUDE_SCALE);
            data.aTubeNormal.push(...radialOffsets[i]);
            data.aLinesofar.push(linesofar);
            if (this.iconAtlas) {
                data.aNormalDistance.push(EXTRUDE_SCALE * normalDistance);
                data.aTexInfo.push(...this.feaTexInfo);
            }
            if (lineWidthFn) {
                // convert to centi-meter
                data.aLineWidth.push(Math.round(this.feaLineWidth * 100));
            }
            if (lineColorFn) {
                data.aColor.push(...this.feaColor);
            }
            if (lineOpacityFn) {
                data.aOpacity.push(this.feaOpacity);
            }
            if (linePatternAnimSpeedFn) {
                data.aLinePatternAnimSpeed.push((this.feaPatternAnimSpeed || 0) * 127);
            }
            if (linePatternGapFn) {
                data.aLinePatternGap.push((this.feaLinePatternGap || 0) * 10);
            }
        }
        this.maxPos = Math.max(this.maxPos, Math.abs(x) + 1, Math.abs(y) + 1);
    }
}

const Q = [];
const U = [];
const V = [];
// const P1 = [];
// const P2 = [];

const radialOffsets = {};

// 如何计算向量的垂直圆
// https://stackoverflow.com/questions/36760771/how-to-calculate-a-circle-perpendicular-to-a-vector
function getRadialVertexes(radius, segments, dirX, dirY, dirZ, normalX, normalY, up) {
    // vec3.set(P1, p1.x, p1.y, p1.z);
    // vec3.set(P2, p2.x, p2.y, p2.z);
    // // Q = P1→P2 moved to origin
    // vec3.sub(Q, P2, P1);

    vec3.set(Q, dirX, dirY, dirZ);
    vec3.set(U, normalX, normalY, 0);

    // The cross product of two vectors is perpendicular to both, so to find V:
    vec3.cross(V, Q, U);

    // normalize U and V:
    vec3.normalize(U, U);
    vec3.normalize(V, V);

    if (!radialOffsets[segments]) {
        radialOffsets[segments] = [];
    }
    const offsets = radialOffsets[segments];
    // const factor = 1;//up ? 1 : -1;
    for (var i = 0; i < segments; i++) {
        const θ = Math.PI * i / segments;  // theta
        const middle = 0;
        // 因为join处的radius不为1，但join变为圆管时，垂直radius仍然是1，否则无法对齐，只有水平的radius为joinRadius
        // r就是radius的比例，在垂直时为1，水平时为joinRadius
        // normalY是y方向的normal值，垂直方向为0，水平方向为1
        const normalY = (1 - Math.abs(θ - middle) / (Math.PI / 2));
        // const r = 1;//(1 - normalY) * (joinRadius - 1) + 1;
        // const dx = r * factor * radius * (Math.cos(θ) * U[0] + Math.sin(θ) * V[0]);
        // const dy = r * factor * radius * (Math.cos(θ) * U[1] + Math.sin(θ) * V[1]);
        // const dz = r * factor * radius * (Math.cos(θ) * U[2] + Math.sin(θ) * V[2]);

        // offsets[i] = offsets[i] || [];
        // vec4.set(offsets[i], dx, dy, dz, normalY * (up ? -1 : 1));

        addTubeNormalVertexs(U, V, offsets, radius, θ, normalY * (up ? -1 : 1));
    }
    return offsets;
}


export function addTubeNormalVertexs(U, V, offsets, radius, θ, up) {
    const dx = radius * (Math.cos(θ) * U[0] + Math.sin(θ) * V[0]);
    const dy = radius * (Math.cos(θ) * U[1] + Math.sin(θ) * V[1]);
    const dz = radius * (Math.cos(θ) * U[2] + Math.sin(θ) * V[2]);

    vec4.set(offsets, dx, dy, dz, up);
    return offsets;
}
