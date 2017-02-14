var loadJSON = require('pex-io/loadJSON')
var loadBinary = require('pex-io/loadBinary')
var loadText = require('pex-io/loadText')
var loadImage = require('pex-io/loadImage')
var log = require('debug')('pex/gltf')
var info = require('debug')('pex/gltf/info')
var warn = require('debug')('pex/gltf/warn')
var path = require('path')
var async = require('async')
var iterateObject = require('iterate-object')


function loadImageBrowser (url, callback, crossOrigin) {
  console.log('cors', crossOrigin)
  var img = new window.Image()
  if (crossOrigin) {
    img.crossOrigin = 'anonymous'
  }
  img.onload = function () {
    callback(null, img)
  }
  img.src = url
}

loadImage = loadImageBrowser

var WebGLConstants = {
  34963: 'ELEMENT_ARRAY_BUFFER',  // 0x8893
  34962: 'ARRAY_BUFFER',          // 0x8892
  5123: 'UNSIGNED_SHORT',         // 0x1403
  5126: 'FLOAT',                  // 0x1406
  4: 'TRIANGLES',                 // 0x0004
  35678: 'SAMPLER_2D',            // 0x8B5E
  35664: 'FLOAT_VEC2',            // 0x8B50
  35665: 'FLOAT_VEC3',            // 0x8B51
  35666: 'FLOAT_VEC4',            // 0x8B52
  35676: 'FLOAT_MAT4'             // 0x8B5C
}

var SupportedAttributeSemantics = ['POSITION', 'NORMAL', 'TEXCOORD_0']

function handleBuffer (ctx, json, basePath, bufferName, bufferInfo, callback) {
  log('handleBuffer', bufferName, bufferInfo.uri)
  if (bufferInfo.uri) {
    loadBinary(basePath + '/' + bufferInfo.uri, function (err, data) {
      bufferInfo._arrayBuffer = data // TODO: obj addon use _
      callback(err, data)
    })
  } else {
    throw new Error('gltf/handleBuffer missing uri in ' + JSON.stringify(bufferInfo))
  }
}

function handleBufferView (ctx, json, basePath, bufferViewName, bufferViewInfo, callback) {
  log('handleBufferView', bufferViewName)
  var buffer = json.buffers[bufferViewInfo.buffer]
  // bufferViewInfo._typedArray = null
  if (bufferViewInfo.target === 34963) { // ELEMENT_ARRAY_BUFFER //TODO: ctx constant
    // TODO: Slice or not to slice the buffer
    // TODO: replace _buffer with buffer or data if consistiend with other loaded objects
    // FIXME: _buffer addon
    bufferViewInfo._arrayBuffer = buffer._arrayBuffer.slice(bufferViewInfo.byteOffset, bufferViewInfo.byteOffset + bufferViewInfo.byteLength) // ADDON
    info('slice', bufferViewName, bufferViewInfo.byteOffset, bufferViewInfo.byteOffset + bufferViewInfo.byteLength, '=', bufferViewInfo.buffer.byteLength)
    // bufferViewInfo._typedArray = new Uint16Array(bufferViewInfo._buffer) // TODO: is this ever used?
  }
  if (bufferViewInfo.target === 34962) { // ARRAY_BUFFER //TODO: ctx constant
    // TODO: Slice or not to slice the buffer
    bufferViewInfo._arrayBuffer = buffer._arrayBuffer.slice(bufferViewInfo.byteOffset, bufferViewInfo.byteOffset + bufferViewInfo.byteLength)
    info('slice', bufferViewName, bufferViewInfo.byteOffset, bufferViewInfo.byteOffset + bufferViewInfo.byteLength, '=', bufferViewInfo.buffer.byteLength)
    // bufferViewInfo._typedArray = new Float32Array(bufferViewInfo._buffer) // TODO: is this ever used?
  }
  log('handleBufferView', bufferViewName, WebGLConstants[bufferViewInfo.target], bufferViewInfo.byteOffset, '..', bufferViewInfo.byteLength, '/', buffer._arrayBuffer.byteLength)
  callback(null, bufferViewInfo)
}

function handleAccessor (ctx, json, basePath, accessorName, accessorInfo, callback) {
  log('handleAccessor', accessorName)
  accessorInfo.bufferView = json.bufferViews[accessorInfo.bufferView]
  callback(null, accessorInfo)
}

function linkPrimitive (json, primitiveName, primitiveInfo) {
  log('handlePrimitive', primitiveName, primitiveInfo.primitive)
  primitiveInfo.indices = json.accessors[primitiveInfo.indices]
  Object.keys(primitiveInfo.attributes).forEach(function (attribute) {
    primitiveInfo.attributes[attribute] = json.accessors[primitiveInfo.attributes[attribute]]
  })
}

function handleMesh (ctx, json, basePath, meshName, meshInfo, callback) {
  log('handleMesh', meshInfo.name)
  meshInfo.primitives.forEach(function (primitiveInfo, primitiveIndex) {
    linkPrimitive(json, primitiveIndex, primitiveInfo)
  })
  callback(null, meshInfo)
}

