const Mat4 = require('pex-math/Mat4')

function createPerspectiveCamera (opts) {
  // const projectionMatrix = Mat4.perspective([], 60, gl.canvas.width / gl.canvas.height, 0.1, 100)
  // const viewMatrix = Mat4.lookAt([], [2, 2, 2], [0, 0, 0], [0, 1, 0])
  // const modelMatrix = Mat4.create()

  const state = {
    projectionMatrix: Mat4.create(),
    viewMatrix: Mat4.create(),
    position: [0, 0, 3],
    target: [0, 0, 0],
    up: [0, 1, 0],
    fov: Math.PI / 3,
    aspect: 1,
    near: 0.1,
    far: 100
  }

  function perspectiveCamera (opts) {
    Object.assign(state, opts)

    if (opts.position || opts.target || opts.up) {
      Mat4.lookAt(
        state.viewMatrix,
        state.position,
        state.target,
        state.up
      )
    }

    if (opts.fov || opts.aspect || opts.near || opts.far) {
      Mat4.perspective(
        state.projectionMatrix,
        state.fov / Math.PI * 180,
        state.aspect,
        state.near,
        state.far
      )
    }

    return Object.assign(perspectiveCamera, state)
  }

  return perspectiveCamera(opts)
}

module.exports = createPerspectiveCamera
