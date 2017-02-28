// utils
// var debug = require('debug').enable('*')
// var extend = require('extend')

// sys
// var createWindow = require('./sys/createWindow')
// var loadImage = require('./sys/loadImage')
// var Time = require('./sys/Time')
// var Platform = require('./sys/Platform')

// glu
// var Program = require('./glu/Program')
// var VertexArray = require('./glu/VertexArray')
// var Context = require('./glu/Context')
// var ClearCommand = require('./glu/ClearCommand')
// var DrawCommand = require('./glu/DrawCommand')
// var TextureCube = require('./glu/TextureCube')
// var Framebuffer = require('./glu/Framebuffer')
// var Texture2D = require('./glu/Texture2D')
// var toVertexArray = require('./glu/createVertexArrayFromGeometry')

// geom
// var createCube = require('./agen/createCube')
// var createFSQ = require('./vgen/createFullScreenQuad')
const createCube = require('primitive-cube')
const bunny = require('bunny')
const normals = require('normals')
const centerAndNormalize = require('geom-center-and-normalize')
const Vec3 = require('pex-math/Vec3')
const SimplexNoise = require('simplex-noise')
const R = require('ramda')

// math
// var createMat4 = require('gl-mat4/create')
// var lookAt = require('gl-mat4/lookAt')
// var perspective = require('gl-mat4/perspective')
// var translate = require('gl-mat4/translate')
// var copy3 = require('gl-vec3/copy')

// shaders
// var glslify = require('glslify-promise')

const createContext = require('./local_modules/pex-context')
const createGL = require('pex-gl')
const frame = require('./frame')
const createCamera = require('pex-cam/perspective')
const createOrbiter = require('pex-cam/orbiter')
const Mat4 = require('pex-math/Mat4')
// const load = require('pex-io/load')
const glsl = require('glslify')
const isBrowser = require('is-browser')

const gl = createGL(isBrowser ? window.innerWidth : 1280, isBrowser ? window.innerHeight : 720)
const ctx = createContext(gl)
let elapsedSeconds = 0
let prevTime = Date.now()
const noise = new SimplexNoise()

const camera = createCamera({
  fov: 45, // TODO: change fov to radians
  aspect: gl.canvas.width / gl.canvas.height,
  position: [3, 0.5, 3],
  target: [0, 0, 0]
})

createOrbiter({ camera: camera, distance: 10 })

const lightCamera = createCamera({
  fov: 45, // TODO: change fov to radians,
  aspect: 1,
  near: 1,
  far: 50,
  position: [7, 4, 7],
  target: [0, 0, 0]
})

const depthMapSize = 512
const depthMap = ctx.texture2D(null, depthMapSize, depthMapSize, { format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_SHORT, minFilter: gl.NEAREST, magFilter: gl.NEAREST })
const colorMap = ctx.texture2D(null, depthMapSize, depthMapSize)

// FIXME: why we need { texture: } ?
const shadowFramebuffer = ctx.framebuffer({ color: [ { texture: colorMap } ], depth: { texture: depthMap } })

// TODO: i could probably replace framebuffer with color, depth, stencil attachments props
// same way we don't declare vertex array, fbo would be created on demand?
const depthPassCmd = ctx.command({
  framebuffer: shadowFramebuffer,
  viewport: [0, 0, depthMapSize, depthMapSize],
  clearColor: [1, 0, 0, 1],
  clearDepth: 1
})

const showNormalsVert = glsl(__dirname + '/glsl/show-normals.vert')
const showNormalsFrag = glsl(__dirname + '/glsl/show-normals.frag')
const shadowMappedVert = glsl(__dirname + '/glsl/shadow-mapped.vert')
const shadowMappedFrag = glsl(__dirname + '/glsl/shadow-mapped.frag')
// BlitVert: glslify(__dirname + '/sh/materials/Blit.vert'),
// BlitFrag: glslify(__dirname + '/sh/materials/Blit.frag')

const clearCmd = ctx.command({
  clearColor: [0.5, 0.5, 0.5, 1.0],
  clearDepth: 1
})

