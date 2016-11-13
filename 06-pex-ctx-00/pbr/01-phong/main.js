var Platform    = require('../../sys/Platform');
var Window      = require('../../sys/Window');
var Program     = require('../../p3d/Program');
var Mesh        = require('../../p3d/Mesh');
var Mat4        = require('../../math/Mat4');
var Vec3        = require('../../math/Vec3');
var createTorus = require('torus-mesh');
var R           = require('ramda');

var VERT = ' \
attribute vec4 aPosition; \
attribute vec3 aNormal; \
uniform mat4 uProjectionMatrix; \
uniform mat4 uViewMatrix; \
uniform mat4 uModelMatrix; \
varying vec3 vNormal; \
void main() { \
  vNormal = aNormal; \
  gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * aPosition; \
}';

//precision highp float; \
var FRAG = ' \
varying vec3 vNormal; \
void main() { \
  gl_FragColor = vec4(vNormal * 0.5 + 0.5, 1.0); \
}';

Window.create({
    settings: {
        type: '3d',
        width: 800,
        height: 600
    },
    init: function() {
        var ctx = this.getContext();

        this.projection = Mat4.perspective(Mat4.create(), 45, this.getAspectRatio(), 0.001, 10.0);
        this.view = Mat4.lookAt([], [0, 0, 5], [0, 0, 0], [0, 1, 0]);
        this.model = Mat4.create();

        this.program = ctx.createProgram(VERT, FRAG);

        var torus = createTorus({ majorRadius: 1, minorRadius: 0.5 });

        var attributes = [
            { data: torus.positions, location: ctx.ATTRIB_POSITION },
            { data: torus.normals, location: ctx.ATTRIB_NORMAL }
        ];
        var indices = { data: torus.cells };
        this.mesh = ctx.createMesh(attributes, indices);

    },
    draw: function() {
        var ctx = this.getContext();

        ctx.setClearColor(0.2, 0.2, 0.2, 1);
        ctx.clear(ctx.COLOR_BIT | ctx.DEPTH_BIT);

        ctx.setDepthTest(true);

        ctx.setProjectionMatrix(this.projection);
        ctx.setViewMatrix(this.view);
        ctx.setModelMatrix(this.model);

        ctx.bindProgram(this.program);

        ctx.bindMesh(this.mesh);
        ctx.drawMesh();
    }
})
