
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

function radians(angle) {
    return angle * (Math.PI / 180);
}

var mouseX = 0, mouseY = 0;
var pos = glMatrix.vec3.create();
pos[0] = -100.0;
var rotation = glMatrix.vec3.create();
var cursor = glMatrix.vec3.create();
var angle = glMatrix.vec3.create();

var cursor3D = glMatrix.vec3.create();
var paint = false;
var brush = {diameter: 1, color_r: 255, color_g: 255, color_b: 255, clarity: 0};

const level = 0;
const width = 560;
const pixelsPerVoxel = 2;
const height = 560 * pixelsPerVoxel;
const border = 0;
const pixels = new Uint8Array(width * height * 4);


// vector representing where the camera is currently pointing
var direction = glMatrix.vec3.create();

const sensivity = 0.8;

window.onload = main;
document.onmousemove = handleMouseMove;
window.addEventListener("keydown", function (event) {

    glMatrix.vec3.normalize(direction, direction);

    var speed = 1;
    var vec = glMatrix.vec3.create();
    var vec_up = glMatrix.vec3.create();
    vec_up[1] = 1;
    switch (event.code) {
        case "KeyW":
        case "ArrowUp":
            glMatrix.vec3.scaleAndAdd(pos, pos, direction, speed);
            break;

        case "KeyS":
        case "ArrowDown":
            glMatrix.vec3.scaleAndAdd(pos, pos, direction, -speed);
            break;

        case "KeyA":
        case "ArrowLeft":
            glMatrix.vec3.cross(vec, direction, vec_up);
            glMatrix.vec3.normalize(vec, vec);
            glMatrix.vec3.scaleAndAdd(pos, pos, vec, speed);
            break;

        case "KeyD":
        case "ArrowRight":
            glMatrix.vec3.cross(vec, direction, vec_up);
            glMatrix.vec3.normalize(vec, vec);
            glMatrix.vec3.scaleAndAdd(pos, pos, vec, -speed);
            break;

        case "KeyQ":
            pos[1] -= speed;
            break;
        case "KeyE":
            pos[1] += speed;
            break;

        case "Space":
            paint = true;
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

function clamp(num, min, max) {
    return ((num <= min) ? min : ((num >= max) ? max : num));
}

function init(vsSource, fsSource, gl, canvas) {
    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
    buffers = initBuffers(gl);

    const internalFormat = gl.RGBA;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    for (let i = 0; i < 64 * 64 * 64; i++) {
        //setElement(i, 255, i % 256, 255, ((i % 1000) < 800) * 255, pixels);
        setElement(i, 255, 255, 255, 0, 0, pixels);
    }

    noise.seed(Math.random());

    const frequency = 2.0;
    const fx = 64.0 / frequency;
    const fs = 128.0 / frequency;
    let x = 0, y = 0, z = 0;
    x *= 64;
    y *= 64;
    z *= 64;

    for (let _x = 0; _x < 64; _x++) {
        for (let _z = 0; _z < 64; _z++) {

            if (y < 128) {
                let surface = noise.simplex2((x + _x) / fs, (z + _z) / fs) * 16 + 48;

                for (let _y = 0; _y < 64; _y++) {
                    if (_y < surface) {
                        let value = noise.simplex3((x + _x) / fx, (y + _y) / fx, (z + _z) / fx) * 255;
                        let clp = clamp(value + 0, 0, 255);

                        let r = clamp(value, 20, 40) * 5, g = clamp(value, 20, 40) * 5, b = clamp(value, 20, 40) * 5;

                        // grass layer
                        if (_y > surface - 4) {
                            r = 0; b = 0;
                            g = clamp(value, 150, 200);
                        }

                        // dirt layer
                        else if (_y > surface - 8) {
                            g = 60; b = 0;
                            r = clamp(value, 90, 180);
                        }

                        if (clp > 0)
                            octree_set(_x, _y, _z, r, g, b, 255, 0, pixels);
                        else if (_y < 1) {
                            r = 0;
                            b = 240;
                            g = clamp((value + 255) / 2, 0, 240);
                            octree_set(_x, _y, _z, r, g, b, 255, 8, pixels);
                        }

                    }
                }
            } else { // clouds
                for (let _y = 32; _y < 64; _y++) {
                    let value = (noise.simplex3((x + _x) / 64, (y + _y) / 64, (z + _z) / 64, 6) * 255);
                    let clp = clamp(value - 200, 0, 1) * 255;

                    let r = value, g = value, b = value;

                    if (clp > 0)
                        octree_set(_x, _y, _z, r, g, b, 255, 0, pixels);
                }
            }
        }
    }

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

    //start render loop
    window.requestAnimationFrame(function (timestamp) {
        drawScene(gl, canvas, shaderProgram, 0.0, texture);
    });
}

function setElement(i, r, g, b, a, s, pixels) {
    pixels[i * 8] = r;
    pixels[i * 8 + 1] = g;
    pixels[i * 8 + 2] = b;
    pixels[i * 8 + 3] = a;
    pixels[i * 8 + 4] = s;
}

function octree_set( x, y, z, r, g, b, a, s, pixels) {
    // the offset into the tree
    var offset = 0;

    // copy iterator mask
    var depth = 6;
    var mask = 1 << (depth - 1);

    // iterate until the mask is shifted to target (leaf) layer
    while (mask) {

        // calculate the octant by decomposing the xyz to its binary form
        var octant = (
            !!(x & mask) * 1 +
            !!(y & mask) * 2 +
            !!(z & mask) * 4
        );

        pixels[offset * 8 + 3] |= 1 << octant;

        // shift the offset so that it aligns to the next layer
        offset <<= 3;

        // add octant id to the shifted offset, keep the octant id in range 1-8, not 0-7
        offset += octant + 1;

        // shift the mask
        mask >>= 1;

    }

    setElement( offset, r, g, b, a, s, pixels);

}

function updateCamera() {
    var x = mouseX, y = mouseY;
    var delta_x = +1.0 * (cursor[0] - x) * sensivity;
    var delta_y = -1.0 * (cursor[1] - y) * sensivity;
    cursor[0] = x;
    cursor[1] = y;

    x = angle[0] + delta_x;
    y = angle[1] + delta_y;

    // limit viewing angles
    if (y > +89.0) y = +89.0;
    if (y < -89.0) y = -89.0;

    angle[0] = x;
    angle[1] = y;

    // calculate rotation
    x = radians(x);
    y = radians(y);
    rotation[0] = x + radians(-90.0);
    rotation[1] = y;

    direction[0] = Math.cos(x) * Math.cos(y);
    direction[1] = -Math.sin(y);
    direction[2] = Math.sin(x) * Math.cos(y);
}

function drawScene(gl, canvas, shaderProgram, time, texture) {
    updateCamera();
    const scene = [
        pos[0], pos[1], pos[2],
        rotation[0], rotation[1], 0.0,
        0.0, 0.0, 0.0,
        0.0, 0.0, 0.0,
        3.0, 219.0, 252.0, //background
        1.2, 0.01, 100000.0 //projection (fov near far)
    ];

    var location = gl.getUniformLocation(shaderProgram, 'scene_data');
    gl.uniform3fv(location, scene);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (paint) {
        const pixel = new Uint8Array(4);
        gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        cursor3D[0] = Math.round((pos[0] + direction[0] * (pixel[3] / 2.0 - 0.1)) - 0.5) / 2;
        cursor3D[1] = Math.round((pos[1] + direction[1] * (pixel[3] / 2.0 - 0.1)) - 0.5) / 2;
        cursor3D[2] = Math.round((pos[2] + direction[2] * (pixel[3] / 2.0 - 0.1)) - 0.5) / 2;

        let r = brush.diameter / 2.0;
        if (brush.diameter > 4) {
            for (let x = -r; x < r; x++) {
                for (let y = -r; y < r; y++) {
                    for (let z = -r; z < r; z++) {
                        if (x * x + y * y + z * z < (r - 1.0) * (r - 1.0))
                            octree_set(cursor3D[0] + x, cursor3D[1] + y, cursor3D[2] + z, brush.color_r, brush.color_g, brush.color_b, 255, brush.clarity, pixels);
                    }
                }
            }
        }
        else {
            octree_set(cursor3D[0], cursor3D[1], cursor3D[2], brush.color_r, brush.color_g, brush.color_b, 255, brush.clarity, pixels);
        }

        const internalFormat = gl.RGBA;
        const srcFormat = gl.RGBA;
        const srcType = gl.UNSIGNED_BYTE;
        gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
            width, height, border, srcFormat, srcType,
            pixels);
        paint = false;
        console.log(pixel[3]);
    }

    window.requestAnimationFrame(function (timestamp) {
        document.getElementById('fps_counter').innerHTML = ('FPS:' + (1000.0 / (timestamp - time)));
        drawScene(gl, canvas, shaderProgram, timestamp);
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


