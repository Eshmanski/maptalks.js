import { reshader } from '@maptalks/gl';
import { mat4 } from '@maptalks/gl';
import Painter from './Painter';
import { piecewiseConstant, isFunctionDefinition } from '@maptalks/function-type';
import { setUniformFromSymbol, createColorSetter, isNumber, toUint8ColorInGlobalVar } from '../Util';
import { prepareFnTypeData } from './util/fn_type_util';
import { interpolated } from '@maptalks/function-type';
import Color from 'color';
import { PACK_TEX_SIZE } from '@maptalks/vector-packer';

const EMPTY_UV_ORIGIN = [0, 0];
const SCALE = [1, 1, 1];
const DEFAULT_POLYGON_FILL = [1, 1, 1, 1];
const EMPTY_UV_OFFSET = [0, 0];

const EMPTY_ARRAY = [];

//一个三维mesh绘制的通用painter，负责mesh的create, add 和 delete, 负责fn-type的更新
class MeshPainter extends Painter {

    supportRenderMode(mode) {
        if (this.isAnimating()) {
            return mode === 'fxaa' || mode === 'fxaaAfterTaa';
        } else {
            return mode === 'taa' || mode === 'fxaa';
        }
    }

    isTerrainSkin() {
        return false;
    }

    isTerrainVector() {
        return this.layer.options.awareOfTerrain;
    }

    isAnimating() {
        return false;
    }

