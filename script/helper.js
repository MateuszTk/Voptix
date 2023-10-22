function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
}

function radians(angle) {
    return angle * (Math.PI / 180);
}

function clamp(num, min, max) {
    return ((num <= min) ? min : ((num >= max) ? max : num));
}

function initBuffers(gl) {

    const vertices = [
        -1.0, 1.0,
        1.0, 1.0,
        -1.0, -1.0,
        1.0, -1.0,
    ];

    const vertex_buffer = gl.createBuffer();

    // Bind appropriate array buffer to it
    gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);

    // Pass the vertex data to the buffer
    gl.bufferData(gl.ARRAY_BUFFER,
        new Float32Array(vertices),
        gl.STATIC_DRAW);

    return {
        position: vertex_buffer,
    };
}

class Texture {
    #gl
    #texture
    #width
    #height

    constructor(gl, width, height, image = null) {
        this.#gl = gl;
        this.#width = width;
        this.#height = height;

        this.#texture = this.#gl.createTexture();
        this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#texture);

        // Set the parameters so we can render any size image.
        this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_WRAP_S, this.#gl.CLAMP_TO_EDGE);
        this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_WRAP_T, this.#gl.CLAMP_TO_EDGE);
        this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_MIN_FILTER, this.#gl.LINEAR);
        this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_MAG_FILTER, this.#gl.LINEAR);

        // Upload the image into the texture.
        this.#gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.#width, this.#height, 0, gl.RGBA, gl.UNSIGNED_BYTE, image);

        this.#gl.bindTexture(this.#gl.TEXTURE_2D, null);
    }

    bind() {
        this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#texture);
    }

    unbind() {
        this.#gl.bindTexture(this.#gl.TEXTURE_2D, null);
    }

    get texture() {
        return this.#texture;
    }
};
class UniformBuffer {
    #gl
    #data
    #buffer
    #boundLocation

    constructor(gl, dataSize, boundLocation = 0) {
        this.#gl = gl;
        this.#boundLocation = boundLocation;

        this.#data = new Float32Array(dataSize);

        this.#buffer = this.#gl.createBuffer();
        this.#gl.bindBuffer(this.#gl.UNIFORM_BUFFER, this.#buffer);
        this.#gl.bufferData(this.#gl.UNIFORM_BUFFER, this.#data, this.#gl.DYNAMIC_DRAW);
        this.#gl.bindBuffer(this.#gl.UNIFORM_BUFFER, null);
        this.#gl.bindBufferBase(this.#gl.UNIFORM_BUFFER, this.#boundLocation, this.#buffer);
    }

    update(data, offset) {
        this.#data.set(data, offset);

        this.#gl.bindBuffer(this.#gl.UNIFORM_BUFFER, this.#buffer);
        this.#gl.bufferSubData(this.#gl.UNIFORM_BUFFER, 0, this.#data, 0, null);
        this.#gl.bindBuffer(this.#gl.UNIFORM_BUFFER, null);
        this.#gl.bindBufferBase(this.#gl.UNIFORM_BUFFER, this.#boundLocation, this.#buffer);
    }
};

class ShaderProgram {
    #shaderProgram
    #glContext

