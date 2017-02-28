uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uModelMatrix;
attribute vec3 aPosition;
attribute vec3 aNormal;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(aPosition, 1.0);
  vWorldPosition = (uModelMatrix * vec4(aPosition, 1.0)).xyz;
  vNormal = aNormal;
}
