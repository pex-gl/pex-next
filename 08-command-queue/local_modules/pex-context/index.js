const Context = require('./Context')
const R = require('ramda')
const log = require('debug')('context')
const viz = require('viz.js')

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

let ID = 0

function createContext (gl) {
  const defaultState = {
    clearColor: [0, 0, 0, 1],
    clearDepth: 1,
    program: undefined,
    framebuffer: undefined,
    attribures: undefined,
    vertexLayout: undefined,
    viewport: [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight],
    depthEnable: false
  }
  return {
    gl: gl,
    ctx: new Context(gl),
    debugMode: false,
    debugGraph: '',
    debugCommands: [],
    resources: [],
    stack: [ defaultState ],
    state: Object.assign({}, defaultState),
    debug: function (enabled) {
      this.debugMode = enabled
      if (enabled) {
        this.debugGraph = ''
        this.debugGraph += 'digraph frame {\n'
        this.debugGraph += 'size="6,12";\n'
        this.debugGraph += 'rankdir="LR"\n'
        this.debugGraph += 'node [shape=record];\n'
        if (this.debugMode) {
          const res = this.resources.map((res) => {
            return { id: res.id, type: res.id.split('_')[0] }
          })
          const groups = R.groupBy(R.prop('type'), res)
          Object.keys(groups).forEach((g) => {
            this.debugGraph += `subgraph cluster_${g} { \n`
            this.debugGraph += `label = "${g}s" \n`
            groups[g].forEach((res) => {
              this.debugGraph += `${res.id} [style=filled fillcolor = "#DDDDFF"] \n`
            })
            this.debugGraph += `} \n`
          })
        }
      } else {
        if (this.debugGraph) {
          this.debugGraph += 'edge  [style=bold, fontname="Arial", weight=100]\n'
          this.debugCommands.forEach((cmd, i, commands) => {
            if (i > 0) {
              const prevCmd = commands[i - 1]
              this.debugGraph += `${prevCmd.name || prevCmd.id} -> ${cmd.name || cmd.id}\n`
            }
          })
          this.debugGraph += '}'
          const div = document.createElement('div')
          console.log(this.debugGraph)
          div.innerHTML = viz(this.debugGraph)
          div.style.position = 'absolute'
          div.style.top = '0'
          div.style.left = '0'
          div.style.transformOrigin = '0 0'
          div.style.transform = 'scale(0.75, 0.75)'
          document.body.appendChild(div)
          this.debugGraph = ''
          this.debugCommands.length = 0
        }
      }
    },
    // texture2D({ data: TypedArray, width: Int, height: Int })
    texture2D: function (opts) {
      log('texture2D', opts)
      if (opts.src) {
        const res = this.ctx.createTexture2D(opts, opts.width, opts.height, opts)
        res.id = 'texture2D_' + ID++
        this.resources.push(res)
        return res
      } else if (typeof opts === 'object' && (!opts.data || opts.data instanceof Uint8Array || opts.data instanceof Float32Array) && opts.width && opts.height) {
        const res = this.ctx.createTexture2D(opts.data, opts.width, opts.height, opts)
        res.id = 'texture2D_' + ID++
        this.resources.push(res)
        return res
      } else {
        throw new Error('Invalid parameters. Object { data: Uint8Array/Float32Array, width: Int, height: Int} required.')
      }
    },
    framebuffer: function (opts) {
      const res = this.ctx.createFramebuffer(opts.color, opts.depth)
      res.id = 'fbo_' + ID++
      this.resources.push(res)
      return res
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
      log('vertexBuffer', data, Array.isArray(data))
      if (Array.isArray(data)) {
        data = R.flatten(data)
      }
      data = new Float32Array(data)
      const res = this.ctx.createBuffer(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
      res.id = 'vertexBuffer_' + ID++
      this.resources.push(res)
      return res
    },
    elementsBuffer: function (data) {
      if (Array.isArray(data)) {
        data = R.flatten(data)
      }
      data = new Uint16Array(data)
      // FIXME: don't flatten if unnecesary
      const res = this.ctx.createBuffer(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW)
      res.id = 'elementsBuffer_' + ID++
      this.resources.push(res)
      return res
    },
    program: function (vert, frag, vertexLayout) {
      const res = this.ctx.createProgram(vert, frag, vertexLayout)
      res.id = 'program_' + ID++
      this.resources.push(res)
      return res
    },
    command: function (spec) {
      const cmd = Object.assign({}, spec)

      const allowedProps = [
        'name',
        'framebuffer', 'clearColor', 'clearDepth', 'viewport',
        'vert', 'frag', 'uniforms',
        'vertexLayout', 'attributes', 'elements',
        'count', 'primitive', 'offset', // TODO: not yet supported but needed for GLTF
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
      cmd.id = 'command_' + ID++
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
    mergeCommands: function (parent, cmd) {
      // copy old state so we don't modify it's internals
      const newCmd = Object.assign({}, parent)

      // clear values are not merged as they are applied only in the parent command
      newCmd.clearColor = undefined
      newCmd.clearDepth = undefined

      // overwrite properties from new command
      Object.assign(newCmd, cmd)

      // merge uniforms
      newCmd.uniforms = Object.assign({}, parent.uniforms, cmd.uniforms)
      return newCmd
    },
    // TODO: switching to lightweight resources would allow to just clone state
    // and use commands as state modifiers?
    applyCommand: function (cmd) {
      const gl = this.gl
      const state = this.state
      const ctx = this.ctx

      if (this.debugMode) log('apply', { cmd: cmd, state: state })

      let clearBits = 0
      if (cmd.framebuffer !== state.framebuffer) {
        state.framebuffer = cmd.framebuffer
        ctx.bindFramebuffer(state.framebuffer)
        if (this.debugMode) log('\\ bindFramebuffer new')
      }

      if (cmd.viewport !== state.viewport) {
        state.viewport = cmd.viewport
        this.ctx.setViewport(state.viewport[0], state.viewport[1], state.viewport[2], state.viewport[3])
      }

      // log('submit', cmd)

      if (cmd.clearColor !== undefined) {
        clearBits |= gl.COLOR_BUFFER_BIT
        // TODO this might be unnecesary but we don't know because we don't store the clearColor in state
        gl.clearColor(cmd.clearColor[0], cmd.clearColor[1], cmd.clearColor[2], cmd.clearColor[3])
      }

      if (cmd.clearDepth !== undefined) {
        clearBits |= gl.DEPTH_BUFFER_BIT
        // TODO this might be unnecesary but we don't know because we don't store the clearDepth in state
        gl.clearDepth(cmd.clearDepth)
      }

      if (clearBits) {
        gl.clear(clearBits)
      }

      if (cmd.depthEnable !== state.depthEnable) {
        state.depthEnable = cmd.depthEnable
        cmd.depthEnable ? gl.enable(gl.DEPTH_TEST) : gl.disable(gl.DEPTH_TEST)
      }

      if (cmd.program !== state.program) {
        state.program = cmd.program
        if (state.program) {
          gl.useProgram(state.program._handle)
        }
      }

      function drawVertexData (vertexLayout, vertexData) {
        if (!state.program) {
          throw new Error('Trying to draw without an active program')
        }
        let numTextures = 0
        Object.keys(cmd.uniforms).forEach((name) => {
          let value = cmd.uniforms[name]
          if (typeof value === 'function') {
           // log('eval', name)
            value = value()
          }
          // FIXME: uniform array hack
          if (Array.isArray(value) && !state.program._uniforms[name]) {
            if (this.debugMode) log('unknown uniform', name, Object.keys(state.program._uniforms))
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
        state.vertexLayout = cmd.vertexLayout
      }

      if (cmd.attributes) {
        // TODO: add check if available
        drawVertexData(this.state.vertexLayout, cmd)
      }
    },
    submit: function (cmd, batches, subCommand) {
      if (this.debugMode) {
        this.debugCommands.push(cmd)
        if (batches && subCommand) log('submit', { depth: this.stack.length, cmd: cmd, batches: batches, subCommand: subCommand, state: this.state, stack: this.stack })
        else if (batches) log('submit', { depth: this.stack.length, cmd: cmd, batches: batches, state: this.state, stack: this.stack })
        else log('submit', { depth: this.stack.length, cmd: cmd, state: this.state, stack: this.stack })
      }

      if (batches) {
        if (Array.isArray(batches)) {
          // TODO: quick hack
          batches.forEach((batch) => this.submit(this.mergeCommands(cmd, batch), subCommand))
          return
        } else if (typeof batches === 'object') {
          this.submit(this.mergeCommands(cmd, batches), subCommand)
          return
        } else {
          subCommand = batches // shift argument
        }
      }

      // this.pushState()
      const parentState = this.stack[this.stack.length - 1]
      const cmdState = this.mergeCommands(parentState, cmd)
      this.applyCommand(cmdState)
      if (subCommand) {
        if (this.debugMode) {
          this.debugGraph += `subgraph cluster_${cmd.name || cmd.id} {\n`
          this.debugGraph += `label = "${cmd.name}"\n`
          if (cmd.program) {
            this.debugGraph += `${cmd.program.id} -> cluster_${cmd.name || cmd.id}\n`
          }
          if (cmd.framebuffer) {
            this.debugGraph += `${cmd.framebuffer.id} -> cluster_${cmd.name || cmd.id}\n`
            cmd.framebuffer._colorAttachments.forEach((attachment) => {
              this.debugGraph += `${attachment.texture.id} -> ${cmd.framebuffer.id}\n`
            })
            if (cmd.framebuffer._depthAttachment) {
              this.debugGraph += `${cmd.framebuffer._depthAttachment.texture.id} -> ${cmd.framebuffer.id}\n`
            }
          }
        }
        this.stack.push(cmdState)
        subCommand()
        this.stack.pop()
        if (this.debugMode) {
          this.debugGraph += '}\n'
        }
      } else {
        if (this.debugMode) {
          let s = `${cmd.name || cmd.id} [style=filled fillcolor = "#DDFFDD" label="`
          let cells = [cmd.name || cmd.id]
          // this.debugGraph += `cluster_${cmd.name || cmd.id} [style=filled fillcolor = "#DDFFDD"] {\n`
          if (cmd.attributes) {
            cells.push(' ')
            cells.push('vertex arrays')
            Object.keys(cmd.attributes).forEach((attribName, index) => {
              const attrib = cmd.attributes[attribName]
              cells.push(`<a${index}>${attribName}`)
              this.debugGraph += `${attrib.buffer.id} -> ${cmd.name || cmd.id}:a${index}\n`
            })
          }
          if (cmd.elements) {
            cells.push(' ')
            cells.push(`<e>elements`)
            this.debugGraph += `${cmd.elements.buffer.id} -> ${cmd.name || cmd.id}:e\n`
          }
          // if (cmd.program) {
            // this.debugGraph += `${cmd.program.id} -> ${cmd.name || cmd.id}\n`
          // }
          // if (cmd.framebuffer) {
            // this.debugGraph += `${cmd.framebuffer.id} -> ${cmd.name || cmd.id}\n`
            // cmd.framebuffer.color.forEach((tex) => {
              // console.log('tex', tex)
            // })
          // }
          if (cmd.uniforms) {
            cells.push(' ')
            cells.push('uniforms')
            Object.keys(cmd.uniforms).forEach((uniformName, index) => {
              cells.push(`<u${index}>${uniformName}`)
              const value = cmd.uniforms[uniformName]
              if (value.id) {
                this.debugGraph += `${value.id} -> ${cmd.name || cmd.id}:u${index}\n`
              }
            })
          }
          s += cells.join('|')
          s += '"]'
          this.debugGraph += `${s}\n`
        }
      }
      // this.popState()
    }
  }
}

module.exports = createContext
