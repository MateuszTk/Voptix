
function main() {
    const canvas = document.querySelector("#glCanvas");
    let sw = localStorage.getItem("swidth");
    let sh = localStorage.getItem("sheight");

    if (sw && sh) {
        canvas.width = sw;
        canvas.height = sh;
    }

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
var pos = glMatrix.vec3.fromValues(0, 130, 0);
var chunk_offset = glMatrix.vec3.fromValues(20, 0, 20);
var rotation = glMatrix.vec3.create();
var cursor = glMatrix.vec3.create();
var angle = glMatrix.vec3.create();

var cursor3D = glMatrix.vec3.create();
var paint = false;
var brush = {diameter: 1, color_r: 255, color_g: 255, color_b: 255, clarity: 0};

const width = 560;
const pixelsPerVoxel = 2;
const height = 560 * pixelsPerVoxel;
const border = 0;
const pixels = [];
var textures = [];
const chunk_map = new Map;

// vector representing where the camera is currently pointing
var direction = glMatrix.vec3.create();

const sensivity = 0.8;

window.onload = main;

document.onmousemove = handleMouseMove;
function handleMouseMove(event) {
    mouseX += event.movementX;
    mouseY += event.movementY;
}

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

        case "Enter":
            document.body.requestPointerLock();
            break;

        default:
            break;
    }

}, true);

function resize(swidth, sheight) {
    localStorage.setItem("swidth", swidth);
    localStorage.setItem("sheight", sheight);
}


function clamp(num, min, max) {
    return ((num <= min) ? min : ((num >= max) ? max : num));
}

function send_chunk(i, gl) {
    const internalFormat = gl.RGBA;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, textures[i]);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat,
        width, height, border, srcFormat, srcType,
        pixels[i]);
}


function generate_chunk(x, y, z, gl, send, sendx, sendy, sendz) {
    console.log("x" + x + " y" + y + " z" + z);

    noise.seed(8888);//Math.random());
    const frequency = 2.0;
    const fx = 64.0 / frequency;
    const fs = 128.0 / frequency;
    let build_new = true;
    let i = (x % 3) + (z % 3) * 3;
    if (send) {
        //save old chunk
        chunk_map.set([sendx, sendy, sendz].join(','), new Uint8Array(pixels[(sendx % 3) + (sendz % 3) * 3]));
        //console.log("saved");
        const svkey = [x, y, z];
        const sskey = svkey.join(',');
        if (chunk_map.has(sskey)) {

            pixels[i] = chunk_map.get(sskey);
            console.log("loaded");
            build_new = false;
        }
    }
    if (build_new) {
        x *= 64;
        y *= 64;
        z *= 64;

        for (let j = 0; j < 64 * 64 * 64; j++) {
            setElement(j, 255, 255, 255, 0, 0, i);
        }

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
                                octree_set(_x, _y, _z, r, g, b, 255, 0, i);
                            else if (_y < 1) {
                                r = 0;
                                b = 240;
                                g = clamp((value + 255) / 2, 0, 240);
                                octree_set(_x, _y, _z, r, g, b, 255, 8, i);
                            }

                        }
                    }
                } else { // clouds
                    for (let _y = 32; _y < 64; _y++) {
                        let value = (noise.simplex3((x + _x) / 64, (y + _y) / 64, (z + _z) / 64, 6) * 255);
                        let clp = clamp(value - 200, 0, 1) * 255;

                        let r = value, g = value, b = value;

                        if (clp > 0)
                            octree_set(_x, _y, _z, r, g, b, 255, 0, i);
                    }
                }
            }
        }
    }
    if (send) {
        i = (sendx % 3) + (sendz % 3) * 3;
        send_chunk(i, gl);
    }
}

function init(vsSource, fsSource, gl, canvas) {
    for (let i = 0; i < 9; i++)
        pixels.push(new Uint8Array(width * height * 4));

    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
    buffers = initBuffers(gl);

    for (let x = 0; x < 3; x++) {
        for (let z = 0; z < 3; z++) {
            generate_chunk(chunk_offset[0] + x - 1, 0, chunk_offset[2] + z - 1, gl, false, 0, 0, 0);
        }
    }

    var textureLoc = gl.getUniformLocation(shaderProgram, "u_textures[0]");
    // Tell the shader to use texture units 0 to 1
    let tex_uni = [0];
    for (let j = 1; j < pixels.length; j++)
        tex_uni.push(j);
    gl.uniform1iv(textureLoc, tex_uni);

    const internalFormat = gl.RGBA;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    for (let i = 0; i < pixels.length; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        textures.push(texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat,
            width, height, border, srcFormat, srcType,
            pixels[i]);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.generateMipmap(gl.TEXTURE_2D);
    }

    // Get the attribute location
    var coord = gl.getAttribLocation(shaderProgram, "coordinates");

    // Point an attribute to the currently bound VBO
    gl.vertexAttribPointer(coord, 2, gl.FLOAT, false, 0, 0);

    // Enable the attribute
    gl.enableVertexAttribArray(coord);

    //start render loop
    window.requestAnimationFrame(function (timestamp) {
        drawScene(gl, canvas, shaderProgram, 0.0);
    });
}