function buildMeshes (ctx, json, callback) {
  log('buildMeshes')
  var AttributeLocationMap = {
    'POSITION': ctx.ATTRIB_POSITION,
    'NORMAL': ctx.ATTRIB_NORMAL,
    'TEXCOORD_0': ctx.ATTRIB_TEX_COORD_0
  }

  log('buildMesh AttributeNameMap')

  var AttributeSizeMap = {
    'SCALAR': 1,
    'VEC3': 3,
    'VEC2': 2
  }

  function buildBufferInfo (accessorName) {
    var accessorInfo = json.accessors[accessorName]
    var size = AttributeSizeMap[accessorInfo.type]
    // TODO: any other way to limit attrib count?
    var data = null // json.bufferViews[accessorInfo.bufferView]._typedArray// is this ever used? .subarray(0, accessorInfo.count * size)
    var buffer = json.bufferViews[accessorInfo.bufferView]._buffer
    if (buffer) {
      if (json.bufferViews[accessorInfo.bufferView].target === 34963) { // TODO: use ctx
        data = new Uint16Array(buffer.slice(accessorInfo.byteOffset, accessorInfo.byteOffset + accessorInfo.count * size * 2))
      } else {
        data = new Float32Array(buffer.slice(accessorInfo.byteOffset, accessorInfo.byteOffset + accessorInfo.count * size * 4))
      }
      info('subarray', accessorName, accessorInfo.byteOffset, accessorInfo.byteOffset + accessorInfo.count * size * 4)
    } else {
      info('subarray', accessorName, accessorInfo.byteOffset, accessorInfo.byteOffset + accessorInfo.count * size * 2)
    }

    var bufferInfo = {
      data: data,
      opts: {
        offset: 0,
        stride: accessorInfo.byteStride,
        size: size
      }
    }
    log(bufferInfo.opts)
    return bufferInfo
  }

  iterateObject(json.meshes, function (meshInfo, meshName, meshIndex) {
    // if (meshIndex != 2) return //FIXME: TEMP!
    log('buildMesh', meshName)
    meshInfo.primitives.forEach(function (primitiveInfo, primitiveIndex) {
      log('buildPrimitive', primitiveIndex)

      // var va = new VertexArray(ctx) //TODO: use ctx

      var attributes = []

      iterateObject(primitiveInfo.attributes, function (accessorName, attributeSemantic) {
        if (SupportedAttributeSemantics.indexOf(attributeSemantic) === -1) {
          warn('buildAttribute unsupported attribute semantic', attributeSemantic)
          return
        }
        var attributeInfo = buildBufferInfo(accessorName)
        var attributeLocation = AttributeLocationMap[attributeSemantic]
        log('buildAttribute', attributeSemantic, attributeInfo.opts)
        var vertexBuffer = ctx.createBuffer(ctx.ARRAY_BUFFER, attributeInfo.data, ctx.STATIC_DRAW)
        attributes.push({
          buffer: vertexBuffer,
          location: attributeLocation,
          size: attributeInfo.opts.size,
          stride: attributeInfo.opts.stride,
          offset: attributeInfo.opts.offset
        })
      })

      var indexBufferInfo = buildBufferInfo(primitiveInfo.indices)

      log('buildIndexBuffer', indexBufferInfo.opts, 'len:', indexBufferInfo.data.length)
      // va.addIndexBuffer(indexBufferInfo.data, indexBufferInfo.opts) //TODO: use ctx

      var indexBuffer = ctx.createBuffer(ctx.ELEMENT_ARRAY_BUFFER, indexBufferInfo.data, ctx.STATIC_DRAW)

      var va = ctx.createVertexArray(attributes, indexBuffer)

      primitiveInfo.vertexArray = va // TODO: use ctx

      // * var vertexArray = new VertexArray(ctx,[
      // *     {buffer : buffer0, location : ctx.ATTRIB_POSITION, size : 3, stride : 0, offset : 0 },
      // *     {buffer : buffer0, location : ctx.ATTRIB_NORMAL, size : 3, stride : 0, offset : 4 * 3 * 4},
      // *     {buffer : buffer1, location : ctx.ATTRIB_COLOR, size : 4},
      // * ], indexBuffer)
    })
  })

  callback(null, json)
}

function handleShader (ctx, json, basePath, shaderName, shaderInfo, callback) {
  log('handleShader', shaderName)
  if (shaderInfo.uri) {
    loadText(basePath + '/' + shaderInfo.uri, function (err, srcStr) {
      // TODO: add error handling
      log('handleShader')
      // precision is already added in Program class
      shaderInfo._src = srcStr.replace('precision highp float', '') // TODO: is it? // FIXME: shader._src addon
      callback(err, shaderInfo)
    })
  } else {
    throw new Error('gltf/handleShader missing uri in ' + JSON.stringify(shaderInfo))
  }
}

