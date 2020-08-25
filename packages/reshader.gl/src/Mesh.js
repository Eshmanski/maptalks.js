import { extend, isNil, isNumber, isFunction } from './common/Util.js';
import { vec4, mat4, vec3 } from 'gl-matrix';
import BoundingBox from './BoundingBox.js';

const tempMat4 = [];

let uuid = 0;
/**
 * Config:
 *  transparent, castShadow
 */
class Mesh {
    constructor(geometry, material, config = {}) {
        this.geometry = geometry;
        this.material = material;
        this.config = config;
        this.transparent = !!config.transparent;
        this.castShadow = isNil(config.castShadow) || config.castShadow;
        this.picking = !!config.picking;
        this.uniforms = {};
        this.localTransform = mat4.identity(new Array(16));
        this.positionMatrix = mat4.identity(new Array(16));
        this.properties = {};
        this._dirtyUniforms = true;
        Object.defineProperty(this, 'uuid', {
            value: uuid++
        });
        if (uuid > Number.MAX_VALUE - 10) {
            uuid = 0;
        }
    }

    setMaterial(material) {
        this.material = material;
        this._dirtyUniforms = true;
        this.dirtyDefines = true;
        return this;
    }

    setParent() {
        this.parent = parent;
        return this;
    }

    setLocalTransform(transform) {
        this.localTransform = transform;
        return this;
    }

    setPositionMatrix(matrix) {
        this.positionMatrix = matrix;
    }

    setUniform(k, v) {
        if (this.uniforms[k] === undefined) {
            this._dirtyUniforms = true;
        }
        this.uniforms[k] = v;
        return this;
    }

    getUniform(k) {
        return this.uniforms[k];
    }

    getDefines() {
        const defines = {};
        if (this.defines) {
            extend(defines, this.defines);
        }
        if (this.material && this.geometry) {
            this.material.appendDefines(defines, this.geometry);
        }
        return defines;
    }

    setDefines(defines) {
        this.defines = defines;
        this.dirtyDefines = true;
        return this;
    }

    _getDefinesKey() {
        this.dirtyDefines = false;
        return this._createDefinesKey(this.getDefines());
    }

    getCommandKey() {
        if (!this._commandKey || this.dirtyDefines || (this.material && this._materialKeys !== this.material.getUniformKeys())) {
            //TODO geometry的data变动也可能会改变commandKey，但鉴于geometry一般不会发生变化，暂时不管
            let dKey = this._getDefinesKey();
            const elementType = isNumber(this.getElements()) ? 'count' : 'elements';
            dKey += '_' + elementType;
            this._commandKey = dKey;
            if (this.material) {
                this._materialKeys = this.material.getUniformKeys();
            }
        }

        return this._commandKey;
    }

    // getUniforms(regl) {
    //     const uniforms = {
    //         'modelMatrix': this.localTransform
    //     };
    //     if (this.material) {
    //         const materialUniforms = this.material.getUniforms(regl);
    //         extend(uniforms, materialUniforms);
    //     }
    //     extend(uniforms, this.uniforms);
    //     return uniforms;
    // }

    getUniforms(regl) {
        if (this._dirtyUniforms || this.material && this.material.isDirty()) {
            this._realUniforms = {
            };
            if (this.material) {
                const materialUniforms = this.material.getUniforms(regl);
                for (const p in materialUniforms) {
                    if (materialUniforms.hasOwnProperty(p)) {
                        Object.defineProperty(this._realUniforms, p, {
                            enumerable: true,
                            configurable: true,
                            get: function () {
                                return materialUniforms && materialUniforms[p];
                            }
                        });
                    }
                }
            }
            const uniforms = this.uniforms;
            for (const p in this.uniforms) {
                if (this.uniforms.hasOwnProperty(p)) {
                    Object.defineProperty(this._realUniforms, p, {
                        enumerable: true,
                        configurable: true,
                        get: function () {
                            return uniforms && uniforms[p];
                        }
                    });
                }
            }
            this._dirtyUniforms = false;
        }
        this._realUniforms['modelMatrix'] = isFunction(this.localTransform) ? this.localTransform() : this.localTransform;
        this._realUniforms['positionMatrix'] = isFunction(this.positionMatrix) ? this.positionMatrix() : this.positionMatrix;
        return this._realUniforms;
    }


