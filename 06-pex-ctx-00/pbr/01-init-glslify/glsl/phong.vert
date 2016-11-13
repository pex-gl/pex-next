attribute vec4 aPosition;
attribute vec3 aNormal;

uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uModelMatrix;
uniform mat3 uNormalMatrix;

varying vec3 ecNormal;
varying vec3 ecPosition;
varying vec3 ecLightPos;


void main() {
  vec3 wcLightPos = vec3(10, 10, 10);
  ecNormal = uNormalMatrix * aNormal;
  ecPosition = vec3(uViewMatrix * uModelMatrix * aPosition);
  ecLightPos = (uViewMatrix * vec4(wcLightPos, 1.0)).xyz;
  gl_Position = uProjectionMatrix * vec4(ecPosition, 1.0);
}
