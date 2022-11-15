import { mat4 } from 'gl-matrix';
import { reshader } from '@maptalks/gl';
import vert from './glsl/insight.vert';
import frag from './glsl/insight.frag';
import { Util } from 'maptalks';
import AnalysisPass from './AnalysisPass';

const helperPos = [
    0, 0, 0,
    1, 0, 0
]
const helperIndices = [
    0, 1
];
const MAT = [];
const clearColor = [0, 0, 0, 1];
export default class InSightPass extends AnalysisPass {

    _init() {
        this._insightShader = new reshader.MeshShader({
            vert,
            frag,
            uniforms: [
                {
                    name: 'projViewModelMatrix',
                    type: 'function',
                    fn: (context, props) => {
                        return mat4.multiply([], props['projViewMatrix'], props['modelMatrix']);
                    }
                }
            ],
            extraCommandProps: {
                viewport: this._viewport
            }
        });
        this._fbo = this.renderer.regl.framebuffer({
            color: this.renderer.regl.texture({
                width: 1,
                height: 1,
                wrap: 'clamp',
                mag : 'linear',
                min : 'linear'
            }),
            depth: true
        });
        const helperGeometry = new reshader.Geometry({
            POSITION: helperPos
        },
        helperIndices,
        0,
        {
            //绘制类型，例如 triangle strip, line等，根据gltf中primitive的mode来判断，默认是triangles
            primitive : 'lines',
            positionAttribute: 'POSITION'
        });
        this._helperGeometry = helperGeometry;
        this._helperMesh = new reshader.Mesh(helperGeometry, new reshader.Material({ lineColor: [0.8, 0.8, 0.1]}));
        this._scene = new reshader.Scene();
    }

    render(meshes, config) {
        const { eyePos, lookPoint, horizontalAngle, verticalAngle } = config;
        if (!this._validViewport(horizontalAngle, verticalAngle) || !eyePos || !lookPoint) {
            return this._fbo;
        }
        if (!this._depthShader) {
            this._createDepthShader(horizontalAngle, verticalAngle);
        }
        this._resize(horizontalAngle, verticalAngle);
        this.renderer.clear({
            color : clearColor,
            depth : 1,
            framebuffer : this._fbo
        });
        const modelMatrix = mat4.identity(MAT);
        this._helperMesh.localTransform = modelMatrix;
        this._scene.setMeshes(meshes);
        const { projViewMatrixFromViewpoint, far } = this._createProjViewMatrix(eyePos, lookPoint, 45, 45);
        this._renderDepth(this._scene, projViewMatrixFromViewpoint, far);
        this._updateHelperGeometry(eyePos, lookPoint);
        this._scene.setMeshes(this._helperMesh);
        this._renderInsightMap(this._scene, projViewMatrixFromViewpoint, config.projViewMatrix);
        return this._fbo;
    }

    _updateHelperGeometry(eyePos, lookPoint) {
        if(this._helperGeometry) {
            this._helperGeometry.dispose();
            this._helperMesh.dispose();
            helperPos[0] = eyePos[0];
            helperPos[1] = eyePos[1];
            helperPos[2] = eyePos[2];
            helperPos[3] = lookPoint[0];
            helperPos[4] = lookPoint[1];
            helperPos[5] = lookPoint[2];
            this._helperGeometry = new reshader.Geometry({
                POSITION: helperPos
            },
            helperIndices,
            0,
            {
                //绘制类型，例如 triangle strip, line等，根据gltf中primitive的mode来判断，默认是triangles
                primitive : 'lines',
                positionAttribute: 'POSITION'
            });
            this._helperMesh = new reshader.Mesh(this._helperGeometry, new reshader.Material({ lineColor: [0.8, 0.8, 0.1]}));
        }
    }

    //渲染insight贴图
    _renderInsightMap(scene, projViewMatrixFromViewpoint, projViewMatrix) {
        const uniforms = {
            insight_projViewMatrixFromViewpoint: projViewMatrixFromViewpoint,
            projViewMatrix,
            depthMap: this._depthFBO
        };
        this.renderer.render(
            this._insightShader,
            uniforms,
            scene,
            this._fbo
        );
    }

    //根据视点位置，方向，垂直角，水平角构建矩阵
    _createProjViewMatrix(eyePos, lookPoint, verticalAngle, horizontalAngle) {
        const aspect =  verticalAngle / horizontalAngle;
        const distance = Math.sqrt(Math.pow(eyePos[0] - lookPoint[0], 2) + Math.pow(eyePos[1] - lookPoint[1], 2) + Math.pow(eyePos[2] - lookPoint[2], 2));
        const projMatrix = mat4.perspective([], horizontalAngle * Math.PI / 180, aspect, 1.0, distance + 1000);
        const viewMatrix = mat4.lookAt([], eyePos, lookPoint, [0, 1, 0]);
        const projViewMatrix = mat4.multiply([], projMatrix, viewMatrix);
        return { projViewMatrixFromViewpoint: projViewMatrix, far: distance };
    }

    dispose() {
        super.dispose();
        if (this._fbo) {
            this._fbo.destroy();
        }
        if (this._insightShader) {
            this._insightShader.dispose();
        }
        if (this._helperMesh) {
            this._helperMesh.geometry.dispose();
            this._helperMesh.dispose();
        }
    }

    _resize(horizontalAngle, verticalAngle) {
        const width = Util.isFunction(this._viewport.width.data) ? this._viewport.width.data() : this._viewport.width;
        const height = Util.isFunction(this._viewport.height.data) ? this._viewport.height.data() : this._viewport.height;
        if (this._fbo && (this._fbo.width !== width || this._fbo.height !== height)) {
            this._fbo.resize(width, height);
        }
        if (this._depthFBO && (this._depthFBO.width / this._depthFBO.height !== horizontalAngle / verticalAngle)) {
            const size = this._getDepthMapSize(horizontalAngle, verticalAngle);
            if (size) {
                this._depthFBO.resize(size.width, size.height);
            }
        }
    }
}
