#ifdef GL_ES
precision highp float;
#extension GL_OES_standard_derivatives : enable
#pragma glslify: transpose = require('glsl-transpose')
#endif

#pragma glslify: inverse = require('glsl-inverse')
#pragma glslify: toLinear = require('glsl-gamma/in')
#pragma glslify: toGamma  = require('glsl-gamma/out')
// #pragma glslify: envMapEquirect  = require('../local_modules/glsl-envmap-equirect')

varying vec3 vPositionView;
varying vec3 vNormalView;
varying vec2 vTexCoord;
varying vec3 vLightPosView; // this should be uniform

uniform sampler2D uAlbedoMap;
uniform sampler2D uNormalMap;
uniform sampler2D uRoughnessMap;
uniform sampler2D uMetalnessMap;
uniform sampler2D uEnvMap;
uniform mat4 uInvViewMatrix;

float G1V(float dotNV, float k) {
  return 1.0/(dotNV*(1.0-k)+k);
}

float LightingFuncGGX(vec3 N, vec3 V, vec3 L, float roughness, float F0) {
  float alpha = roughness * roughness;

  //half vector
  vec3 H = normalize(V+L);

  float dotNL = clamp(dot(N,L), 0.0, 1.0);
  float dotNV = clamp(dot(N,V), 0.0, 1.0);
  float dotNH = clamp(dot(N,H), 0.0, 1.0);
  float dotLH = clamp(dot(L,H), 0.0, 1.0);

  float F, D, vis;

  //microfacet model

  // D - microfacet distribution function, shape of specular peak
  float alphaSqr = alpha*alpha;
  float pi = 3.14159;
  float denom = dotNH * dotNH * (alphaSqr-1.0) + 1.0;
  D = alphaSqr/(pi * denom * denom);

  // F - fresnel reflection coefficient
  float dotLH5 = pow(1.0 - dotLH, 5.0);
  F = F0 + (1.0 - F0) * (dotLH5);

  // V / G - geometric attenuation or shadowing factor
  float k = alpha / 2.0;
  vis = G1V(dotNL, k) * G1V(dotNV, k);

  float specular = dotNL * D * F * vis;
  return specular;
}

//Based on Filmic Tonemapping Operators http://filmicgames.com/archives/75
vec3 tonemapFilmic(vec3 color) {
  vec3 x = max(vec3(0.0), color - 0.004);
  return (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);
}

// Source:OSG.js code
//   https://github.com/cedricpinson/osgjs/pull/236/commits/d4f36f73a21d8f74bec8fd673968205a98bb1bd4
// Seems to come from Converting RGB to LogLuv in a fragment shader
//   http://realtimecollisiondetection.net/blog/?p=15
// Discussion: Gamma correct and HDR rendering in a 32 bits buffer
//   http://lousodrome.net/blog/light/tag/logluv/
// Discussion: RGBM color encoding <--- just use that in final
//   http://graphicrants.blogspot.co.uk/2009/04/rgbm-color-encoding.html
const mat3 LUVInverse = mat3( 6.0013,    -2.700,   -1.7995,
                              -1.332,    3.1029,   -5.7720,
                              0.3007,    -1.088,    5.6268 );
vec3 LUVToRGB( const in vec4 vLogLuv ) {
    float Le = vLogLuv.z * 255.0 + vLogLuv.w;
    vec3 Xp_Y_XYZp;
    Xp_Y_XYZp.y = exp2((Le - 127.0) / 2.0);
    Xp_Y_XYZp.z = Xp_Y_XYZp.y / vLogLuv.y;
    Xp_Y_XYZp.x = vLogLuv.x * Xp_Y_XYZp.z;
    vec3 vRGB = LUVInverse * Xp_Y_XYZp;
    return max(vRGB, 0.0);
}

