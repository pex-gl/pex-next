var DEFAULT_ATTRIB_LOCATION_BINDING = {
    0 : 'aPosition',
    1 : 'aColor',
    2 : 'aTexCoord0',
    3 : 'aTexCoord1',
    4 : 'aTexCoord2',
    5 : 'aTexCoord3',
    6 : 'aNormal',
    7 : 'aTangent',
    8 : 'aBitangent',
    9 : 'aBoneIndex',
    10 : 'aBoneWeight',
    11 : 'aCustom0',
    12 : 'aCustom1',
    13 : 'aCustom2',
    14 : 'aCustom3',
    15 : 'aCustom4'
};

//TODO: this is true in 99% of cases, might be implementation specific
var NUM_VERTEX_ATTRIBUTES_MAX = 16;

var STR_ERROR_UNIFORM_UNDEFINED = 'Uniform "%s" is not defined.';
var STR_ERROR_WRONG_NUM_ARGS = 'Wrong number of arguments.';
var STR_ERROR_INVALID_UNIFORM_TYPE = 'Unsupported uniform type "%s".';
var STR_ERROR_ATTRIBUTE_BINDING_UNDEFINED = 'Attribute "%s" is not present in program.';

/**
 * @example
 * var program = new Program(ctx, vertexSrc, fragmentSrc, { 0: 'aPositon', 1: 'aNormal', 2: 'aColor' });
 *
 * @param {Context} context
 * @param {String} vertSrc
 * @param {String} [fragSrc]
 * @param {Object} attributeLocationBinding
 * @constructor
 */

function Program(context, vertSrc, fragSrc, attributeLocationBinding){
    var gl = this._gl = context.getGL();

    this._handle = gl.createProgram();
    this._attributes            = {};
    this._attributesPerLocation = {};
    this._uniforms         = {};
    this._uniformSetterMap = {};
    if(vertSrc){
        this.update(vertSrc, fragSrc, attributeLocationBinding);
    }
}

/**
 * Returns the underlying WebGLProgram handle.
 * @returns {WebGLProgram|null}
 */

Program.prototype.getHandle = function(){
    return this._handle;
};

Program.prototype._bindInternal = function(){
    this._gl.useProgram(this._handle);
};

/**
 * updates shaders sources and links the program
 * @param  {String} vertSrc                 - vert shader source (or combined vert/fragShader)
 * @param  {String} [fragSrc]               - frag shader source
 * @param  {String} [attributeLocationBinding] - attribute locations map { 0: 'aPositon', 1: 'aNormal', 2: 'aColor' }
 */
Program.prototype.update = function(vertSrc, fragSrc, attributeLocationBinding){
    var gl = this._gl;
    var program = this._handle;

    var vertShader = this._compileSource(gl.VERTEX_SHADER, vertSrc);
    var fragShader = this._compileSource(gl.FRAGMENT_SHADER, fragSrc);

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
 
    var numAttribs = attributeLocationBinding ? attributeLocationBinding.length : NUM_VERTEX_ATTRIBUTES_MAX
    for(var location = 0; location < numAttribs; location++){
        var attributeName = (attributeLocationBinding && attributeLocationBinding[location]) || DEFAULT_ATTRIB_LOCATION_BINDING[location];
        console.log('binding', location, attributeName)
        gl.bindAttribLocation(program, location, attributeName);
    }

    gl.linkProgram(program);

    if(!gl.getProgramParameter(program, gl.LINK_STATUS)){
        throw new Error('PROGRAM: ' + gl.getProgramInfoLog(program));
    }

    //Mark for deletion, they are not actually deleted until you call deleteProgram() in dispose()
    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);

    this._updateUniforms();
    this._updateAttributes();

    for(var location in attributeLocationBinding){
        var attributeName = attributeLocationBinding[location];
        if(this._attributes[attributeName] === undefined){
            throw new Error(STR_ERROR_ATTRIBUTE_BINDING_UNDEFINED.replace('%s', attributeName));
        }
    }

    this._updateUniformSetterMap();
};

Program.prototype._updateUniforms = function(){
    var gl = this._gl;
    var program     = this._handle;
    var numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    var uniforms    = this._uniforms = {};

    for(var i = 0, info, name; i < numUniforms; ++i){
        info = gl.getActiveUniform(program, i);
        name = info.name;
        uniforms[name] = {
            type : info.type,
            location : gl.getUniformLocation(program, name)
        };
    }
};

Program.prototype._updateAttributes = function(){
    var gl = this._gl;
    var program = this._handle;
    var numAttributes         = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    var attributes            = this._attributes = {};
    var attributesPerLocation = this._attributesPerLocation = {};

    for(var i = 0, info, name, attrib; i < numAttributes; ++i){
        info   = gl.getActiveAttrib(program, i);
        name   = info.name;
        attrib = attributes[name] = {
            type : info.type,
            location : gl.getAttribLocation(program, name)
        }
        attributesPerLocation[attrib.location] = attrib;
    }
};

Program.prototype._compileSource = function(type, src){
    var gl = this._gl;
    var shader = gl.createShader(type);

    gl.shaderSource(shader, src + '\n');
    gl.compileShader(shader);
    if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
        var shaderType = (type === gl.VERTEX_SHADER) ? 'Vertex' : 'Fragment';
        console.log(shaderType + ' shader compilation failed');
        console.log(src);
        throw new Error(shaderType + ' shader error: ' + gl.getShaderInfoLog(shader));
    }
    return shader;
};