function setElement(i, r, g, b, a, s, chunk) {
    pixels[chunk][i * 8] = r;
    pixels[chunk][i * 8 + 1] = g;
    pixels[chunk][i * 8 + 2] = b;
    pixels[chunk][i * 8 + 3] = a;
    pixels[chunk][i * 8 + 4] = s;
}

function octree_set( x, y, z, r, g, b, a, s, chunk) {
    // the offset into the tree
    let offset = 0;

    // copy iterator mask
    let depth = 6;
    let mask = 1 << (depth - 1);

    // iterate until the mask is shifted to target (leaf) layer
    while (mask) {

        // calculate the octant by decomposing the xyz to its binary form
        var octant = (
            !!(x & mask) * 1 +
            !!(y & mask) * 2 +
            !!(z & mask) * 4
        );

        pixels[chunk][offset * 8 + 3] |= 1 << octant;

        // shift the offset so that it aligns to the next layer
        offset <<= 3;

        // add octant id to the shifted offset, keep the octant id in range 1-8, not 0-7
        offset += octant + 1;

        // shift the mask
        mask >>= 1;

    }

    setElement( offset, r, g, b, a, s, chunk);

}

function updateCamera(gl) {
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

    if (pos[0] > 64) {
        pos[0] -= 128;
        for (let z = 0; z < 3; z++)
            generate_chunk(chunk_offset[0] + 2, chunk_offset[1], chunk_offset[2] + z - 1, gl, true, chunk_offset[0] - 1, chunk_offset[1], chunk_offset[2] + z - 1);
        chunk_offset[0]++;
    }

    if (pos[2] > 64) {
        pos[2] -= 128;
        for (let x = 0; x < 3; x++)
            generate_chunk(chunk_offset[0] + x - 1, chunk_offset[1], chunk_offset[2] + 2, gl, true, chunk_offset[0] + x - 1, chunk_offset[1], chunk_offset[2] - 1);
        chunk_offset[2]++;
    }
    
    if (pos[0] < -64) {
        pos[0] += 128;
        for (let z = 0; z < 3; z++)
            generate_chunk(chunk_offset[0] - 2, chunk_offset[1], chunk_offset[2] + z - 1, gl, true, chunk_offset[0] + 1, chunk_offset[1], chunk_offset[2] + z - 1);
        chunk_offset[0]--;
    }

    if (pos[2] < -64) {
        pos[2] += 128;
        for (let x = 0; x < 3; x++)
            generate_chunk(chunk_offset[0] + x - 1, chunk_offset[1], chunk_offset[2] - 2, gl, true, chunk_offset[0] + x - 1, chunk_offset[1], chunk_offset[2] + 1);
        chunk_offset[2]--;
    }
}

function drawScene(gl, canvas, shaderProgram, time) {
    updateCamera(gl);
    const scene = [
        pos[0] + 128.0 + 64.0, pos[1], pos[2] + 128.0 + 64.0,
        rotation[0], rotation[1], 0.0,
        40 - chunk_offset[0], chunk_offset[1], 40 - chunk_offset[2],
        canvas.width, canvas.height, 0.0,
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
        cursor3D[0] = Math.round((pos[0] + 128.0 + 64.0 + direction[0] * (pixel[3] / 2.0 - 0.1)) - 0.5) / 2;
        cursor3D[1] = Math.round((pos[1] + direction[1] * (pixel[3] / 2.0 - 0.1)) - 0.5) / 2;
        cursor3D[2] = Math.round((pos[2] + 128.0 + 64.0 + direction[2] * (pixel[3] / 2.0 - 0.1)) - 0.5) / 2;
        const cx = Math.floor(cursor3D[0] / 64);
        //const cy = Math.floor(cursor3D[1] / 64);
        const cz = Math.floor(cursor3D[2] / 64);
        cursor3D[0] %= 64;
        cursor3D[1] %= 64;
        cursor3D[2] %= 64;
        let chunkid = (cx + chunk_offset[0] + 2) % 3 + ((cz + chunk_offset[2] + 2) % 3) * 3;
        if (cx < 3 && cz < 3 && cx >= 0 && cz >= 0) {
            let r = brush.diameter / 2.0;
            if (brush.diameter > 4) {
                for (let x = -r; x < r; x++) {
                    for (let y = -r; y < r; y++) {
                        for (let z = -r; z < r; z++) {
                            if (x * x + y * y + z * z < (r - 1.0) * (r - 1.0))
                                octree_set(cursor3D[0] + x, cursor3D[1] + y, cursor3D[2] + z, brush.color_r, brush.color_g, brush.color_b, 255, brush.clarity, chunkid);
                        }
                    }
                }
            }
            else {
                octree_set(cursor3D[0], cursor3D[1], cursor3D[2], brush.color_r, brush.color_g, brush.color_b, 255, brush.clarity, chunkid);
            }

            send_chunk(chunkid, gl);
        }
        paint = false;
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