    createMesh(geo, transform, { tilePoint, tileZoom }) {
        if (!this.material) {
            //还没有初始化
            this.setToRedraw();
            return null;
        }
        const { geometry, symbolIndex } = geo;
        const mesh = new reshader.Mesh(geometry, this.material);
        if (this.sceneConfig.animation) {
            SCALE[2] = 0.01;
            const mat = [];
            mat4.fromScaling(mat, SCALE);
            mat4.multiply(mat, transform, mat);
            transform = mat;
        }
        const symbolDef = this.getSymbolDef(symbolIndex);
        const fnTypeConfig = this.getFnTypeConfig(symbolIndex);
        prepareFnTypeData(geometry, symbolDef, fnTypeConfig);
        const shader = this.getShader();
        const defines = shader.getGeometryDefines ? shader.getGeometryDefines(geometry) : {};
        const symbol = this.getSymbol(symbolIndex);
        const colorSetter = createColorSetter(this.colorCache);
        if (geometry.data.aExtrude) {
            defines['IS_LINE_EXTRUSION'] = 1;
            const { tileResolution, tileRatio } = geometry.properties;
            const map = this.getMap();
            Object.defineProperty(mesh.uniforms, 'linePixelScale', {
                enumerable: true,
                get: function () {
                    return tileRatio * map.getResolution() / tileResolution;
                }
            });
            setUniformFromSymbol(mesh.uniforms, 'lineWidth', symbol, 'lineWidth', 4);
            setUniformFromSymbol(mesh.uniforms, 'lineOpacity', symbol, 'lineOpacity', 1);
            setUniformFromSymbol(mesh.uniforms, 'lineColor', symbol, 'lineColor', '#fff', colorSetter);
            Object.defineProperty(mesh.uniforms, 'lineHeight', {
                enumerable: true,
                get: () => {
                    const alt = this.dataConfig['defaultAltitude'] * (this.dataConfig['altitudeScale'] || 1);
                    return isNumber(alt) ? alt : 0;
                }
            });
        } else {
            setUniformFromSymbol(mesh.uniforms, 'polygonFill', symbol, 'polygonFill', DEFAULT_POLYGON_FILL, colorSetter);
            setUniformFromSymbol(mesh.uniforms, 'polygonOpacity', symbol, 'polygonOpacity', 1);
            const vertexColorTypes = [];
            Object.defineProperty(mesh.uniforms, 'vertexColorsOfType', {
                enumerable: true,
                get: () => {
                    const bottomColor = colorSetter(symbol['bottomPolygonFill'] || DEFAULT_POLYGON_FILL);
                    const topColor = colorSetter(symbol['topPolygonFill'] || DEFAULT_POLYGON_FILL);
                    vertexColorTypes[0] = bottomColor[0];
                    vertexColorTypes[1] = bottomColor[1];
                    vertexColorTypes[2] = bottomColor[2];
                    vertexColorTypes[3] = bottomColor[3];
                    vertexColorTypes[4] = topColor[0];
                    vertexColorTypes[5] = topColor[1];
                    vertexColorTypes[6] = topColor[2];
                    vertexColorTypes[7] = topColor[3];
                    const vertexColors = mesh.geometry.properties.vertexColors;
                    if (vertexColors) {
                        let index = 8;
                        vertexColorTypes.length = 8 + vertexColors.length;
                        for (let i = 0; i < vertexColors.length; i++) {
                            vertexColorTypes[index++] = vertexColors[i][0];
                            vertexColorTypes[index++] = vertexColors[i][1];
                            vertexColorTypes[index++] = vertexColors[i][2];
                            vertexColorTypes[index++] = vertexColors[i][3];
                        }
                    }
                    return vertexColorTypes;
                }
            });
        }
        if (geometry.data.aColor) {
            defines['HAS_COLOR'] = 1;
        }
        if (geometry.data.aOpacity) {
            defines['HAS_OPACITY'] = 1;
        }
        if (geometry.data.aLineWidth) {
            defines['HAS_LINE_WIDTH'] = 1;
        }
        if (geometry.data.aLineHeight) {
            defines['HAS_LINE_HEIGHT'] = 1;
        }
        if (geometry.data.aTerrainAltitude) {
            defines['HAS_TERRAIN_ALTITUDE'] = 1;
        }
        if (geometry.data.aVertexColorType) {
            const vertexColors = mesh.geometry.properties.vertexColors;
            let vertexTypesCount = 2;
            if (vertexColors) {
                vertexTypesCount += vertexColors.length;
            }
            defines['VERTEX_TYPES_COUNT'] = vertexTypesCount;
        }
        if (geometry.data.aOpacity) {
            const aOpacity = geometry.data.aOpacity;
            for (let i = 0; i < aOpacity.length; i++) {
                if (aOpacity[i] < 255) {
                    geometry.properties.hasAlpha = true;
                    break;
                }
            }
        }
        geometry.generateBuffers(this.regl);
        mesh.setDefines(defines);
        mesh.setPositionMatrix(this.getAltitudeOffsetMatrix());
        mesh.setLocalTransform(transform);

        //没有高度或level >= 3的瓦片mesh不产生阴影
        if (geometry.properties.maxAltitude <= 0 || mesh.properties.level >= 3) {
            mesh.castShadow = false;
        }
        mesh.setUniform('maxAltitude', mesh.geometry.properties.maxAltitude);

        const map = this.getMap();
        const glRes = map.getGLRes();
        const sr = this.layer.getSpatialReference && this.layer.getSpatialReference();
        const layerRes = sr ? sr.getResolution(tileZoom) : map.getResolution(tileZoom);
        const glScale = layerRes / glRes;
        // vector-packer/PACK_TEX_SIZE
        // const uvScale = this.material.get('uvScale') || [1, 1];
        // mesh.setUniform('uvOrigin', [tilePoint[0] * glScale / (PACK_TEX_SIZE * uvScale[0]), tilePoint[1] * glScale / (PACK_TEX_SIZE * uvScale[0])]);
        Object.defineProperty(mesh.uniforms, 'uvOrigin', {
            enumerable: true,
            get: () => {
                if (this.dataConfig.side) {
                    // 侧面的纹理不会根据瓦片左上角坐标偏移
                    // 只有顶面的坐标是需要根据瓦片左上角坐标来整体偏移的
                    return EMPTY_UV_ORIGIN;
                }
                if (this.dataConfig.topUVMode === 1) {
                    // 如果顶面纹理是ombb，不需要偏移
                    return EMPTY_UV_ORIGIN;
                }
                const symbol = this.getSymbol(symbolIndex);
                const material = symbol.material;
                const uvScale = material && material.uvScale || [1, 1];
                const dataUVScale = this.dataConfig.dataUVScale || [1, 1];
                // 每个瓦片左上角的坐标值
                const xmin = uvScale[0] * tilePoint[0] * glScale;
                const ymax = uvScale[1] * tilePoint[1] * glScale;
                // 纹理的高宽
                const texWidth = PACK_TEX_SIZE * dataUVScale[0];
                const texHeight = PACK_TEX_SIZE * dataUVScale[1];
                return [xmin / texWidth, ymax / texHeight];
            }
        });
        Object.defineProperty(mesh.uniforms, 'uvOffset', {
            enumerable: true,
            get: () => {
                const uvOffsetAnim = this.getUVOffsetAnim();
                const offset = this.getUVOffset(uvOffsetAnim);
                if (this.material && this.material.get('noiseTexture')) {
                    offset[0] *= -1;
                    // offset[1] *= -1;
                }
                return offset;
            }
        });
        Object.defineProperty(mesh.uniforms, 'hasAlpha', {
            enumerable: true,
            get: () => {
                const symbol = this.getSymbol(symbolIndex);
                return geometry.properties.hasAlpha || symbol['polygonOpacity'] < 1 ||
                    symbol['lineOpacity'] < 1 ||
                    mesh.material && (mesh.material.uniforms.baseColorTexture ||
                    mesh.material.uniforms.emissiveTexture);
            }
        });
        const renderer = this.layer.getRenderer();
        const maxZoom = this.layer.getMap().getMaxNativeZoom();
        Object.defineProperty(mesh.uniforms, 'stencilRef', {
            enumerable: true,
            get: () => {
                if (renderer.isForeground(mesh)) {
                    return 0;
                }
                return maxZoom - mesh.properties.tile.z;
            }
        });
        mesh.properties.symbolIndex = symbolIndex;
        return mesh;
    }

