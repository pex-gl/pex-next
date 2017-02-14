attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aTexCoord0;

uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uModelMatrix;
uniform vec3 uLightPos;

varying vec3 vPositionView;
varying vec3 vNormalView;
varying vec2 vTexCoord;
varying vec3 vLightPosView;

void main () {
  mat4 modelViewMatrix = uViewMatrix * uModelMatrix;
  mat3 normalMatrix = mat3(modelViewMatrix);
  vec4 positionView = modelViewMatrix * vec4(aPosition, 1.0);
  vNormalView = normalMatrix * aNormal;
  vPositionView = positionView.xyz;
  vTexCoord = aTexCoord0;
  gl_Position = uProjectionMatrix * positionView;
  vLightPosView = (uViewMatrix * vec4(uLightPos, 1.0)).xyz;
}
