const Context = require('./Context')
const R = require('ramda')
const log = require('debug')('context')

const logSometimes = (function () {
  let count = 0
  return function () {
    if (count++ % 10 === 0) {
      log.apply(this, arguments)
    }
  }
})()

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
  const defaultState = {
    clearColor: [0, 0, 0, 1],
    clearDepth: 1,
    program: null,
    uniforms: {
    },
    attributes: {},
    elements: null,
    vertexLayout: [],
    framebuffer: null,
    viewport: [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight],
    depthEnable: false
  }
  return {
    gl: gl,
    ctx: new Context(gl),
    debugMode: false,
    stack: [ defaultState ],
    state: defaultState,
    debug: function (enabled) {
      this.debugMode = enabled
    },
    // texture2D({ data: TypedArray, width: Int, height: Int })
    texture2D: function (opts) {
      log('texture2D', opts)
      if (typeof arguments[0] === 'object') {
        return this.ctx.createTexture2D(opts.data, opts.width, opts.height, opts)
      } else {
        throw new Error('Invalid parameters. Object { data: Uint8Array/Float32Array, width: Int, height: Int} required.')
      }
    },
    framebuffer: function (opts) {
      return this.ctx.createFramebuffer(opts.color, opts.depth)
    },
    // TODO: Should we have named versions or generic 'ctx.buffer' command?
    // In regl buffer() is ARRAY_BUFFER (aka VertexBuffer) and elements() is ELEMENTS_ARRAY_BUFFER
    // Now in WebGL2 we get more types Uniform, TransformFeedback, Copy
    // Possible options: {
    //    data: Array or ArrayBuffer
    //    type: 'float', 'uint16' etc
    // }
    vertexBuffer: function (data) {
      // FIXME: don't flatten if unnecesary
      return this.ctx.createBuffer(gl.ARRAY_BUFFER, new Float32Array(R.flatten(data)), gl.STATIC_DRAW)
    },
    elementsBuffer: function (data) {
      // FIXME: don't flatten if unnecesary
      return this.ctx.createBuffer(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(R.flatten(data)), gl.STATIC_DRAW)
    },
    program: function (vert, frag, vertexLayout) {
      return this.ctx.createProgram(vert, frag, vertexLayout)
    },
    command: function (spec) {
      const cmd = Object.assign({}, spec)

      const allowedProps = [
        'name',
        'framebuffer', 'clearColor', 'clearDepth', 'viewport',
        'vert', 'frag', 'uniforms',
        'vertexLayout', 'attributes', 'elements',
        'depthEnable'
      ]

      Object.keys(cmd).forEach((prop) => {
        if (allowedProps.indexOf(prop) === -1) {
          throw new Error(`pex.context.command Unknown prop "${prop}"`)
        }
      })

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
        // log('uniforms', cmd.program._uniforms)
      }
      return cmd
    },
    // TODO: should data be Array and buffer be TypedArray
    // update(texture, { data: TypeArray, [width: Int, height: Int] })
    // update(texture, { data: TypedArray })
    update: function (resource, opts) {
      if (this.debugMode) log('update', { resource: resource, opts: opts })
      if (typeof opts === 'object') {
        if (opts.data instanceof Uint8Array || opts.data instanceof Float32Array || opts.data instanceof Uint16Array) {
          if (opts.data.length && isNaN(opts.data[0])) {
            throw new Error('Trying to update resource with NaN data')
          }
          resource.update(opts)
        } else if (opts.buffer instanceof Uint8Array || opts.buffer instanceof Float32Array || opts.buffer instanceof Uint16Array) {
          if (opts.buffer.byteLength && isNaN(opts.buffer[0])) {
            throw new Error('Trying to update resource with NaN data')
          }
          resource.update(opts)
        } else {
          throw new Error('Only typed arrays are supported for updating GPU resources')
        }
      } else {
        throw new Error('Invalid parameters')
      }
    },
    mergeState: function (oldState, newState) {
      const state = Object.assign({}, oldState, newState)
      state.uniforms = Object.assign({}, oldState.uniforms, newState.uniforms)
      return state
    },
    pushState: function () {
      // TODO: is there some kind of shallow (1 level deep) clone?
      // We need a selective one for e.g. uniforms
      const stateCopy = this.mergeState(this.state, {})
      this.stack.push(stateCopy)
      this.state = stateCopy
    },
    popState: function () {
      const oldState = this.stack.pop()
      this.state = this.stack[this.stack.length - 1]
    },
    // TODO: switching to lightweight resources would allow to just clone state
    // and use commands as state modifiers?
    applyState: function (cmd) {
      const gl = this.gl
      const state = this.state
      let clearBits = 0

      if (cmd.framebuffer) {
        if (cmd.framebuffer !== state.framebuffer) {
          this.ctx.bindFramebuffer(cmd.framebuffer)
          state.framebuffer = cmd.framebuffer // why this is cruicial?
          // if (this.debugMode) log('bindFramebuffer new')
        }
      } else {
        // now this will be called too much e.g. once per each child command
        // if (this.debugMode) log('bindFramebuffer old')
        this.ctx.bindFramebuffer(state.framebuffer)
      }

      if (cmd.viewport) {
        this.ctx.setViewport(cmd.viewport[0], cmd.viewport[1], cmd.viewport[2], cmd.viewport[3])
        state.viewport = cmd.viewport // TODO: copy
      } else {
        this.ctx.setViewport(state.viewport[0], state.viewport[1], state.viewport[2], state.viewport[3])
      }

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
        state.program = cmd.program
      }

      if (cmd.uniforms) {
        Object.assign(state.uniforms, cmd.uniforms)
      }

      function drawVertexData (vertexLayout, vertexData) {
        if (!state.program) {
          throw new Error('Trying to draw without an active program')
        }
        let numTextures = 0
        Object.keys(state.uniforms).forEach((name) => {
          let value = state.uniforms[name]
          if (typeof value === 'function') {
           // log('eval', name)
            value = value()
          }
          // FIXME: uniform array hack
          if (Array.isArray(value) && !state.program._uniforms[name]) {
            log('submit: unknown uniform', name, Object.keys(state.program._uniforms))
            value.forEach((val, i) => {
              state.program.setUniform(`${name}[${i}]`, val)
            })
          } else if (value.getTarget) {
            // FIXME: texture binding hack
            const slot = numTextures++
            gl.activeTexture(gl.TEXTURE0 + slot)
            gl.bindTexture(value._target, value._handle)
            state.program.setUniform(name, slot)
          } else {
            state.program.setUniform(name, value)
          }
        })

        vertexLayout.forEach((layout, i) => {
          const name = layout[0]
          const location = layout[1]
          const size = layout[2]
          const attrib = vertexData.attributes[i] || vertexData.attributes[name]
          gl.bindBuffer(attrib.buffer._target, attrib.buffer._handle)
          gl.enableVertexAttribArray(location)
          // logSometimes('drawVertexData', name, location, attrib.buffer._length)
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

      if (cmd.framebuffer) {
        this.ctx.popState() // FIXME: no push pop state
      }

      if (cmd.viewport) {
        this.ctx.popState()
      }
    },
    submit: function (cmd, batches, subCommand) {
      if (this.debugMode) {
        if (batches && subCommand) logD('submit', { depth: this.stack.length, cmd: cmd, batches: batches, subCommand: subCommand, state: this.state })
        else if (batches) log('submit', { depth: this.stack.length, cmd: cmd, batches: batches, state: this.state })
        else log('submit', { depth: this.stack.length, cmd: cmd, state: this.state })
      }

      if (batches) {
        if (Array.isArray(batches)) {
          // TODO: quick hack
          batches.forEach((batch) => this.submit(this.mergeState(cmd, batch), subCommand))
          return
        } else if (typeof batches === 'object') {
          this.submit(this.mergeState(cmd, batches), subCommand)
          return
        } else {
          subCommand = batches // shift argument
        }
      }

      this.pushState()
      this.applyState(cmd)
      if (subCommand) {
        subCommand()
      }
      this.popState()
    }
  }
}

module.exports = createContext