    callShader(uniforms, context) {
        const cullFace = this.sceneConfig.cullFace;
        this.sceneConfig.cullFace = 'front';
        this.callBackgroundTileShader(uniforms, context);
        if (cullFace) {
            this.sceneConfig.cullFace = cullFace;
        } else {
            delete this.sceneConfig.cullFace;
        }
        super.callShader(uniforms, context);
    }

    getShadowMeshes() {
        if (!this.isVisible()) {
            return EMPTY_ARRAY;
        }
        this.shadowCount = this.scene.getMeshes().length;
        const meshes = this.scene.getMeshes().filter(m => m.properties.level === 0);
        for (let i = 0; i < meshes.length; i++) {
            const mesh = meshes[i];
            if (mesh.material !== this.material) {
                mesh.setMaterial(this.material);
            }
        }
        return meshes;
    }

    getUVOffsetAnim() {
        const symbol = this.getSymbols()[0];
        return symbol.material && symbol.material.uvOffsetAnim;
    }

    getUVOffset(uvOffsetAnim) {
        const symbol = this.getSymbols()[0];
        const uvOffset = symbol.material && symbol.material.uvOffset || EMPTY_UV_OFFSET;
        const timeStamp = this.layer.getRenderer().getFrameTimestamp();
        const offset = [uvOffset[0], uvOffset[1]];
        const hasNoise = !!symbol.material && symbol.material.noiseTexture;
        // 256是noiseTexture的高宽，乘以256才能保证动画首尾衔接，不会出现跳跃现象
        const speed = hasNoise ? 500000 : 1000
        const scale = hasNoise ? 256 : 1;
        if (uvOffsetAnim && uvOffsetAnim[0]) {
            offset[0] = (timeStamp * uvOffsetAnim[0] % speed) / speed * scale;
        }
        if (uvOffsetAnim && uvOffsetAnim[1]) {
            offset[1] = (timeStamp * uvOffsetAnim[1] % speed) / speed * scale;
        }
        return offset;
    }

    needPolygonOffset() {
        return this._needPolygonOffset;
        // return true;
    }

    startFrame(...args) {
        delete this._needPolygonOffset;
        return super.startFrame(...args);
    }

    addMesh(mesh, progress) {
        mesh.forEach(m => {
            this._prepareMesh(m, progress);
        });
        super.addMesh(...arguments);
    }

    _prepareMesh(mesh, progress) {
        if (progress !== null) {
            const mat = mesh.localTransform;
            if (progress === 0) {
                progress = 0.01;
            }
            SCALE[2] = progress;
            mat4.fromScaling(mat, SCALE);
            mat4.multiply(mat, mesh.properties.tileTransform, mat);
            mesh.setLocalTransform(mat);
        } else {
            mesh.setLocalTransform(mesh.properties.tileTransform);
        }
        if (mesh.material !== this.material) {
            mesh.setMaterial(this.material);
        }
        if (mesh.geometry.properties.maxAltitude <= 0) {
            this._needPolygonOffset = true;
        }
        //在这里更新ssr，以免symbol中ssr发生变化时，uniform值却没有发生变化, fuzhenn/maptalks-studio#462
        if (this.getSymbol(mesh.properties.symbolIndex).ssr) {
            mesh.ssr = 1;
        } else {
            mesh.ssr = 0;
        }
    }

    deleteMesh(meshes, keepGeometry) {
        if (!meshes) {
            return;
        }
        this.scene.removeMesh(meshes);
        if (Array.isArray(meshes)) {
            for (let i = 0; i < meshes.length; i++) {
                if (!keepGeometry) {
                    meshes[i].geometry.dispose();
                }
                meshes[i].dispose();
            }
        } else {
            if (!keepGeometry) {
                meshes.geometry.dispose();
            }
            meshes.dispose();
        }
    }

