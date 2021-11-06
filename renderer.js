
function main() {
    const canvas = document.querySelector("#glCanvas");
    // Initialize the GL context
    const gl = canvas.getContext("webgl2");

    // Only continue if WebGL is available and working
    if (gl === null) {
        alert("Unable to initialize WebGL. Your browser or machine may not support it.");
        return;
    }

    fetch('./vertex_shader.glsl').then((response) => response.text()).then((vertex) => {
        fetch('./fragment_shader.glsl').then((response2) => response2.text()).then((fragment) => {
            init(vertex, fragment, gl, canvas);
            });
        });

}

var mouseX = 0, mouseY = 0;
var xpos = 0.0, ypos = 0.0, zpos = -100.0;

const sensitivity = 1.0;

window.onload = main;
document.onmousemove = handleMouseMove;
window.addEventListener("keydown", function (event) {
    switch (event.code) {
        case "KeyW":
        case "ArrowUp":
            zpos += sensitivity;
            break;

        case "KeyS":
        case "ArrowDown":
            zpos -= sensitivity;
            break;

        case "KeyA":
        case "ArrowLeft":
            xpos -= sensitivity;
            break;

        case "KeyD":
        case "ArrowRight":
            xpos += sensitivity;
            break;

        case "KeyQ":
            ypos += sensitivity;
            break;
        case "KeyE":
            ypos -= sensitivity;
            break;
        default:
            break;
    }

}, true);

function handleMouseMove(event) {
    var eventDoc, doc, body;

    event = event || window.event; // IE-ism

    // If pageX/Y aren't available and clientX/Y are,
    // calculate pageX/Y - logic taken from jQuery.
    // (This is to support old IE)
    if (event.pageX == null && event.clientX != null) {
        eventDoc = (event.target && event.target.ownerDocument) || document;
        doc = eventDoc.documentElement;
        body = eventDoc.body;

        event.pageX = event.clientX +
            (doc && doc.scrollLeft || body && body.scrollLeft || 0) -
            (doc && doc.clientLeft || body && body.clientLeft || 0);
        event.pageY = event.clientY +
            (doc && doc.scrollTop || body && body.scrollTop || 0) -
            (doc && doc.clientTop || body && body.clientTop || 0);
    }

    mouseX = event.pageX;
    mouseY = event.pageY;
}

function init(vsSource, fsSource, gl, canvas) {
    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
    buffers = initBuffers(gl);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    const level = 0;
    const internalFormat = gl.RGBA;
    const width = 4096;
    const height = 4096;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixels = new Uint8Array(width * height * 4);

    for (let i = 0; i < width * height; i++) {
        setElement(i, 255, i % 256, 255, ((i % 1000) < 800) * 255, pixels);
    }
    //pixels[2 + width] = 255;
    //pixels[2 + 4 + width] = 255;
    //pixels[2 + 8 + width] = 255;
    //pixels[2 + 16 + width] = 255;
    //pixels[2 + 32 + width] = 255;

    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
        width, height, border, srcFormat, srcType,
        pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);

    // Get the attribute location
    var coord = gl.getAttribLocation(shaderProgram, "coordinates");

    // Point an attribute to the currently bound VBO
    gl.vertexAttribPointer(coord, 2, gl.FLOAT, false, 0, 0);

    // Enable the attribute
    gl.enableVertexAttribArray(coord);

    window.requestAnimationFrame(function (timestamp) {
        drawScene(gl, canvas, shaderProgram);
    });

    //drawScene(gl, canvas, shaderProgram);
}

function setElement(i, r, g, b, a, pixels) {
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = a;
}

function drawScene(gl, canvas, shaderProgram) {

    const scene = [
        xpos, ypos, zpos,
        mouseX / 100.0, mouseY / 100.0, 0.0,
        0.0, 0.0, 0.0,
        0.0, 0.0, 0.0,
        1.0, 200.0, 100.0,
        1.0, 0.01, 100000.0
    ];

    var location = gl.getUniformLocation(shaderProgram, 'scene_data');
    gl.uniform3fv(location, scene);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    window.requestAnimationFrame(function (timestamp) {
        drawScene(gl, canvas, shaderProgram);
    });
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

function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    // Create the shader program

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    // If creating the shader program failed, alert
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
        return null;
    }

    gl.useProgram(shaderProgram);
    return shaderProgram;
}

function loadShader(gl, type, source) {
    const shader = gl.createShader(type);

    // Send the source to the shader object
    gl.shaderSource(shader, source);

    // Compile the shader program
    gl.compileShader(shader);

    // See if it compiled successfully
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}