    constructor(gl, vsSource, fsSource) {
        this.#glContext = gl;
      //  this.#shaderProgram = initShaderProgram(gl, vsSource, fsSource);
       // console.log(this.#shaderProgram);

        const vertexShader = this.#loadShader(this.#glContext.VERTEX_SHADER, vsSource);
        const fragmentShader = this.#loadShader(this.#glContext.FRAGMENT_SHADER, fsSource);

        // Create the shader program
        this.#shaderProgram = this.#glContext.createProgram();
        this.#glContext.attachShader(this.#shaderProgram, vertexShader);
        this.#glContext.attachShader(this.#shaderProgram, fragmentShader);
        this.#glContext.linkProgram(this.#shaderProgram);

        // If creating the shader program failed, alert
        if (!this.#glContext.getProgramParameter(this.#shaderProgram, this.#glContext.LINK_STATUS)) {
            alert('Unable to initialize the shader program: ' + this.#glContext.getProgramInfoLog(this.#shaderProgram));
            return;
        }

        this.#glContext.useProgram(this.#shaderProgram);
    }

    get program() {
        return this.#shaderProgram;
    }

    use() {
        this.#glContext.useProgram(this.#shaderProgram);
    }

    #loadShader(type, source) {
        const shader = this.#glContext.createShader(type);

        // Send the source to the shader object
        this.#glContext.shaderSource(shader, source);

        // Compile the shader program
        this.#glContext.compileShader(shader);

        // See if it compiled successfully
        if (!this.#glContext.getShaderParameter(shader, this.#glContext.COMPILE_STATUS)) {
            alert('An error occurred compiling the shaders: ' + this.#glContext.getShaderInfoLog(shader));
            this.#glContext.deleteShader(shader);
            return null;
        }

        return shader;
    }
};

class Framebuffer {
    #gl
    #framebuffer
    #textures
    #width
    #height

    constructor(gl, width, height, textureCnt) {
        this.#gl = gl;
        this.#width = width;
        this.#height = height;

        this.#framebuffer = this.#gl.createFramebuffer();
        this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, this.#framebuffer);

        this.#textures = [];
        let attachments = [];
        for (let i = 0; i < textureCnt; i++) {
            const texture = new Texture(this.#gl, width, height);
            texture.bind();
            this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT0 + i, this.#gl.TEXTURE_2D, texture.texture, 0);
            attachments.push(this.#gl.COLOR_ATTACHMENT0 + i);
            this.#textures.push(texture);
            texture.unbind();
        }

        this.#gl.drawBuffers(attachments);

        this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, null);
    }

    bind(setViewport = false) {
        this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, this.#framebuffer);
        if (setViewport) {
            this.#gl.viewport(0, 0, this.#width, this.#height);
        }
    }

    unbind() {
        this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, null);
    }

    get textures() {
        return this.#textures;
    }
};

class Material {
    #shaderProgram
    #glContext
    #textures = []
    #vec2s = []
    #firstTextureUnit

    constructor(gl, shaderProgram, firstTextureUnit = 0) {
        this.#glContext = gl;
        this.#shaderProgram = shaderProgram;
        this.#firstTextureUnit = firstTextureUnit;
    }

    use() {
        this.#glContext.useProgram(this.#shaderProgram.program);

        for (let i = 0; i < this.#textures.length; i++) {
            this.#glContext.activeTexture(this.#glContext.TEXTURE0 + i + this.#firstTextureUnit);
            this.#glContext.bindTexture(this.#glContext.TEXTURE_2D, this.#textures[i].texture.texture);
        }

        for (let i = 0; i < this.#vec2s.length; i++) {
            this.#glContext.uniform2f(this.#vec2s[i].location, this.#vec2s[i].vec2x, this.#vec2s[i].vec2y);
        }
    }

    addTexture(name, texture) {
        this.#textures.push({ name: name, texture: texture });
        let i = this.#textures.length - 1;
        this.#glContext.activeTexture(this.#glContext.TEXTURE0 + i + this.#firstTextureUnit);
        this.#glContext.bindTexture(this.#glContext.TEXTURE_2D, this.#textures[i].texture.texture);
        this.#glContext.uniform1i(this.#glContext.getUniformLocation(this.#shaderProgram.program, name), i + this.#firstTextureUnit);
    }

    addVec2f(name, x, y) {
        this.#vec2s.push({
            name: name,
            vec2x: x,
            vec2y: y,
            location: this.#glContext.getUniformLocation(this.#shaderProgram.program, name)
        });
    }

    get program() {
        return this.#shaderProgram;
    }

    get textures() {
        return this.#textures;
    }
}
