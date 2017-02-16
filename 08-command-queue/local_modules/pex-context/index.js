const Context = require('./Context')
const R = require('ramda')
const log = require('debug')('context')

// command documentation
// vert: String
// frag: String
// program: Program
// clearColor: [r:Float, g:Float, b:Float, a:Float]
// clearDepth: Float
// depthEnable: Boolean
// vertexLayout: [
//    [ name:String, location:Int, size:Int],
//    ...
// ],
// attributes: [
//   ?
// ]

function createContext (gl) {
  return {
    gl: gl,
    ctx: new Context(gl),
    state: { },
    texture2D: function (data, width, height) {
      log('texture2D', data, width, height)
      return this.ctx.createTexture2D(data, width, height)
    },
    // TODO: Should we have named versions or generic 'ctx.buffer' command?
    // In regl buffer() is ARRAY_BUFFER (aka VertexBuffer) and elements() is ELEMENTS_ARRAY_BUFFER
    // Now in WebGL2 we get more types Uniform, TransformFeedback, Copy
    // Possible options: {
    //    data: Array or ArrayBuffer
    //    type: 'float', 'uint16' etc
    // }
    vertexBuffer: function (data) {
      return this.ctx.createBuffer(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW)
    },
    elementsBuffer: function (data) {
      return this.ctx.createBuffer(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data), gl.STATIC_DRAW)
    },
    program: function (vert, frag, vertexLayout) {
      return this.ctx.createProgram(vert, frag, vertexLayout)
    },
    command: function (spec) {
      const cmd = Object.assign({}, spec)

      if (spec.vert && spec.frag) {
        if (!spec.vertexLayout) {
          if (!spec.attributes) {
            log('Invalid command spec', spec)
            throw new Error('Invalid command. Vert and Frag exists but VertexLayout is missing. Provide vertexLayout or attributes.')
          } else {
            // TODO: derive vertex layout from attributes. Should we default to shader locations instead? In WebGL2 shader can bind locations itself..
          }
        }
        cmd.program = this.program(spec.vert, spec.frag, R.pluck(0, spec.vertexLayout))
        log('Uniforms', cmd.program._uniforms)
      }
      return cmd
    },
    submit: function (cmd) {
      const gl = this.gl
      let clearBits = 0

      // log('submit', cmd)

      if (cmd.clearColor !== undefined) {
        clearBits |= gl.COLOR_BUFFER_BIT
        gl.clearColor(cmd.clearColor[0], cmd.clearColor[1], cmd.clearColor[2], cmd.clearColor[3])
      }

      if (cmd.clearDepth !== undefined) {
        clearBits |= gl.DEPTH_BUFFER_BIT
        gl.clearDepth(cmd.clearDepth)
      }

      if (clearBits) {
        gl.clear(clearBits)
      }

      if (cmd.depthEnable !== undefined) {
        cmd.depthEnable ? gl.enable(gl.DEPTH_TEST) : gl.disable(gl.DEPTH_TEST)
      }

      if (cmd.program !== undefined) {
        gl.useProgram(cmd.program._handle)
        // FIXME: temp state stack hack
        this.state.program = cmd.program
      }

      if (cmd.uniforms) {
        let numTextures = 0
        Object.keys(cmd.uniforms).forEach((name) => {
          let value = cmd.uniforms[name]
          if (typeof(value) === 'function') {
           // log('eval', name)
            value = value()
          }
          // FIXME: uniform array hack
          if (Array.isArray(value) && !this.state.program._uniforms[name]) {
            value.forEach((val, i) => {
              this.state.program.setUniform(`${name}[${i}]`, val)
            })
          } else if (value.getTarget) {
            // FIXME: texture binding hack
            const slot = numTextures++
            gl.activeTexture(gl.TEXTURE0 + slot)
            gl.bindTexture(value._target, value._handle)
            this.state.program.setUniform(name, slot)
          } else {
            this.state.program.setUniform(name, value)
          }
        })
      }

      function drawVertexData (vertexLayout, vertexData) {
        vertexLayout.forEach((layout, i) => {
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
          // TODO: how to match index with vertexLayout location?
        })

        gl.bindBuffer(vertexData.elements.buffer._target, vertexData.elements.buffer._handle)
        var primitive = gl.TRIANGLES
        var count = vertexData.elements.buffer._length
        gl.drawElements(primitive, count, gl.UNSIGNED_SHORT, 0)
      }

      if (cmd.vertexLayout) {
        // FIXME: temp state stack hack
        this.state.vertexLayout = cmd.vertexLayout
      }

      if (cmd.attributes) {
        // TODO: add check if available
        drawVertexData(this.state.vertexLayout, cmd)
      }
    },
    update: function () {
    }
  }
}

module.exports = createContext
