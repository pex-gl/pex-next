//VBO & VAO implementation
var VertexBuffer = require('./VertexBuffer');
var log = require('debug')('pex/glu/VertexArray');

var Ext = {
  createVertexArray: null,
  bindVertexArray: null,
  deleteVertexArray: null
};

function VertexArray(gl) {
  this.gl = gl;
  this.indexBuffer = null;
  this.attributes = {};

  if(gl.createVertexArray) {
    log('Native VAO! binding..');
    Ext.createVertexArray = gl.createVertexArray.bind(gl);
    Ext.bindVertexArray = gl.bindVertexArray.bind(gl);
    Ext.deleteVertexArray = gl.deleteVertexArray.bind(gl);
  }
  else if(gl.getExtension && !Ext.createVertexArray) {
    var vaoExt = gl.getExtension('OES_vertex_array_object');
    log('OES_vertex_array_object', vaoExt);
    if (vaoExt) {
      Ext.createVertexArray = vaoExt.createVertexArrayOES.bind(vaoExt);
      Ext.bindVertexArray = vaoExt.bindVertexArrayOES.bind(vaoExt);
      Ext.deleteVertexArray = vaoExt.deleteVertexArrayOES.bind(vaoExt);
    }
  }
  Ext.createVertexArray = null; //FIXME: remove that reset
  if (Ext.createVertexArray) {
    this.vao = Ext.createVertexArray();
    this.vaoValid = true;
    Ext.bindVertexArray(this.vao);
    log('using VAO', this.vao);
  }
}

VertexArray.prototype.addAttribute = function(name, data, opts) {
  opts = opts || {};
  opts.target = this.gl.ARRAY_BUFFER;
  this.attributes[name] = new VertexBuffer(this.gl, data, opts);
  this.vaoValid = false;
  return this;
}

VertexArray.prototype.updateAttribute = function(name, data, opts) {
  this.attributes[name].update(data, opts);
}

VertexArray.prototype.addIndexBuffer = function(data, opts) {
  opts = opts || {};
  opts.type = Uint16Array;
  opts.target = this.gl.ELEMENT_ARRAY_BUFFER;
  this.indexBuffer = new VertexBuffer(this.gl, data, opts);
  this.vaoValid = false;
  return this;
}

VertexArray.prototype.bind = function(program) {
  //log('bind');
  if (this.vao) {
    //log('bind vao')
    //Ext.bindVertexArray(this.vao);
  }
  if (!this.vao || (this.vao && !this.vaoValid)) {
    this.bindBuffers(program);
  }
  this.bindBuffers(program);
  this.vaoValid = true;
}

VertexArray.prototype.bindBuffers = function(program) {
  //log('bind buffers')
  var gl = this.gl;

  for(var attributeName in this.attributes) {
    var attribute = this.attributes[attributeName];
    if (program.attributes[attributeName] !== undefined) {
      gl.bindBuffer(gl.ARRAY_BUFFER, attribute.handle);
      //TODO: check if program has attribute
      //log(attributeName, attribute.stride, attribute.offset);
      gl.vertexAttribPointer(program.attributes[attributeName], attribute.size, gl.FLOAT, false, attribute.stride, attribute.offset);
      gl.enableVertexAttribArray(program.attributes[attributeName]);
    }
    else {
      log(attributeName, attribute.stride, attribute.offset, 'MISSING in the program');
    }
  }

  if (this.indexBuffer) {
    //log('bind element array')
    this.gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer.handle);
  }
  else {
    this.gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  }
}

VertexArray.prototype.unbind = function(program) {
  //TODO: what if layout changes and we remove attrib?
  if (!this.vao) {
    this.unbindBuffers(program);
  }
  if (this.vao) {
    Ext.bindVertexArray(null);
  }
}

VertexArray.prototype.unbindBuffers = function(program) {
  var gl = this.gl;
  gl.disableVertexAttribArray(program.attributes.position);
  for(var attributeName in this.attributes) {
    var attribute = this.attributes[attributeName];
    if (program.attributes[attributeName] !== undefined) {
      gl.disableVertexAttribArray(program.attributes[attributeName]);
    }
  }
  if (this.indexBuffer) {
    this.gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  }
}

VertexArray.prototype.draw = function(opts) {
  var gl = this.gl;
  var primitiveType = (opts && opts.primitiveType) || gl.TRIANGLES;
  //FIXME: all attributes keep their data in memory, should be dropped if not dynamic
  var num = this.attributes.position.dataBuf.length / this.attributes.position.size;
  if (this.indexBuffer) {
    this.gl.drawElements(primitiveType, this.indexBuffer.dataBuf.length, this.gl.UNSIGNED_SHORT, 0);
  }
  else {
    gl.drawArrays(primitiveType, 0, num);
  }
}

module.exports = VertexArray;
