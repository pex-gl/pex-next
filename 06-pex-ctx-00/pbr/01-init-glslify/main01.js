var Platform    = require('../../sys/Platform');
var Window      = require('../../sys/Window');
var Program     = require('../../p3d/Program');
var Mesh        = require('../../p3d/Mesh');
var Mat4        = require('../../math/Mat4');
var Vec3        = require('../../math/Vec3');
var createTorus = require('torus-mesh');
var R           = require('ramda');
var glslify     = require('glslify-promise');

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

        Promise.all([
            glslify(__dirname + '/glsl/basic.vert'),
            glslify(__dirname + '/glsl/basic.frag')
        ])
        .then(function(sources) {
            this.program = ctx.createProgram(sources[0], sources[1]);
        }.bind(this))
        .catch(function(e) {
            console.log('Shader compilation error: ' + e);
            console.log(e.stack);
        })

        var torus = createTorus({ majorRadius: 1, minorRadius: 0.5 });

        var attributes = [
            { data: torus.positions, location: ctx.ATTRIB_POSITION },
            { data: torus.normals, location: ctx.ATTRIB_NORMAL }
        ];
        var indices = { data: torus.cells };
        this.mesh = ctx.createMesh(attributes, indices);

    },
    draw: function() {
        if (!this.program) return;
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