const floor = createCube(5, 0.1, 5)
const drawFloorCmd = ctx.command({
  vert: shadowMappedVert,
  frag: shadowMappedFrag,
  uniforms: {
    uProjectionMatrix: camera.projectionMatrix,
    uViewMatrix: camera.viewMatrix,
    uModelMatrix: Mat4.create(),
    wrap: 0,
    lightNear: lightCamera.near,
    lightFar: lightCamera.far,
    lightProjectionMatrix: lightCamera.projectionMatrix,
    lightViewMatrix: lightCamera.viewMatrix,
    lightPos: lightCamera.position,
    depthMap: depthMap,
    ambientColor: [0, 0, 0, 1],
    diffuseColor: [1, 1, 1, 1]
  },
  vertexLayout: [
    // FIXME: second parameter 'location' is redundand?
    // or is it so we can interleave attributes?
    ['aPosition', 0, 3],
    ['aNormal', 1, 3]
  ],
  attributes: {
    aPosition: {
      buffer: ctx.vertexBuffer(floor.positions)
    },
    aNormal: {
      buffer: ctx.vertexBuffer(floor.normals)
    }
  },
  // FIXME: rename this to indexBuffer?
  elements: {
    buffer: ctx.elementsBuffer(floor.cells)
  },
  depthEnable: true
})

const drawFloorDepthCmd = ctx.command({
  vert: showNormalsVert,
  frag: showNormalsFrag,
  uniforms: {
    uProjectionMatrix: lightCamera.projectionMatrix,
    uViewMatrix: lightCamera.viewMatrix,
    uModelMatrix: Mat4.create()
  },
  vertexLayout: [
    ['aPosition', 0, 3],
    ['aNormal', 1, 3]
  ],
  attributes: {
    aPosition: {
      buffer: ctx.vertexBuffer(floor.positions)
    },
    aNormal: {
      buffer: ctx.vertexBuffer(floor.normals)
    }
  },
  // FIXME: rename this to indexBuffer?
  elements: {
    buffer: ctx.elementsBuffer(floor.cells)
  },
  depthEnable: true
})

const bunnyBaseVertices = centerAndNormalize(bunny.positions).map((p) => Vec3.scale(p, 2))
const bunnyBaseNormals = normals.vertexNormals(bunny.cells, bunny.positions)
const bunnyNoiseVertices = centerAndNormalize(bunny.positions).map((p) => Vec3.scale(p, 2))

const bunnyPositionBuffer = ctx.vertexBuffer(bunnyBaseVertices)
const bunnyNormalBuffer = ctx.vertexBuffer(bunnyBaseNormals)

const drawBunnyCmd = ctx.command({
  vert: shadowMappedVert,
  frag: shadowMappedFrag,
  uniforms: {
    uProjectionMatrix: camera.projectionMatrix,
    // FIXME: because we pass by reference this matrix will keep updating without us
    // doing anything, is that but or a feature? Should i cache and force uViewMatrix: () => camera.viewMatrix
    // to mark the uniform as "dynamic" ?
    uViewMatrix: camera.viewMatrix,
    uModelMatrix: Mat4.translate(Mat4.create(), [0, 1, 0]),
    wrap: 0,
    lightNear: lightCamera.near,
    lightFar: lightCamera.far,
    lightProjectionMatrix: lightCamera.projectionMatrix,
    lightViewMatrix: lightCamera.viewMatrix,
    lightPos: lightCamera.position,
    depthMap: depthMap,
    ambientColor: [0, 0, 0, 1],
    diffuseColor: [1, 1, 1, 1]
  },
  vertexLayout: [
    // FIXME: second parameter 'location' is redundand?
    // or is it so we can interleave attributes?
    ['aPosition', 0, 3],
    ['aNormal', 1, 3]
  ],
  attributes: {
    aPosition: {
      buffer: bunnyPositionBuffer
    },
    aNormal: {
      buffer: bunnyNormalBuffer
    }
  },
  // FIXME: rename this to indexBuffer?
  elements: {
    buffer: ctx.elementsBuffer(bunny.cells)
  },
  depthEnable: true
})

const drawBunnyDepthCmd = ctx.command({
  vert: showNormalsVert,
  frag: showNormalsFrag,
  uniforms: {
    uProjectionMatrix: lightCamera.projectionMatrix,
    uViewMatrix: lightCamera.viewMatrix,
    uModelMatrix: Mat4.translate(Mat4.create(), [0, 1, 0])
  },
  vertexLayout: [
    ['aPosition', 0, 3],
    ['aNormal', 1, 3]
  ],
  attributes: {
    aPosition: {
      buffer: bunnyPositionBuffer
    },
    aNormal: {
      buffer: bunnyNormalBuffer
    }
  },
  // FIXME: rename this to indexBuffer?
  elements: {
    buffer: ctx.elementsBuffer(bunny.cells)
  },
  depthEnable: true
})

function updateTime () {
  const now = Date.now()
  const deltaTime = (now - prevTime) / 1000
  elapsedSeconds += deltaTime
  prevTime = now
}

function updateCamera () {
  const t = elapsedSeconds / 10
  const x = 6 * Math.cos(Math.PI * t)
  const y = 3
  const z = 6 * Math.sin(Math.PI * t)
  camera({ position: [x, y, z] })
}

