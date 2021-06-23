import * as maptalks from 'maptalks';
import { isFunctionDefinition } from '@maptalks/function-type';
import Color from 'color';

/**
 * Merges the properties of sources into destination object.
 * @param  {Object} dest   - object to extend
 * @param  {...Object} src - sources
 * @return {Object}
 */
export function extend(dest) { // (Object[, Object, ...]) ->
    for (let i = 1; i < arguments.length; i++) {
        const src = arguments[i];
        for (const k in src) {
            dest[k] = src[k];
        }
    }
    return dest;
}


export function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}

export function wrap(n, min, max) {
    if (n === max || n === min) {
        return n;
    }
    const d = max - min;
    const w = ((n - min) % d + d) % d + min;
    return w;
}

export function isNil(obj) {
    return obj === null || obj === undefined;
}

export function evaluate(prop, properties, zoom) {
    if (maptalks.Util.isFunction(prop)) {
        if (zoom !== undefined) {
            return prop(zoom, properties);
        } else {
            return prop(null, properties);
        }
    } else {
        return prop;
    }
}

export const TYPE_BYTES = {
    'int8': 1,
    'int16': 2,
    'int32': 4,
    'uint8': 1,
    'uint16': 2,
    'uint32': 4,
    'float': 4,
    'float32': 4
};

export function copyJSON(json) {
    return JSON.parse(JSON.stringify(json));
}

export function setUniformFromSymbol(uniforms, name, symbol, key, defaultValue, fn) {
    // if (symbol['_' + key]) {
    //     // a function type
    //     Object.defineProperty(uniforms, name, {
    //         enumerable: true,
    //         get: function () {
    //             return fn ? fn(symbol[key]) : symbol[key];
    //         }
    //     });
    // } else {
    //     uniforms[name] = fn ? fn(symbol[key]) : symbol[key];
    // }
    Object.defineProperty(uniforms, name, {
        enumerable: true,
        get: function () {
            const v = (isNil(symbol[key]) || isFunctionDefinition(symbol[key])) ? defaultValue : symbol[key];
            return fn ? fn(v) : v;
        }
    });
}

const ARR0 = [];
// 结果存储在一个全局临时数组中，
export function toUint8ColorInGlobalVar(color) {
    for (let i = 0; i < color.length; i++) {
        ARR0[i] = color[i];
        ARR0[i] *= 255;
    }
    if (color.length === 3) {
        ARR0[3] = 255;
    }
    return ARR0;
}

export function createColorSetter(cache, size = 4) {
    return _colorSetter.bind(this, cache, size);
}

function _colorSetter(cache, size, c) {
    if (Array.isArray(c)) {
        if (c.length === 3 && size === 4) {
            c.push(1);
        }
        return c;
    }
    if (cache && cache[c]) {
        return cache[c];
    }
    const color = Color(c).unitArray();
    if (color.length === 3 && size === 4) {
        color.push(1);
    }
    if (cache) cache[c] = color;
    return color;
}

export function fillArray(arr, value, start, end) {
    if (arr.fill) {
        arr.fill(value, start, end);
    } else {
        for (let i = start; i < end; i++) {
            arr[i] = value;
        }
    }
}

/**
 * Whether val is a number and not a NaN.
 * @param  {Object}  val - val
 * @return {Boolean}
 * @memberOf Util
 */
export function isNumber(val) {
    return (typeof val === 'number') && !isNaN(val);
}

export function isIconText(symbolDef) {
    return symbolDef && (symbolDef.markerFile || symbolDef.markerType) && symbolDef.textName !== undefined;
}