    getMaterial() {
        return this.material;
    }

    getElements() {
        return this.geometry.getElements();
    }

    _getREGLAttrData(regl, activeAttributes) {
        return this.geometry.getREGLData(regl, activeAttributes);
    }

    getREGLProps(regl, activeAttributes) {
        const props = this.getUniforms(regl);
        extend(props, this._getREGLAttrData(regl, activeAttributes));
        props.elements = this.geometry.getElements();
        props.count = this.geometry.getDrawCount();
        props.offset = this.geometry.getDrawOffset();
        // command primitive : triangle, triangle strip, etc
        props.primitive = this.geometry.getPrimitive();
        return props;
    }

    dispose() {
        delete this.geometry;
        delete this.material;
        this.uniforms = {};
        return this;
    }

    isValid() {
        return this.geometry && !this.geometry.isDisposed() && (!this.material || !this.material.isDisposed());
    }

    getBoundingBox() {
        if (!this._bbox) {
            this.updateBoundingBox();
        }
        mat4.multiply(tempMat4, this.localTransform, this.positionMatrix);
        //如果Mesh的localTransform * positionMatrix发生了变化，或者geometry的boundingBox发生变化，则需要更新bbox
        if (!this._currentTransform || !mat4.equals(tempMat4, this._currentTransform) || !this.geometry.boundingBox.equals(this._GeomtryBBoxVertex)) {
            this.updateBoundingBox();
        }
        return [this._bbox.min, this._bbox.max];
    }

    updateBoundingBox() {
        if (!this._bbox) {
            this._bbox = new BoundingBox();
        }
        const box = this.geometry.boundingBox;
        this._currentTransform = this._currentTransform || [];
        if (!this.localTransform[1] && !this.localTransform[2] && !this.localTransform[4] && !this.localTransform[6] && !this.localTransform[8] && !this.localTransform[9]) {
            const { min, max } = box;
            vec4.set(this._bbox.min, min[0], min[1], min[2], 1);
            vec4.set(this._bbox.max, max[0], max[1], max[2], 1);
            const matrix = mat4.multiply(this._currentTransform, this.localTransform, this.positionMatrix);
            vec4.transformMat4(this._bbox.min, this._bbox.min, matrix);
            vec4.transformMat4(this._bbox.max, this._bbox.max, matrix);
        } else {
            const boxVertex = box.vertex;
            const matrix = mat4.multiply(this._currentTransform, this.localTransform, this.positionMatrix);
            for (let i = 0; i < boxVertex.length; i++) {
                vec4.set(this._bbox.vertex[i], boxVertex[i][0], boxVertex[i][1], boxVertex[i][2], 1);
                vec4.transformMat4(this._bbox.vertex[i], this._bbox.vertex[i], matrix);
            }
            const xVertex = this._bbox.vertex.map(v => v[0]);
            const yVertex = this._bbox.vertex.map(v => v[1]);
            const zVertex = this._bbox.vertex.map(v => v[2]);
            const minX = Math.min(...xVertex), maxX = Math.max(...xVertex);
            const minY = Math.min(...yVertex), maxY = Math.max(...yVertex);
            const minZ = Math.min(...zVertex), maxZ = Math.max(...zVertex);
            vec3.set(this._bbox.min, minX, minY, minZ);
            vec3.set(this._bbox.max, maxX, maxY, maxZ);
        }
        this._GeomtryBBoxVertex = box.vertex.map(v => {
            return [v[0], v[1], v[2]];
        });
    }

    _createDefinesKey(defines) {
        const v = [];
        for (const p in defines) {
            v.push(p, defines[p]);
        }
        return v.join(',');
    }
}

Mesh.prototype.getWorldTransform = function () {
    const worldTransform = [];
    return function () {
        if (parent) {
            return mat4.multiply(worldTransform, parent.getWorldTransform(), this.localTransform);
        }
        return this.localTransform;
    };
}();

export default Mesh;