function updateBunny (ctx) {
  const noiseFrequency = 1
  const noiseScale = 0.1
  for (let i = 0; i < bunnyBaseVertices.length; i++) {
    var v = bunnyNoiseVertices[i]
    var n = bunnyBaseNormals[i]
    Vec3.set(v, bunnyBaseVertices[i])
    var f = noise.noise3D(v[0] * noiseFrequency, v[1] * noiseFrequency, v[2] * noiseFrequency + elapsedSeconds)
    v[0] += n[0] * noiseScale * (f + 1)
    v[1] += n[1] * noiseScale * (f + 1)
    v[2] += n[2] * noiseScale * (f + 1)
  }

  // FIXME: pre-allocate buffer
  // FIXME: add update command
  const positionData = new Float32Array(R.flatten(bunnyNoiseVertices))
  // bunnyPositionBuffer.bufferData(positionData)
  ctx.update(bunnyPositionBuffer, { buffer: positionData })

  // Update options:
  // 1) direct update buffer
  // bunnyPositionBuffer.bufferData(positionData)
  //
  // 2) direct update via ctx
  // ctx.update(bunnyPositionBuffer, { data: positionData })
  //
  // 3) update command
  // const updateCommand = ctx.update({ target: bunnyPositionBuffer, data: positionData })
  // ctx.submit(updatePositions)

  // FIXME: pre-allocate buffer
  // FIXME: add update command
  // What are the update patterns in other APIs?
  const normalData = new Float32Array(R.flatten(normals.vertexNormals(bunny.cells, bunnyNoiseVertices)))
  // bunnyNormalBuffer.bufferData(normalData)
  ctx.update(bunnyNormalBuffer, { buffer: normalData })
}

const drawFullscreenQuadCmd = ctx.command({
  vert: glsl(__dirname + '/glsl/screen-image.vert'),
  frag: glsl(__dirname + '/glsl/screen-image.frag'),
  vertexLayout: [
    ['aPosition', 0, 2],
    ['aTexCoord0', 1, 2]
  ],
  attributes: {
    // aPosition: { buffer: ctx.vertexBuffer(new Float32Array(R.flatten([[-1, -1], [1, -1], [1, 1], [-1, 1]]))) },
    aPosition: { buffer: ctx.vertexBuffer(new Float32Array(R.flatten([[-1, -1], [-2 / 4, -1], [-2 / 4, -1 / 3], [-1, -1 / 3]]))) },
    aTexCoord0: { buffer: ctx.vertexBuffer(new Float32Array(R.flatten([[0, 0], [1, 0], [1, 1], [ 0, 1]]))) }
  },
  elements: {
    buffer: ctx.elementsBuffer(new Uint16Array(R.flatten([[0, 1, 2], [0, 2, 3]])))
  },
  uniforms: {
    uTexture: depthMap
  },
  depthEnable: false
})

// console.time('frame')

frame(() => {
  // console.timeEnd('frame')
  // console.time('frame')
  updateTime()
  updateCamera()
  updateBunny(ctx)
  ctx.submit(depthPassCmd, () => {
    ctx.submit(drawFloorDepthCmd)
    ctx.submit(drawBunnyDepthCmd)
  })
  ctx.submit(clearCmd)
  ctx.submit(drawFloorCmd)
  ctx.submit(drawBunnyCmd)
  ctx.submit(drawFullscreenQuadCmd)
})

