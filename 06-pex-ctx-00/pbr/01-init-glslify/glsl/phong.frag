varying vec3 ecNormal;
varying vec3 ecPosition;
varying vec3 ecLightPos;

#pragma glslify: specular = require(glsl-specular-phong)

void main() {
    vec3 lightPos = vec3(10.0, 10.0, 10.0);
    vec3 N = normalize(ecNormal);
    vec3 L = normalize(ecLightPos - ecPosition);
    vec3 V = normalize(-ecPosition);
    float s = specular(L, V, N, 4);
    gl_FragColor = vec4(s, s, s, 1.0);
}
