const debug = require('debug')
debug.enable('*')
const log = debug('app')

const createContext = require('./local_modules/pex-context')
const createGL = require('pex-gl')
const frame = require('./frame')
const createCamera = require('pex-cam/perspective')
const createOrbiter = require('pex-cam/orbiter')
const Mat4 = require('pex-math/Mat4')
const load = require('pex-io/load')
const glsl = require('glslify')
// const lookup = require('gl-constants/lookup')
const loadGltf = require('./local_modules/pex-gltf')
const isBrowser = require('is-browser')
const iterateObject = require('iterate-object')

const gl = createGL(window.innerWidth, window.innerHeight)
const ctx = createContext(gl)

const ASSETS_PATH = isBrowser ? 'assets' : __dirname + '/assets'
const MODEL_PATH = ASSETS_PATH + '/models/gltf/damagedHelmet/Helmet.gltf'

const pbrVert = glsl(__dirname + '/glsl/pbr.vert')
const pbrFrag = glsl(__dirname + '/glsl/pbr.frag')

const camera = createCamera({
  fov: 45,
  aspect: gl.canvas.width / gl.canvas.height,
  position: [-2, 0.5, -2],
  target: [0, 0, 0]
})

createOrbiter({ camera: camera })

let entities = []

const clearCmd = ctx.command({
  clearColor: [0.5, 0.5, 0.5, 1.0],
  clearDepth: 1
})

let setupPbr = null
let envMap = null

function init (res) {
  envMap = ctx.texture2D(new Uint8Array(res.envMap, 1024, 1024))

  // TODO: this is hack, uniforms should be somehow set after the pipeline is build
  // need to multiply values by basis functions
  const shCoeffs = initSH(res.envMapConfig.diffuseSPH)
  const sh = [] // array of vec3
  for (var i = 0; i < 9; i++) {
    sh.push([shCoeffs[i * 3], shCoeffs[i * 3 + 1], shCoeffs[i * 3 + 2]])
  }

  setupPbr = ctx.command({
    vert: pbrVert,
    frag: pbrFrag,
    vertexLayout: [
      // name, location, size
      ['aPosition', 0, 3],
      ['aNormal', 1, 3],
      ['aTexCoord0', 2, 2]
    ],
    depthEnable: true,
    uniforms: {
      uSh: sh,
      uProjectionMatrix: camera.projectionMatrix,
      uViewMatrix: camera.viewMatrix,
      uInvViewMatrix: Mat4.invert(Mat4.copy(camera.viewMatrix)),
      uLightPos: [5, 3, 10]
    }
  })

  loadGltf(MODEL_PATH, function (err, json) {
    if (err) log('loadGltf', err)

    buildGLTFModel(json)

    frame(draw)
  })
}