function handleImage (ctx, json, basePath, imageName, imageInfo, callback) {
  log('handleImage', imageInfo.uri)
  if (imageInfo.uri) {
    var url = basePath + '/' + imageInfo.uri
    console.log(loadImage.toString())
    loadImage(url, function (err, img) {
      if (err) {
        log('handleImage', err.toString())
        callback(err, null)
      } else {
        imageInfo._img = img // FIXME: _img addon
        callback(null, img)
      }
    }, true)
  } else {
    throw new Error('gltf/handleImage missing uri in ' + JSON.stringify(imageInfo))
  }
}

function handleTexture (ctx, json, basePath, textureName, textureInfo, callback) {
  log('handleTexture', textureInfo.source)
  if (textureInfo.source) {
    textureInfo.source = json.images[textureInfo.source]
    // var img = json.images[textureInfo.source]._img
    // var opts = {
      // magFilter: ctx.NEAREST,
      // minFilter: ctx.NEAREST,
      // repeat: true,
      // flipY: false
    // }
    // textureInfo._texture = ctx.createTexture2D(img, img.width, img.height, opts) // FIXME: _texture addon
    callback(null, textureInfo)
  } else {
    throw new Error('gltf/handleTexture missing uri in ' + JSON.stringify(textureInfo))
  }
}

function handleProgram (ctx, json, basePath, programName, programInfo, callback) {
  log('handleProgram', programName)
  if (programInfo.vertexShader) {
    programInfo.vertexShader = json.shaders[programInfo.vertexShader]
  }
  if (programInfo.fragmentShader) {
    programInfo.fragmentShader = json.shaders[programInfo.fragmentShader]
  }
  // var vertSrc = json.shaders[programInfo.vertexShader]._src
  // var fragSrc = json.shaders[programInfo.fragmentShader]._src
  // // FIXME: hardcoded
  // vertSrc = vertSrc.replace(/a_position/g, 'position')
  // vertSrc = vertSrc.replace(/a_normal/g, 'normal')
  // vertSrc = vertSrc.replace(/a_texcoord0/g, 'texcoord')
  // fragSrc = '#ifdef GL_ES\nprecision highp float\n#endif\n' + fragSrc
  // programInfo._program = ctx.createProgram(vertSrc, fragSrc) // FIXME: _program addon
  callback(null, programInfo)
}

function handleNode (ctx, json, basePath, nodeName, nodeInfo, callback) {
  log('handleNode', nodeName)
  // FIXME: solve that with Ramda partial
  if (nodeInfo.children) {
    nodeInfo.children = nodeInfo.children.map(function (childNodeName) {
      json.nodes[childNodeName]._parent = nodeInfo
      return json.nodes[childNodeName]
    })
  }
  if (nodeInfo.meshes) {
    nodeInfo.meshes = nodeInfo.meshes.map(function (meshNodeName) {
      return json.meshes[meshNodeName]
    })
  }
  callback(null, nodeInfo)
}

function handleScene (ctx, json, basePath, sceneName, sceneInfo, callback) {
  log('handleScene', sceneName)
  // FIXME: solve that with Ramda partial
  sceneInfo.nodes = sceneInfo.nodes.map(function (childNodeName) {
    return json.nodes[childNodeName]
  })
  callback(null, sceneInfo)
}

function handleAll (typeName, handler, ctx, json, basePath, callback) {
  log('handleAll', typeName)
  if (!json[typeName]) {
    log('missing', typeName)
    return callback(null, null)
  }
  async.map(
    Object.keys(json[typeName]),
    function (nodeName, callback) {
      handler(ctx, json, basePath, nodeName, json[typeName][nodeName], callback)
    },
    callback
  )
}

function load (file, callback) {
  const ctx = null // TODO: remove this, temporary while porting
  const basePath = path.dirname(file)
  log('load ', file)
  loadJSON(file, function (err, json) {
    if (err) {
      console.log('loadJSON', err)
      return callback(err, null)
    }
    async.series([
      function (callback) { handleAll('buffers', handleBuffer, ctx, json, basePath, callback) },
      function (callback) { handleAll('bufferViews', handleBufferView, ctx, json, basePath, callback) },
      function (callback) { handleAll('accessors', handleAccessor, ctx, json, basePath, callback) },
      function (callback) { handleAll('meshes', handleMesh, ctx, json, basePath, callback) },
      function (callback) { handleAll('images', handleImage, ctx, json, basePath, callback) },
      function (callback) { handleAll('textures', handleTexture, ctx, json, basePath, callback) },
      function (callback) { handleAll('shaders', handleShader, ctx, json, basePath, callback) },
      function (callback) { handleAll('programs', handleProgram, ctx, json, basePath, callback) },
      function (callback) { handleAll('nodes', handleNode, ctx, json, basePath, callback) },
      function (callback) { handleAll('scenes', handleScene, ctx, json, basePath, callback) }
      // function (callback) { buildMeshes(ctx, json, callback) }
    ], function (err, results) {
      if (err) log('load done errors', err)
      else log('load done')
      callback(err, json)
    })
  })
}

module.exports = load