/*
createWindow({
  //Problems with preloading resources
  //-might need gl context
  //-loading files one by one is pita
    this.on('resize', this.onResize.bind(this))
  },
  initResources: function() {

    this.shadowMapSize = 1024

    this.camProjectionMatrix   = perspective(createMat4(), Math.PI/4, this.width/this.height, 0.1, 100)
    this.viewMatrix            = createMat4()
    this.bunnyModelMatrix      = createMat4()
    this.floorModelMatrix      = createMat4()
    //NOTE: this is ugly, can't do in inplace when creating matrix
    translate(this.floorModelMatrix, this.floorModelMatrix, [0, -1, 0])

    this.drawDepthProgram = new Program(gl, this.resources.ShowNormalsVert, this.resources.ShowNormalsFrag)
    this.drawShadowMappedProgram = new Program(gl, this.resources.ShadowMappedVert, this.resources.ShadowMappedFrag)

    this.depthMap = Texture2D.create(gl, this.shadowMapSize, this.shadowMapSize, { format: this.gl.DEPTH_COMPONENT, type: this.gl.UNSIGNED_SHORT })
    this.shadowFBO = new Framebuffer(gl, this.shadowMapSize, this.shadowMapSize, { depth: this.depthMap })

    this.blitProgram = new Program(gl, this.resources.BlitVert, this.resources.BlitFrag)

    this.quad = createFSQ(gl)

    this.blitTexture = this.depthMap
  },
  initCommands: function() {
    this.commands = []

    var drawRenderState = {
      depthTest: true
    }

    var blitRenderState = {
      depthTest: true
    }

    var drawShadowUniforms = {
      projectionMatrix  : this.lightProjectionMatrix,
      viewMatrix        : this.lightViewMatrix
    }

    var drawShadowFloorUniforms = extend({
      modelMatrix       : this.floorModelMatrix
    }, drawShadowUniforms)

    var drawShadowBunnyUniforms = extend({
      modelMatrix       : this.bunnyModelMatrix
    }, drawShadowUniforms)

    var drawUniforms = {
      projectionMatrix  : this.camProjectionMatrix,
      viewMatrix        : this.viewMatrix,
      depthMap          : this.depthMap,
      ambientColor      : [0.0, 0.0, 0.0, 0.0],
      diffuseColor      : [1.0, 1.0, 1.0, 1.0],
      lightPos          : this.lightPos,
      wrap              : 0,
      lightNear         : this.lightNear,
      lightFar          : this.lightFar,
      lightViewMatrix   : this.lightViewMatrix,
      lightProjectionMatrix: this.lightProjectionMatrix
    }

    var drawFloorUniforms = extend({
      modelMatrix       : this.floorModelMatrix
    }, drawUniforms)

    var drawBunnyUniforms = extend({
      modelMatrix       : this.bunnyModelMatrix
    }, drawUniforms)

    this.clearShadowCmd = new ClearCommand({
      color: [0.2, 0.82, 0.2, 1.0],
      depth: true,
      framebuffer: this.shadowFBO
    })

    this.clearCmd = new ClearCommand({
      color: [0.2, 0.2, 0.2, 1.0],
      depth: true
    })

    this.floorDrawShadowCmd = new DrawCommand({
      vertexArray : this.floorMesh,
      program     : this.drawDepthProgram,
      uniforms    : drawShadowFloorUniforms,
      renderState : drawRenderState,
      viewport    : [0, 0, this.shadowFBO.width, this.shadowFBO.height],
      framebuffer : this.shadowFBO
    })

    this.bunnyDrawShadowCmd = new DrawCommand({
      vertexArray : this.bunnyMesh,
      program     : this.drawDepthProgram,
      uniforms    : drawShadowBunnyUniforms,
      renderState : drawRenderState,
      viewport    : [0, 0, this.shadowFBO.width, this.shadowFBO.height],
      framebuffer : this.shadowFBO
    })

    this.floorDrawCmd = new DrawCommand({
      vertexArray : this.floorMesh,
      program     : this.drawShadowMappedProgram,
      uniforms    : drawFloorUniforms,
      renderState : drawRenderState
    })

    this.bunnyDrawCmd = new DrawCommand({
      vertexArray : this.bunnyMesh,
      program     : this.drawShadowMappedProgram,
      uniforms    : drawBunnyUniforms,
      renderState : drawRenderState
    })

    this.blitCmd = new DrawCommand({
      vertexArray : this.quad,
      program     : this.blitProgram,
      renderState : blitRenderState,
      uniforms    : {
        texture : this.blitTexture,
        textureSize: [ this.blitTexture.width, this.blitTexture.height ]
      }
    })

    this.commands.push(this.clearShadowCmd)
    this.commands.push(this.floorDrawShadowCmd)
    this.commands.push(this.bunnyDrawShadowCmd)
    this.commands.push(this.clearCmd)
    this.commands.push(this.floorDrawCmd)
    this.commands.push(this.bunnyDrawCmd)
    //this.commands.push(this.blitCmd)
  },
  onResize: function(e) {
    perspective(this.camProjectionMatrix, Math.PI/4, this.width/this.height, 0.1, 100)
  },
  update: function() {
    Time.verbose = true
    Time.update()

  },
  draw: function() {
    var gl = this.gl

    //FIXME: uniform leaking
    //this.floorDrawCmd.uniforms.invViewMatrix = viewMatrix.dup().invert()
    //this.floorDrawCmd.uniforms.normalMatrix = viewMatrix.dup().invert().transpose()
    //this.bunnyDrawCmd.uniforms.invViewMatrix = viewMatrix.dup().invert()
    //this.bunnyDrawCmd.uniforms.normalMatrix = viewMatrix.dup().invert().transpose()

    this.commands.forEach(function(cmd) {
      this.context.submit(cmd)
    }.bind(this))

    try {
      this.context.render()
    }
    catch(e) {
      console.log(e)
      console.log(e.stack)
    }
  }
})
*/