vec2 panoramaLevel(vec2 texCoord, float level, float size) {
  float maxLevel = log2(size) - 1.0; //e.g. 1024 / 2 because of aspect ratio
  vec2 offset = vec2(0.0, (size / 2.0 - pow(2.0, maxLevel - level) - 1.0) / (size / 2.0));
  vec2 scale = vec2(1.0 / pow(2.0, level), 1.0 / pow(2.0, level + 1.0));
  return texCoord * scale + offset;
}

#ifndef PI
#define PI 3.1415926
#endif

#ifndef TwoPI
#define TwoPI (2.0 * PI)
#endif

/**
 * Samples equirectangular (lat/long) panorama environment map
 * @param  {sampler2D} envMap - equirectangular (lat/long) panorama texture
 * @param  {vec3} wcNormal - normal in the world coordinate space
 * @param  {float} - flipEnvMap    -1.0 for left handed coorinate system oriented texture (usual case)
 *                                  1.0 for right handed coorinate system oriented texture
 * @return {vec2} equirectangular texture coordinate-
 * @description Based on http://http.developer.nvidia.com/GPUGems/gpugems_ch17.html and http://gl.ict.usc.edu/Data/HighResProbes/
 */
vec2 envMapEquirect(vec3 wcNormal, float flipEnvMap) {
  //I assume envMap texture has been flipped the WebGL way (pixel 0,0 is a the bottom)
  //therefore we flip wcNorma.y as acos(1) = 0
  float phi = acos(-wcNormal.y);
  float theta = atan(flipEnvMap * wcNormal.x, wcNormal.z) + PI;
  return vec2(theta / TwoPI, phi / PI);
}

vec2 envMapEquirect(vec3 wcNormal) {
    //-1.0 for left handed coordinate system oriented texture (usual case)
    return envMapEquirect(wcNormal, -1.0);
}

void main () {
  vec3 Q1 = dFdx(vPositionView);
  vec3 Q2 = dFdy(vPositionView);
  vec2 st1 = dFdx(vTexCoord);
  vec2 st2 = dFdy(vTexCoord);

  vec3 T = normalize(Q1*st2.t - Q2*st1.t);
  vec3 B = normalize(Q2*st1.s - Q1*st2.s);

  // the transpose of texture-to-eye space matrix
  mat3 TBN = transpose(mat3(T, B, vNormalView));

  vec3 normalTangent = normalize(texture2D(uNormalMap, vTexCoord).rgb * 2.0 - 1.0);
  vec3 lightPos = normalize(vec3(1.0, 1.0, 1.0));
  vec3 N = normalTangent * TBN;
  vec3 L = normalize(vLightPosView - vPositionView);
  vec3 V = normalize(-vPositionView);
  vec3 R = reflect(-V, N);
  vec3 Rworld = vec3(uInvViewMatrix * vec4(R, 0.0));
  float diffuse = max(0.0, dot(N, L));

  float N0 = 0.02; // what's the default for non metals vs metals?
  float roughness = texture2D(uRoughnessMap, vTexCoord).r;
  float metalness = texture2D(uMetalnessMap, vTexCoord).r;
  float level = floor(roughness * 6.0);
  vec3 indirectSpecular = LUVToRGB(texture2D(uEnvMap, panoramaLevel(envMapEquirect(Rworld), level, 1024.0)));
  float specular = LightingFuncGGX(N, V, L, roughness, N0);
  vec3 lightColor = toLinear(vec3(0.5));
  vec3 albedo = toLinear(texture2D(uAlbedoMap, vTexCoord).rgb);
  vec3 ambient = toLinear(vec3(0.3));
  vec3 color = vec3(0.0);
  color += albedo * ambient * (1.0 - metalness);
  color += albedo * diffuse * lightColor * (1.0 - metalness);
  color += specular * lightColor;
  color += albedo * indirectSpecular * metalness;

  color = tonemapFilmic(color);
  gl_FragColor.rgb = toGamma(color);
  gl_FragColor.a = 1.0;
}