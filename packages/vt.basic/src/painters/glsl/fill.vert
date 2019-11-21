#ifdef IS_2D_POSITION
    attribute vec2 aPosition;
#else
    attribute vec3 aPosition;
#endif

#ifdef HAS_COLOR
    attribute vec4 aColor;
    varying vec4 vColor;
#endif

#ifdef HAS_OPACITY
    attribute float aOpacity;
    varying float vOpacity;
#endif

uniform mat4 projViewModelMatrix;

#ifdef HAS_PATTERN
    attribute vec2 aTexCoord;

    uniform float tileResolution;
    uniform float resolution;
    uniform float tileRatio;
    uniform vec2 uvScale;
    uniform vec2 uvOffset;

    varying vec2 vTexCoord;
#endif
#ifndef ENABLE_TILE_STENCIL
    varying vec2 vPosition;
#endif

#ifdef HAS_SHADOWING
    #include <vsm_shadow_vert>
#endif


void main() {
    #ifdef IS_2D_POSITION
        vec3 position = vec3(aPosition, 0.0);
    #else
        vec3 position = aPosition;
    #endif
    gl_Position = projViewModelMatrix * vec4(position, 1.0);
    #ifndef ENABLE_TILE_STENCIL
        vPosition = aPosition.xy;
    #endif
    #ifdef HAS_PATTERN
        float zoomScale = tileResolution / resolution;
        // /32.0 是为提升精度，原数据都 * 32
        vTexCoord = aTexCoord / 32.0 * uvScale * zoomScale / tileRatio + uvOffset;
    #endif

    #ifdef HAS_COLOR
        vColor = aColor / 255.0;
    #endif

    #ifdef HAS_OPACITY
        vOpacity = aOpacity / 255.0;
    #endif

    #if defined(HAS_SHADOWING)
        shadow_computeShadowPars(vec4(position, 1.0));
    #endif
}
