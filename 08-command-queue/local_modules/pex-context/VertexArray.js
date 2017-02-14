var DEFAULT_VERTEX_ATTRIB = {
    enabled    : true,
    location   : -1,
    size       : -1,
    type       : null,
    normalized : false,
    stride     : 0,
    offset     : 0,
    divisor    : null,

    prevEnabled : false
};

var STR_ERROR_ATTRIB_PROPERTY_MISSING   = 'Attribute property "%s" missing.';
var STR_ERROR_ATTRIB_PROPERTY_NOT_VALID = 'Attribute property "%s" not valid.';
var STR_ERROR_ATTRIB_LOCATION_DUPLICATE = 'Attribute at location "%s" has already been defined.';

/**
 * @example
 * //init with interleaved buffer and index buffer
 * var vertexArray = new VertexArray(ctx,[
 *     {buffer : buffer0, location : ctx.ATTRIB_POSITION, size : 3, stride : 0, offset : 0 },
 *     {buffer : buffer0, location : ctx.ATTRIB_NORMAL, size : 3, stride : 0, offset : 4 * 3 * 4},
 *     {buffer : buffer1, location : ctx.ATTRIB_COLOR, size : 4},
 * ], indexBuffer);
 *
 *
 * @param {Context} ctx
 * @param {Array} attributes
 * @param {Buffer} [indexBuffer]
 * @constructor
 */

function VertexArray(ctx,attributes,indexBuffer){
    this._ctx = ctx;

    this._attributes            = {};
    this._attributesPerLocation = {};

    this._arrayBuffers = [];
    this._indexBuffer  = indexBuffer !== undefined ? indexBuffer : null;

    this._hasDivisor   = false;

    var attrib, attribCopy, defaultProp, buffer;
    var attributesPerBuffer;
    var bufferIndex;

    for(var i = 0, numAttributes = attributes.length; i < numAttributes; ++i){
        attrib = attributes[i];

        if(attrib['location'] === undefined){
            throw new Error(STR_ERROR_ATTRIB_PROPERTY_MISSING.replace('%s','location'));
        }
        if(attrib['size'] === undefined){
            throw new Error(STR_ERROR_ATTRIB_PROPERTY_MISSING.replace('%s','size'));
        }
        if(attrib['buffer'] === undefined){
            throw new Error(STR_ERROR_ATTRIB_PROPERTY_MISSING.replace('%s','buffer'));
        }

        //Check if all passed parameters are valid (e.g. no typos)
        attribCopy = {};
        for(var property in attrib){
            defaultProp = DEFAULT_VERTEX_ATTRIB[property];
            if(defaultProp === undefined && property !== 'buffer'){
                throw new Error(STR_ERROR_ATTRIB_PROPERTY_NOT_VALID.replace('%s',property));
            }
            attribCopy[property] = attrib[property];
        }
        //Assign default values
        for(var property in DEFAULT_VERTEX_ATTRIB){
            defaultProp = DEFAULT_VERTEX_ATTRIB[property];
            if (attribCopy[property] === undefined) {
                attribCopy[property] = defaultProp;
            }
         }

        //Check if location for that attribute is not taken already
        for(var bufferAttributeKey in this._attributes){
            attributesPerBuffer = this._attributes[bufferAttributeKey];
            for(var j = 0; j < attributesPerBuffer.length; ++j){
                if(attributesPerBuffer[j].location === attrib.location){
                    throw new Error(STR_ERROR_ATTRIB_LOCATION_DUPLICATE.replace('%s',attrib.location));
                }
            }
        }

        buffer      = attribCopy.buffer;
        bufferIndex = this._arrayBuffers.indexOf(buffer);
        if(bufferIndex == -1){
            this._arrayBuffers.push(buffer);
            bufferIndex = this._arrayBuffers.length - 1;
            this._attributes[bufferIndex] = [];
        }

        attribCopy.type = buffer.getDataType();
        delete attribCopy.buffer;

        this._hasDivisor = this._hasDivisor || attribCopy.divisor !== null;
        this._attributes[bufferIndex].push(attribCopy);
        this._attributesPerLocation[attribCopy.location] = attribCopy;
    }
}

/**
 * Returns the attribute properties at an attribute location.
 * @param {Number} location
 * @returns {undefined|Object}
 */

VertexArray.prototype.getAttribute = function(location){
    return this._attributesPerLocation[location];
}

/**
 * Returns true if vertex array has an ctx.ELEMENT_BUFFER bound
 * @returns {boolean}
 */

VertexArray.prototype.hasIndexBuffer = function(){
    return this._indexBuffer !== null;
};

/**
 * Returns the index buffer buffer bound.
 * @returns {Buffer|null}
 */

VertexArray.prototype.getIndexBuffer = function(){
    return this._indexBuffer;
};

/**
 * Returns true if there is at least one attribute with divisor set.
 * @returns {Boolean}
 */

VertexArray.prototype.hasDivisor = function(){
    return this._hasDivisor;
};

VertexArray.prototype._unbindInternal = function(nextVertexArray){
    var ctx = this._ctx;
    var gl  = ctx.getGL();

    var arrayBuffers = this._arrayBuffers;
    var attributes   = this._attributes;

    var bufferAttributes, attribute, location;

    for(var i = 0, numArrayBuffers = arrayBuffers.length; i < numArrayBuffers; ++i) {
        ctx._unbindBuffer(arrayBuffers[i]);
        bufferAttributes = attributes[i];

        for(var j = 0, numBufferAttribs = bufferAttributes.length; j < numBufferAttribs; ++j){

            attribute = bufferAttributes[j];
            location  = attribute.location;

            if (nextVertexArray && !nextVertexArray._attributesPerLocation[location]) {
                gl.disableVertexAttribArray(location);
            }
        }
    }
}

VertexArray.prototype._bindInternal = function(){
    var ctx = this._ctx;
    var gl  = ctx.getGL();

    var arrayBuffers = this._arrayBuffers;
    var attributes   = this._attributes;

    var bufferAttributes, attribute, location;

    for(var i = 0, numArrayBuffers = arrayBuffers.length; i < numArrayBuffers; ++i) {
        ctx._bindBuffer(arrayBuffers[i]);
        bufferAttributes = attributes[i];

        for(var j = 0, numBufferAttribs = bufferAttributes.length; j < numBufferAttribs; ++j){
            attribute = bufferAttributes[j];
            location  = attribute.location;

            if(!attribute.enabled){
                gl.disableVertexAttribArray(location);
                continue;
            }

            gl.enableVertexAttribArray(location);

            gl.vertexAttribPointer(
                location,
                attribute.size,
                attribute.type,
                attribute.normalized,
                attribute.stride,
                attribute.offset
            );

            if(attribute.divisor === null){
                continue;
            }
            gl.vertexAttribDivisor(location,attribute.divisor);
        }
    }

    if(this._indexBuffer !== null){
        ctx._bindBuffer(this._indexBuffer);
    }
};

module.exports = VertexArray;
