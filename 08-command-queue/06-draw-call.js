console.time('boot')

const debug = require('debug')
debug.enable('*')
const Context = require('./local_modules/pex-context/Context')
const CommandQueue = require('./local_modules/command-queue')
const createGL = require('pex-gl')
const frame = require('./frame')
const createCamera = require('pex-cam/perspective')
const createOrbiter = require('pex-cam/orbiter')
const Mat4 = require('pex-math/Mat4')
// const createCube = require('primitive-cube')
const createSphere = require('primitive-sphere')
const load = require('pex-io/load')
const R = require('ramda')
const glsl = require('glslify')
const lookup = require('gl-constants/lookup')
const loadGltf = require('./local_modules/pex-gltf')
const isBrowser = require('is-browser')
const iterateObject = require('iterate-object')

console.time('createGL')
const gl = createGL(window.innerWidth, window.innerHeight)
console.timeEnd('createGL')
const ctx = new Context(gl)
const commandQueue = new CommandQueue(ctx)

const ASSETS_PATH = isBrowser ? 'assets' : __dirname + '/assets'
const MODEL_PATH = ASSETS_PATH + '/models/gltf/damagedHelmet/Helmet.gltf'

// const AttributeSizeMap = {
  // 'SCALAR': 1,
  // 'VEC3': 3,
  // 'VEC2': 2
// }

const WebGLConstants = {
  1: 'lines',
  4: 'triangles',
  5123: 'uint16',         // 0x1403
  5126: 'float',                  // 0x1406
  34963: 'ELEMENT_ARRAY_BUFFER',  // 0x8893
  34962: 'ARRAY_BUFFER'          // 0x8892
}

const getReglConstant = function (glConstant) {
  if (WebGLConstants[glConstant]) {
    return WebGLConstants[glConstant]
  } else {
    console.log('Unknown constant', glConstant, lookup(glConstant))
    return null
  }
}

console.time('glslify')
const vert = glsl(__dirname + '/glsl/pbr.vert')
const frag = glsl(__dirname + '/glsl/pbr.frag')
console.timeEnd('glslify')

const debugVert = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aTexCoord0;

uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uModelMatrix;
uniform vec3 uLightPos;

varying vec3 vPositionView;
varying vec3 vNormalView;
varying vec3 vLightPosView;
varying vec2 vTexCoord;