Program.prototype._updateUniformSetterMap = function(){
    var gl = this._gl;

    this._uniformSetterMap = {};
    for(var entry in this._uniforms){
        var type = this._uniforms[entry].type;
        if(this._uniformSetterMap[type] === undefined){
            switch (type){
                case gl.INT:
                case gl.BOOL:
                case gl.SAMPLER_2D:
                case gl.SAMPLER_2D_RECT: //Plask/OpenGL only
                case gl.SAMPLER_CUBE:
                    this._uniformSetterMap[gl.INT] = this._uniformSetterMap[gl.INT] || function(location,x,y,z,w){
                        if(x === undefined || y !== undefined){
                            throw new Error(STR_ERROR_WRONG_NUM_ARGS);
                        }
                        gl.uniform1i(location,x);
                    };
                    this._uniformSetterMap[type] = this._uniformSetterMap[gl.INT];
                    break;
                case gl.FLOAT:
                    this._uniformSetterMap[type] = function(location,x,y,z,w){
                        if(x === undefined || y !== undefined){
                            throw new Error(STR_ERROR_WRONG_NUM_ARGS);
                        }
                        gl.uniform1f(location,x);
                    };
                    break;
                case gl.FLOAT_VEC2:
                    this._uniformSetterMap[type] = function(location,x,y,z,w){
                        if(x === undefined || z !== undefined){
                            throw new Error(STR_ERROR_WRONG_NUM_ARGS);
                        }
                        if(y === undefined){
                            gl.uniform2fv(location,x);
                        }
                        else {
                            gl.uniform2f(location,x,y);
                        }
                    };
                    break;
                case gl.FLOAT_VEC3:
                    this._uniformSetterMap[type] = function(location,x,y,z,w){
                        if(x === undefined || w !== undefined || (y !== undefined && z === undefined)){
                            throw new Error(STR_ERROR_WRONG_NUM_ARGS);
                        }
                        if(y === undefined){
                            gl.uniform3fv(location,x);
                        }
                        else {
                            gl.uniform3f(location,x,y,z);
                        }
                    };
                    break;
                case gl.FLOAT_VEC4:
                    this._uniformSetterMap[type] = function(location,x,y,z,w){
                        if(x === undefined || (y !== undefined && z === undefined) || (z !== undefined && w === undefined)){
                            throw new Error(STR_ERROR_WRONG_NUM_ARGS);
                        }
                        if(y === undefined){
                            gl.uniform4fv(location,x);
                        }
                        else {
                            gl.uniform4f(location,x,y,z,w);
                        }
                    };
                    break;
                case gl.FLOAT_MAT2:
                    this._uniformSetterMap[type] = function(location,x,y,z,w){
                        if(x === undefined || y !== undefined){
                            throw new Error(STR_ERROR_WRONG_NUM_ARGS);
                        }
                        gl.uniformMatrix2fv(location,false,x);
                    };
                    break;
                case gl.FLOAT_MAT3:
                    this._uniformSetterMap[type] = function(location,x,y,z,w){
                        if(x === undefined || y !== undefined){
                            throw new Error(STR_ERROR_WRONG_NUM_ARGS);
                        }
                        gl.uniformMatrix3fv(location,false,x);
                    };
                    break;
                case gl.FLOAT_MAT4:
                    this._uniformSetterMap[type] = function(location,x,y,z,w){
                        if(x === undefined || y !== undefined){
                            throw new Error(STR_ERROR_WRONG_NUM_ARGS);
                        }
                        gl.uniformMatrix4fv(location,false,x);
                    };
                    break;
                default:
                    throw new Error(STR_ERROR_INVALID_UNIFORM_TYPE.replace('%s',type));
                    break;
            }
        }
    }
};

/**
 * Specifies the value of a uniform variable for the program bound.
 * @param {String} name
 * @param {Boolean|Number|Float32Array|Uint8Array|Uint16Array|Uint32Array} x
 * @param {Number} [y]
 * @param {Number} [z]
 * @param {Number} [w]
 */

Program.prototype.setUniform = function(name, x, y, z, w){
    var uniform = this._uniforms[name];
    if(uniform === undefined){
        throw new Error(STR_ERROR_UNIFORM_UNDEFINED.replace('%s', name));
    }
    this._uniformSetterMap[uniform.type](uniform.location,x,y,z,w);
};

/**
 * Returns true if there is an attribute bound to the location passed.
 * @param {Boolean} location
 * @returns {boolean}
 */

Program.prototype.hasAttributeAtLocation = function(location){
    return this._attributesPerLocation[location] !== undefined;
};

/**
 * Returns true if the uniform is present in the program.
 * @param {String} name
 * @returns {boolean}
 */

Program.prototype.hasUniform = function(name){
    return this._uniforms[name] !== undefined;
};

/**
 * Frees the memory and invalidates the program.
 * @returns {Program}
 */

Program.prototype.dispose = function(){
    if(!this._handle){
        return this;
    }
    this._gl.deleteProgram(this._handle);
    this._handle = null;
    return this;
};

module.exports = Program;
