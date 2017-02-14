var drawFrameCallback = null
function drawFrame () {
  if (drawFrameCallback) {
    drawFrameCallback()
  }
  window.requestAnimationFrame(drawFrame)
}

function frame (cb) {
  drawFrameCallback = cb
  window.requestAnimationFrame(drawFrame)
}

module.exports = frame