void main () {
  mat4 modelViewMatrix = uViewMatrix * uModelMatrix;
  mat3 normalMatrix = mat3(modelViewMatrix);
  vec4 positionView = modelViewMatrix * vec4(aPosition, 1.0);
  vNormalView = normalMatrix * aNormal;
  vPositionView = positionView.xyz;
  gl_Position = uProjectionMatrix * positionView;
  vLightPosView = (uViewMatrix * vec4(uLightPos, 1.0)).xyz;
  vTexCoord = aTexCoord0;
}
`

const debugFrag = `
#ifdef GL_ES
precision highp float;
#endif
varying vec3 vNormalView;
varying vec2 vTexCoord;
void main () {
  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  // gl_FragColor.rgb = vNormalView * 0.5 + 0.5;
  gl_FragColor.rg += vTexCoord;
}
`

const camera = createCamera({
  fov: 45,
  aspect: gl.canvas.width / gl.canvas.height,
  position: [0, 1, 2],
  target: [0, 0, 0]
})

createOrbiter({ camera: camera })

const clearCmd = commandQueue.createClearCommand({
  color: [1, 0, 0, 1],
  depth: 1
})

clearCmd.length = 0

const cube = createSphere() // createCube()
const modelMatrix = Mat4.create()

/*
// i'm already mixing highlevel user api with allocation / low level command api
const drawCubeCmd = commandQueue.createDrawCommand({
  // this should queue resource allocation of type Program
  program: ctx.createProgram(vert, frag),
  // here we should be able to declare only attributes
  mesh: ctx.createMesh([
    { data: cube.positions, location: ctx.ATTRIB_POSITION },
    { data: cube.normals, location: ctx.ATTRIB_NORMAL }
  ],
    { data: cube.cells }
  ),
  depth: true,
  // how to handle uniforms that can change?
  uniforms: {
    uProjectionMatrix: camera.projectionMatrix,
    uViewMatrix: camera.viewMatrix,
    // this should not work, if you want dynamic properties as we copy values to typed arrays
    // you should decleare them as prop(name), context(name) or () => {}
    uModelMatrix: modelMatrix
  }
})
*/

// drawCubeCmd.length = 0
//
// uniform blocks?
// uniforms: {
//  uLight: {
//    position: [0, 0, 0],
//  }
// }

const pipelineDesc = {
  vert: vert,
  frag: frag,
  depth: true,
  // learn more abour vertex layouts
  vertexLayout: [
    ['aPosition', 0, 3], // name, location, size
    ['aNormal', 1, 3],
    ['aTexCoord0', 2, 2]
  ],
  uniforms: {
    uProjectionMatrix: camera.projectionMatrix,
    uViewMatrix: camera.viewMatrix,
    uInvViewMatrix: Mat4.invert(Mat4.copy(camera.viewMatrix)),
    uModelMatrix: modelMatrix,
    uAlbedoMap: 0,
    uNormalMap: 1,
    uRoughnessMap: 2,
    uMetalnessMap: 3,
		uEnvMap: 4,
    uLightPos: [5, 3, 10]
  }
}

const vertexData = {
  attributes: [
    { data: cube.positions, location: 0 },
    { data: cube.normals, location: 1 },
    { data: cube.uvs, location: 2 }
  ],
  elements: { data: cube.cells }
}

const quadPipelineDesc = {
  vert: `
  attribute vec3 aPosition;
  attribute vec2 aTexCoord0;
  varying vec2 vTexCoord;
  void main () {
    gl_Position = vec4(aPosition, 1.0);
    vTexCoord = aTexCoord0;
  }
  `,
  frag: `
  #ifdef GL_ES
  precision highp float;
  #endif
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
  varying vec2 vTexCoord;
  uniform sampler2D uEnvMap;

  //level 0 = offset:[0, 0], scale:[1, 1/2]
  //level 1 = offset:[0, 1/2], scale:[1/2, 1/4]
  //level 1 = offset:[0, 3/4], scale:[1/2, 1/4]
  void main () {
    float size = 1024.0;
    float level = 1.0;
    float maxLevel = 8.0;
    vec2 offset = vec2(0.0, (size / 2.0 - pow(2.0, maxLevel + 1.0 - level) - 1.0) / (size / 2.0));
    vec2 scale = vec2(1.0 / pow(2.0, level), 1.0 / pow(2.0, level + 1.0));
    gl_FragColor.rgb = LUVToRGB(texture2D(uEnvMap, vTexCoord * scale + offset));
    gl_FragColor.a = 1.0;
  }
  `,
  depth: false,
  // learn more abour vertex layouts
  vertexLayout: [
    ['aPosition', 0, 3], // name, location, size
    ['aTexCoord0', 1, 2]
  ],
  uniforms: {
		uEnvMap: 4
  }
}

const quadPipeline = createPipeline(quadPipelineDesc)

const quadVertexData = {
  attributes: [
    { data: [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]], location: 0 },
    { data: [[0, 0], [1, 0], [1, 1], [0, 1]], location: 1 }
  ],
  elements: { data: [[0, 1, 2], [0, 2, 3]] }
}

const debugPipelineDesc = {
  vert: debugVert,
  frag: debugFrag,
  depth: true,
  // learn more abour vertex layouts
  vertexLayout: [
    ['aPosition', 0, 3], // name, location, size
    ['aNormal', 1, 3],
    ['aTexCoord0', 2, 2]
  ],
  uniforms: {
    uProjectionMatrix: camera.projectionMatrix,
    uViewMatrix: camera.viewMatrix,
    uModelMatrix: modelMatrix,
    uLightPos: [5, 3, 10]
  }
}

vertexData.attributes.forEach((attrib) => {
  attrib.buffer = ctx.createBuffer(gl.VERTEX_ARRAY_BUFFER, new Float32Array(R.flatten(attrib.data)), gl.STATIC_DRAW)
})

vertexData.elements.buffer = ctx.createBuffer(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(R.flatten(vertexData.elements.data)), gl.STATIC_DRAW)

quadVertexData.attributes.forEach((attrib) => {
  attrib.buffer = ctx.createBuffer(gl.VERTEX_ARRAY_BUFFER, new Float32Array(R.flatten(attrib.data)), gl.STATIC_DRAW)
})

quadVertexData.elements.buffer = ctx.createBuffer(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(R.flatten(quadVertexData.elements.data)), gl.STATIC_DRAW)

var albedoMap = null
var normalMap = null
var roughnessMap = null
var metalnessMap = null
var envMap = null

function createPipeline (desc) {
  // extract just the names of attributes
  const program = ctx.createProgram(desc.vert, desc.frag, R.pluck(0, desc.vertexLayout))
  return {
    program: program,
    uniforms: desc.uniforms,
    vertexLayout: desc.vertexLayout,
    count: 6,
    depth: {
      enable: true
    }
  }
}

const pipeline = createPipeline(pipelineDesc)
const debugPipeline = createPipeline(debugPipelineDesc)

let entities = []

function setPipeline (pipeline) {
  if (pipeline.depth && pipeline.depth.enable) {
    gl.enable(gl.DEPTH_TEST)
  }
  gl.useProgram(pipeline.program._handle)
  Object.keys(pipeline.uniforms).forEach((uniformName) => {
    if (uniformName === 'uInvViewMatrix') {
      // FIXMEL updated uniform
      pipeline.uniforms[uniformName] = Mat4.invert(Mat4.copy(camera.viewMatrix))
    }
    pipeline.program.setUniform(uniformName, pipeline.uniforms[uniformName])
  })
}

function drawVertexData (pipeline, vertexData) {
  pipeline.vertexLayout.forEach((layout, i) => {
    const name = layout[0]
    const location = layout[1]
    const size = layout[2]
    const attrib = vertexData.attributes[i] || vertexData.attributes[name]
    gl.bindBuffer(attrib.buffer._target, attrib.buffer._handle)
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(
      location,
      size,
      attrib.buffer._type || gl.FLOAT,
      attrib.normalized || false,
      attrib.stride || 0,
      attrib.offset || 0
    )
    // how to match index with vertexLayout location?
  })

  gl.bindBuffer(vertexData.elements.buffer._target, vertexData.elements.buffer._handle)
  var primitive = gl.TRIANGLES
  var count = vertexData.elements.buffer._length
  gl.drawElements(primitive, count, ctx.UNSIGNED_SHORT, 0)
}

function draw () {
  gl.clearColor(0.5, 0.5, 0.5, 1)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

  setPipeline(pipeline)
  entities.forEach((entity) => {
    gl.activeTexture(gl.TEXTURE0 + 0)
    gl.bindTexture(albedoMap._target, albedoMap._handle)
    gl.activeTexture(gl.TEXTURE0 + 1)
    gl.bindTexture(albedoMap._target, normalMap._handle)
    gl.activeTexture(gl.TEXTURE0 + 2)
    gl.bindTexture(roughnessMap._target, roughnessMap._handle)
    gl.activeTexture(gl.TEXTURE0 + 3)
    gl.bindTexture(metalnessMap._target, metalnessMap._handle)
    gl.activeTexture(gl.TEXTURE0 + 4)
    gl.bindTexture(envMap._target, envMap._handle)
    drawVertexData(pipeline, entity)
    // drawVertexData(pipeline, vertexData)
  })
  // setPipeline(quadPipeline)
  // drawVertexData(quadPipeline, quadVertexData)

  // this is wrong, it should be upside down, driven by pipeline not data

  /*

  gl.bindBuffer(vertexData.elements.buffer._target, vertexData.elements.buffer._handle)
  var primitive = gl.TRIANGLES
  var count = vertexData.elements.buffer._length
  gl.drawElements(primitive, count, ctx.UNSIGNED_SHORT, 0)

  */

  var error = gl.getError()
  if (error) {
    console.log(lookup(error))
  }
}

function buildGLTFModel (json) {
  iterateObject(json.bufferViews, (bufferView) => {
    if (bufferView.target === gl.ELEMENT_ARRAY_BUFFER) {
      // FIXME: this is a dangerous assumption that every element buffer is SHORT_INT
      // ok, we don't need to specify primitive here, it's just a default
      // TODO: bufferView._buffer is not a buffer but ArrayBuffer so we need to create a typed array from it
      bufferView._buffer = ctx.createBuffer(
        gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(bufferView._arrayBuffer),
        gl.STATIC_DRAW
      )
      // bufferView._reglElements = regl.elements({
        // data: bufferView._buffer,
        // type: 'uint16'
      // })
    } else if (bufferView.target === gl.ARRAY_BUFFER) {
      console.log('bufferView buffer')
      // FIXME: this is a dangerous assumption that every attribute is FLOAT
      bufferView._buffer = ctx.createBuffer(
        gl.ARRAY_BUFFER, new Float32Array(bufferView._arrayBuffer),
        gl.STATIC_DRAW
      )
      // bufferView._reglBuffer = regl.buffer({
        // data: bufferView._buffer,
        // type: 'float'
      // })
    }
  })

  let meshIndex = 0
  function handleMesh (mesh, parentNode) {
    const parentStack = []
    let parent = parentNode
    while (parent) {
      if (parent.matrix) {
        // we will process matrices in reverse order
        // from parent to child
        parentStack.unshift(parent.matrix)
      }
      parent = parent._parent
    }
    const modelMatrix = parentStack.reduce(
      (modelMatrix, m) => Mat4.mult(modelMatrix, m), Mat4.scale(Mat4.create(), [1, 1, 1])
    )
    meshIndex++
    mesh.primitives.forEach((primitive, primitiveIndex) => {
      // var accessorInfo = primitive.attributes.POSITION
      // var size = AttributeSizeMap[accessorInfo.type]
      const attributes = {
        aPosition: {
          buffer: primitive.attributes.POSITION.bufferView._buffer,
          offset: primitive.attributes.POSITION.byteOffset,
          stride: primitive.attributes.POSITION.byteStride
        },
        aTexCoord0: {
          buffer: primitive.attributes.TEXCOORD_0.bufferView._buffer,
          offset: primitive.attributes.TEXCOORD_0.byteOffset,
          stride: primitive.attributes.TEXCOORD_0.byteStride
        }
      }

      let normalAttrib = null
      if (primitive.attributes.NORMAL) {
        normalAttrib = primitive.attributes.NORMAL
      } else {
        // TODO: compute normals
        normalAttrib = primitive.attributes.POSITION
      }

      attributes.aNormal = {
        buffer: normalAttrib.bufferView._buffer,
        offset: normalAttrib.byteOffset,
        stride: normalAttrib.byteStride
      }

      // const size = AttributeSizeMap[primitive.indices.type]
      const entity = {
        attributes: attributes,
        // positions: {
          // buffer: primitive.attributes.POSITION.bufferView._buffer,
          // offset: primitive.attributes.POSITION.byteOffset,
          // stride: primitive.attributes.POSITION.byteStride
        // },
        // normals: {
          // buffer: normalAttrib.bufferView._buffer,
          // offset: normalAttrib.byteOffset,
          // stride: normalAttrib.byteStride
        // },
        elements: { buffer: primitive.indices.bufferView._buffer },
        modelMatrix: modelMatrix,
        primitive: getReglConstant(primitive.mode) || getReglConstant(primitive.primitive), // old spec
        count: primitive.indices.count,
        offset: primitive.indices.byteOffset / 2 // WHY?
      }
      entities.push(entity)
      // const cmd = regl({
        // attributes: attributes,
        // elements: primitive.indices.bufferView._reglElements,
        // vert: vert,
        // frag: frag,
        // uniforms: {
          // uProjectionMatrix: projectionMatrix,
          // uViewMatrix: viewMatrix,
          // uModelMatrix: modelMatrix
        // },
        // primitive: getReglConstant(primitive.mode) || getReglConstant(primitive.primitive), // old spec
        // count: primitive.indices.count,
        // offset: primitive.indices.byteOffset / 2
      // })
      // commandQueue.push(cmd)
    })
  }

  function handleNode (node) {
    if (node.meshes) {
      node.meshes.forEach((mesh) => handleMesh(mesh, node))
    }
    if (node.children) {
      node.children.forEach(handleNode)
    }
  }

  json.scenes[json.scene].nodes.forEach(handleNode)
  Object.keys(json.textures).forEach((textureName) => {
    const texture = json.textures[textureName]
    texture._texture = ctx.createTexture2D(texture.source._img)
    console.log('texture name')
    if (textureName.indexOf('albedo') !== -1) {
      albedoMap = texture._texture
    }
    if (textureName.indexOf('normal') !== -1) {
      normalMap = texture._texture
    }
    if (textureName.indexOf('metallic') !== -1) {
      metalnessMap = texture._texture
    }
    if (textureName.indexOf('roughness') !== -1) {
      roughnessMap = texture._texture
    }
  })
}

// https://github.com/cedricpinson/osgjs/blob/333a581915ffb5899b9989dc2f87b3b4d515f725/examples/pbr/EnvironmentPanorama.js
function deinterleaveImage4 (size, src, dst) {
  var npixel = size * size
  var npixel2 = 2 * npixel
  var npixel3 = 3 * npixel
  var idx = 0
  for (var i = 0; i < npixel; i++) {
    dst[ idx++ ] = src[ i ]
    dst[ idx++ ] = src[ i + npixel ]
    dst[ idx++ ] = src[ i + npixel2 ]
    dst[ idx++ ] = src[ i + npixel3 ]
  }
}

load({
  // envMap: { binary: 'assets/envmaps/unity_muirwood/specular_panorama_ue4_1024_luv.bin' }
  envMap: { binary: 'assets/envmaps/unity_trinitatis_church/specular_panorama_ue4_1024_luv.bin' },
  envMapConfig: { json: 'assets/envmaps/unity_trinitatis_church/config.json' }
}, (err, res) => {
  if (err) console.log(err)
  try {
    var size = 1014
    var data = new Uint8Array(res.envMap)
    envMap = ctx.createTexture2D(data, 1024, 1024, {
    })

    console.time('load')
    loadGltf(MODEL_PATH, function (err, json) {
      if (err) console.log(err)

      console.timeEnd('load')
      console.timeEnd('boot')
      console.log('loaded json')
      buildGLTFModel(json)
    })

    frame(draw)
  } catch (e) {
    console.log(e)
  }
})