let once = false
function draw () {
  if (once) return

  // FIXME: temp, stop rendering after first frame
  if (entities.length > 0) {
    // once = true
  }
  ctx.submit(clearCmd)
  ctx.submit(setupPbr, () => {
    // FIXME: this should wrap entities draw calls
    entities.forEach((e) => ctx.submit(e.drawCmd)) // <--- not working currently
  })
  entities.forEach((e) => ctx.submit(e.drawCmd))
}
/*

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

  // draw full screen quad
  // setPipeline(quadPipeline)
  // drawVertexData(quadPipeline, quadVertexData)
  // gl.bindBuffer(vertexData.elements.buffer._target, vertexData.elements.buffer._handle)
  // var primitive = gl.TRIANGLES
  // var count = vertexData.elements.buffer._length
  // gl.drawElements(primitive, count, ctx.UNSIGNED_SHORT, 0)

  var error = gl.getError()
  if (error) {
    console.log(lookup(error))
  }
}
*/
function buildGLTFModel (json) {
  iterateObject(json.bufferViews, (bufferView) => {
    if (bufferView.target === gl.ELEMENT_ARRAY_BUFFER) {
      // FIXME: this is a dangerous assumption that every element buffer is SHORT_INT
      // ok, we don't need to specify primitive here, it's just a default
      // TODO: bufferView._buffer is not a buffer but ArrayBuffer so we need to create a typed array from it
      bufferView._buffer = ctx.elementsBuffer(bufferView._arrayBuffer)
    } else if (bufferView.target === gl.ARRAY_BUFFER) {
      // FIXME: this is a dangerous assumption that every attribute is FLOAT
      bufferView._buffer = ctx.vertexBuffer(bufferView._arrayBuffer)
    }
  })

  // FIXME: this will break if we have 2 models in gltf file with different textures
  let albedoMap = null
  let normalMap = null
  let metalnessMap = null
  let roughnessMap = null

  Object.keys(json.textures).forEach((textureName) => {
    const texture = json.textures[textureName]
    texture._texture = ctx.texture2D(texture.source._img)
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
    mesh.primitives.forEach((primitive, primitiveIndex) => {
      // var accessorInfo = primitive.attributes.POSITION
      // var size = AttributeSizeMap[accessorInfo.type]
      const attributes = {
        aPosition: {
          buffer: primitive.attributes.POSITION.bufferView._buffer,
          offset: primitive.attributes.POSITION.byteOffset,
          stride: primitive.attributes.POSITION.byteStride
        },
        aNormal: {
          buffer: primitive.attributes.NORMAL.bufferView._buffer,
          offset: primitive.attributes.NORMAL.byteOffset,
          stride: primitive.attributes.NORMAL.byteStride
        },
        aTexCoord0: {
          buffer: primitive.attributes.TEXCOORD_0.bufferView._buffer,
          offset: primitive.attributes.TEXCOORD_0.byteOffset,
          stride: primitive.attributes.TEXCOORD_0.byteStride
        }
      }

      const elements = { buffer: primitive.indices.bufferView._buffer }

      const drawCmd = ctx.command({
        attributes: attributes,
        elements: elements,
        // FIXME: what's a better way to handle that?
        // TODO: add String constant support e.g. 'lines' instead of gl.LINES
        primitive: primitive.mode || primitive.primitive,
        count: primitive.indices.count,
        // FIXME: Why divided by 2?
        offset: primitive.indices.byteOffset / 2,
        uniforms: {
          uEnvMap: envMap,
          uAlbedoMap: albedoMap,
          uNormalMap: normalMap,
          uRoughnessMap: roughnessMap,
          uMetalnessMap: metalnessMap,
          uModelMatrix: modelMatrix
        }
      })
      entities.push({ drawCmd: drawCmd })
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

}

function initSH (sh) {
  var coef0 = 1.0 / (2.0 * Math.sqrt(Math.PI))
  var coef1 = -(Math.sqrt(3.0 / Math.PI) * 0.5)
  var coef2 = -coef1
  var coef3 = coef1
  var coef4 = Math.sqrt(15.0 / Math.PI) * 0.5
  var coef5 = -coef4
  var coef6 = Math.sqrt(5.0 / Math.PI) * 0.25
  var coef7 = coef5
  var coef8 = Math.sqrt(15.0 / Math.PI) * 0.25

  var coef = [
    coef0, coef0, coef0,
    coef1, coef1, coef1,
    coef2, coef2, coef2,
    coef3, coef3, coef3,
    coef4, coef4, coef4,
    coef5, coef5, coef5,
    coef6, coef6, coef6,
    coef7, coef7, coef7,
    coef8, coef8, coef8
  ]

  return coef.map((value, index) => value * sh[index])
}

load({
  // envMap: { binary: 'assets/envmaps/unity_muirwood/specular_panorama_ue4_1024_luv.bin' },
  // envMap: { binary: 'assets/envmaps/unity_muirwood/specular_panorama_ue4_1024_rgbm.bin' },
  // envMapConfig: { json: 'assets/envmaps/unity_muirwood/config.json' }
  // envMap: { binary: 'assets/envmaps/unity_trinitatis_church/specular_panorama_ue4_1024_luv.bin' },
  // envMap: { binary: 'assets/envmaps/unity_trinitatis_church/specular_panorama_ue4_1024_rgbm.bin' },
  // envMapConfig: { json: 'assets/envmaps/unity_trinitatis_church/config.json' },
  envMap: { binary: 'assets/envmaps/unity_kirby_cove/specular_panorama_ue4_1024_rgbm.bin' },
  envMapConfig: { json: 'assets/envmaps/unity_kirby_cove/config.json' }
}, (err, res) => {
  try {
    if (err) log('Resource loading failed', err)
    else init(res)
  } catch (e) {
    console.log('Init failed', e, e.stack)
  }
})