    updateDataConfig(dataConfig, old) {
        if (this.dataConfig.type === 'line-extrusion' && !dataConfig['altitudeProperty'] && !old['altitudeProperty']) {
            return false;
        }
        return true;
    }

    createFnTypeConfig(map, symbolDef) {
        const fillFn = piecewiseConstant(symbolDef['polygonFill'] || symbolDef['lineColor']);
        const opacityFn = interpolated(symbolDef['polygonOpacity'] || symbolDef['lineOpacity']);
        const aLineWidthFn = interpolated(symbolDef['lineWidth']);
        const u8 = new Uint8Array(1);
        const u16 = new Uint16Array(1);
        const fillName = symbolDef['polygonFill'] ? 'polygonFill' : symbolDef['lineColor'] ? 'lineColor' : 'polygonFill';
        const opacityName = symbolDef['polygonOpacity'] ? 'polygonOpacity' : symbolDef['lineOpacity'] ? 'lineOpacity' : 'polygonOpacity';
        return [
            {
                //geometry.data 中的属性数据
                attrName: 'aColor',
                type: Uint8Array,
                width: 4,
                //symbol中的function-type属性
                symbolName: fillName,
                define: 'HAS_COLOR',
                //
                evaluate: (properties, geometry) => {
                    let color = fillFn(map.getZoom(), properties);
                    if (isFunctionDefinition(color)) {
                        color = this.evaluateInFnTypeConfig(color, geometry, map, properties, true);
                    }
                    if (!Array.isArray(color)) {
                        color = this.colorCache[color] = this.colorCache[color] || Color(color).unitArray();
                    }
                    color = toUint8ColorInGlobalVar(color);
                    return color;
                }
            },
            {
                attrName: 'aOpacity',
                type: Uint8Array,
                width: 1,
                symbolName: opacityName,
                evaluate: (properties, geometry) => {
                    let polygonOpacity = opacityFn(map.getZoom(), properties);
                    if (isFunctionDefinition(polygonOpacity)) {
                        polygonOpacity = this.evaluateInFnTypeConfig(polygonOpacity, geometry, map, properties, false);
                    }
                    u8[0] = polygonOpacity * 255;
                    if (u8[0] < 255) {
                        geometry.properties.hasAlpha = true;
                    }
                    return u8[0];
                }
            },
            {
                attrName: 'aLineWidth',
                type: Uint8Array,
                width: 1,
                symbolName: 'lineWidth',
                define: 'HAS_LINE_WIDTH',
                evaluate: properties => {
                    const lineWidth = aLineWidthFn(map.getZoom(), properties);
                    //乘以2是为了解决 #190
                    u16[0] = Math.round(lineWidth * 2.0);
                    return u16[0];
                }
            }
        ];
    }

    getPolygonOffset() {
        return {
            enable: (context, props) => props.maxAltitude === 0,
            // enable: true,
            offset: super.getPolygonOffset()
        };
    }

    updateSymbol(symbol, all) {
        let refreshMaterial = false;
        if (symbol && symbol.material) {
            // 检查材质的更新是否需要更新整个style
            refreshMaterial = needRefreshMaterial(this.symbolDef[0].material || {}, symbol.material);
        }
        const refresh = super.updateSymbol(symbol, all);
        if (symbol && symbol.material) {
            this._updateMaterial(symbol.material);
        }
        return refreshMaterial || refresh;
    }

    _isNeedRefreshStyle(oldSymbolDef, newSymbolDef) {
        return hasTexture(oldSymbolDef) !== hasTexture(newSymbolDef);
    }

}

export default MeshPainter;


function hasTexture(symbolDef) {
    if (!symbolDef || !symbolDef.material) {
        return false;
    }
    for (const p in symbolDef.material) {
        if (p.indexOf('Texture') > 0 && symbolDef.material[p]) {
            return true;
        }
    }
    return false;
}


const MATERIAL_PROP_NEED_REBUILD_IN_VT = {
    'normalTexture': 1,
    'bumpTexture': 1
};

function needRefreshMaterial(oldSymbolDef, newSymbolDef) {
    for (const p in newSymbolDef) {
        // 指定的纹理从无到有，或从有到无时，需要刷新style
        if (MATERIAL_PROP_NEED_REBUILD_IN_VT[p] && (newSymbolDef[p] !== oldSymbolDef[p] && (!oldSymbolDef[p] || !newSymbolDef[p]))) {
            return true;
        }
    }
    return false;

}
