const Vec2 = require('pex-math/Vec2')
const Vec3 = require('pex-math/Vec3')
const Mat4 = require('pex-math/Mat4')
const Quat = require('pex-math/Quat')
const Ray = require('pex-geom/Ray')
const clamp = require('pex-math/Utils').clamp

function getViewRay (camera, x, y, windowWidth, windowHeight) {
  const hNear = 2 * Math.tan(camera.fov / 2) * camera.near
  const wNear = hNear * camera.aspect
  let px = (x - windowWidth / 2) / (windowWidth / 2)
  let py = -(y - windowHeight / 2) / (windowHeight / 2)
  px *= wNear / 2
  py *= hNear / 2
  const origin = [0, 0, 0]
  const direction = Vec3.normalize([px, py, -camera.near])
  return [origin, direction]
}

// TOOD: issues to consider
// - using canvas element instead of window for events
// = should arcball update Camera aspect ratio?
// - window resizing
// - fullscreen vs local canvas
// - scroll prevention
// - retina display
// - touch events
// - event priority
// - setting current arcball orientation by setting camera position
// - camera position change detection
function createArcball (opts) {
  const distance = Vec3.distance(opts.camera.position, opts.camera.target)

  // TODO: split into internal state and public state
  const state = {
    camera: opts.camera,
    invViewMatrix: Mat4.create(),
    dragging: false,
    elem: window,
    width: window.innerWidth,
    height: window.innerHeight,
    radius: Math.min(window.innerWidth / 2, window.innerHeight / 2),
    center: [window.innerWidth / 2, window.innerHeight / 2],
    currRot: Quat.fromMat4(Quat.create(), opts.camera.viewMatrix),
    clickRot: [0, 0, 0, 1],
    dragRot: [0, 0, 0, 1],
    clickPos: [0, 0, 0],
    clickPosWindow: [0, 0],
    dragPos: [0, 0, 0],
    dragPosWindow: [0, 0],
    rotAxis: [0, 0, 0],
    distance: distance,
    minDistance: distance / 2,
    maxDistance: distance * 2,
    zoom: true,
    enabled: true,
    clickTarget: [0, 0, 0],
    clickPosPlane: [0, 0, 0],
    dragPosPlane: [0, 0, 0],
    clickPosWorld: [0, 0, 0],
    dragPosWorld: [0, 0, 0]
  }

  Object.assign(state, opts)

  function arcball (opts) {
    // TODO recompute on state change
    return Object.assign(arcball, state, opts)
  }

  function updateWindowSize () {
    if (window.innerWidth !== state.width) {
      state.width = window.innerWidth
      state.height = window.innerHeight
      state.radius = Math.min(state.width / 2, state.height / 2)
      state.center = [state.width / 2, state.height / 2]
    }
  }

  function updateCamera () {
    // instad of rotating the object we want to move camera around it
    state.currRot[3] *= -1

    const position = state.camera.position
    const target = state.camera.target
    const up = state.camera.up
    const distance = state.distance

    // set new camera position according to the current
    // rotation at distance relative to target
    Vec3.set3(position, 0, 0, distance)
    Vec3.multQuat(position, state.currRot)
    Vec3.add(position, target)

    Vec3.set3(up, 0, 1, 0)
    Vec3.multQuat(up, state.currRot)

    state.camera({
      position: position,
      target: target,
      up: up
    })

    // roll back rotation flip
    state.currRot[3] *= -1
  }

  function mouseToSphere (x, y, out) {
    y = state.height - y
    out[0] = (x - state.center[0]) / state.radius
    out[1] = (y - state.center[1]) / state.radius
    const dist = out[0] * out[0] + out[1] * out[1]
    if (dist > 1) {
      Vec3.normalize(out)
    } else {
      out[2] = Math.sqrt(1 - dist)
    }
    return out
  }

  function down (x, y, shift) {
    state.dragging = true
    mouseToSphere(x, y, state.clickPos)
    Quat.set(state.clickRot, state.currRot)
    updateCamera()
    if (shift) {
      Vec2.set2(state.clickPosWindow, x, y)
      Vec3.set(state.clickTarget, state.camera.target)
      const targetInViewSpace = Vec3.multMat4(Vec3.copy(state.clickTarget), state.camera.viewMatrix)
      state.panPlane = [targetInViewSpace, [0, 0, 1]]
      Ray.hitTestPlane(
        getViewRay(state.camera, state.clickPosWindow[0], state.clickPosWindow[1], state.width, state.height),
        state.panPlane[0],
        state.panPlane[1],
        state.clickPosPlane
      )
      Ray.hitTestPlane(
        getViewRay(state.camera, state.dragPosWindow[0], state.dragPosWindow[1], state.width, state.height),
        state.panPlane[0],
        state.panPlane[1],
        state.dragPosPlane
      )
    } else {
      state.panPlane = null
    }
  }

  function move (x, y, shift) {
    if (!state.dragging) {
      return
    }
    if (shift && state.panPlane) {
      Vec2.set2(state.dragPosWindow, x, y)
      Ray.hitTestPlane(
        getViewRay(state.camera, state.clickPosWindow[0], state.clickPosWindow[1], state.width, state.height),
        state.panPlane[0],
        state.panPlane[1],
        state.clickPosPlane
      )
      Ray.hitTestPlane(
        getViewRay(state.camera, state.dragPosWindow[0], state.dragPosWindow[1], state.width, state.height),
        state.panPlane[0],
        state.panPlane[1],
        state.dragPosPlane
      )
      Mat4.set(state.invViewMatrix, state.camera.viewMatrix)
      Mat4.invert(state.invViewMatrix)
      Vec3.multMat4(Vec3.set(state.clickPosWorld, state.clickPosPlane), state.invViewMatrix)
      Vec3.multMat4(Vec3.set(state.dragPosWorld, state.dragPosPlane), state.invViewMatrix)
      const diffWorld = Vec3.sub(Vec3.copy(state.dragPosWorld), state.clickPosWorld)
      const target = Vec3.sub(Vec3.copy(state.clickTarget), diffWorld)
      state.camera({ target: target })
    } else {
      mouseToSphere(x, y, state.dragPos)
      Vec3.set(state.rotAxis, state.clickPos)
      Vec3.cross(state.rotAxis, state.dragPos)
      const theta = Vec3.dot(state.clickPos, state.dragPos)
      Quat.set4(state.dragRot, state.rotAxis[0], state.rotAxis[1], state.rotAxis[2], theta)
      Quat.set(state.currRot, state.dragRot)
      Quat.mult(state.currRot, state.clickRot)
      updateCamera()
    }
  }

  function up () {
    state.dragging = false
    state.panPlane = null
  }

  function scroll (dy) {
    if (!state.zoom) {
      return
    }
    state.distance = state.distance + dy / 100
    state.distance = clamp(state.distance, state.minDistance, state.maxDistance)
    updateCamera()
  }

  function onMouseDown (e) {
    updateWindowSize()
    down(e.clientX, e.clientY, e.shiftKey)
  }

  function onMouseMove (e) {
    move(e.clientX, e.clientY, e.shiftKey)
  }

  function onMouseUp (e) {
    up()
  }

  function onMouseScroll (e) {
    const dy = -e.wheelDelta / 10 || e.detail / 10
    scroll(dy)
    e.preventDefault()
  }

  const mouseWheelEvent = /Firefox/i.test(navigator.userAgent) ? 'DOMMouseScroll' : 'mousewheel'
  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener(mouseWheelEvent, onMouseScroll)

  return arcball(opts)
}

module.exports = createArcball
