'use strict'
function createGL (width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  document.body.style.margin = '0'
  if (document.body) {
    document.body.appendChild(canvas)
  } else {
    // just in case our script is included above <body>
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(canvas)
    })
  }
  const gl = canvas.getContext('webgl')
  return gl
}

module.exports = createGL
