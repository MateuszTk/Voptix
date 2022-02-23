var gl;

function main() {
    const canvas = document.querySelector("#glCanvas");
    canvas.onmousedown = handleCanvasClick;
    let sw = localStorage.getItem("swidth");
    let sh = localStorage.getItem("sheight");

    if (sw && sh) {
        canvas.width = sw;
        canvas.height = sh;
    }

    // Initialize the GL context
    gl = canvas.getContext("webgl2");

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
var pos = glMatrix.vec3.fromValues(0, 65, 0);
var chunk_offset = glMatrix.vec3.fromValues(20, 0, 20);
var rotation = glMatrix.vec3.create();
var cursor = glMatrix.vec3.create();
var angle = glMatrix.vec3.create();

var cursor3D = glMatrix.vec3.create();
var paint = 0;
var brush = {diameter: 1, color_r: 255, color_g: 255, color_b: 255, clarity: 0, type: true};

const pixelsPerVoxel = 2;
const size = 64;
const pixels = [];
var textures = [];
const chunk_map = new Map;

const chunk_size = 299593 * 2;

var locked = false;
var brush_lock = true;

// vector representing where the camera is currently pointing
var direction = glMatrix.vec3.create();
const sensivity = 0.8;

window.onload = main;

document.addEventListener('pointerlockchange', lockChange, false);
document.addEventListener('mozpointerlockchange', lockChange, false);

function handleCanvasClick(event) {
    document.body.requestPointerLock();
    locked = true;
    brush_lock = true;
}

function lockChange() {
    if (!(document.pointerLockElement === document.body || document.mozPointerLockElement === document.body)) {
        locked = false;
        console.log('The pointer lock status is now unlocked');
    }
}

document.onmousemove = handleMouseMove;
function handleMouseMove(event) {
    if (locked) {
        mouseX += event.movementX;
        mouseY += event.movementY;
    }
}

document.onmousedown = handleMouseClick;
function handleMouseClick(event) {
    if (locked) {
        if (!brush_lock) {
            switch (event.button) {
                case 0:
                    paint = 1;
                    break;
                //sample color
                case 1:
                    event.preventDefault();
                    paint = 3;
                    break;
                case 2:
                    paint = 2;
                    break;
            }
        }
        else brush_lock = false;
    }
}

function save(name) {

    //first 4 bytes are the header describing the following chunk info length 
    let header = new Uint32Array(1 + 3 * chunk_map.size);
    header[0] = chunk_map.size;

    let chunk_no = 1;
    let continuous_data = [header];
    chunk_map.forEach((chunk, posi) => {
        const coord = posi.split(',').map((e) => parseInt(e));
        header[chunk_no] = coord[0];
        header[chunk_no + 1] = coord[1];
        header[chunk_no + 2] = coord[2];
        chunk_no += 3;
        for (const levels of chunk) {
            continuous_data.push(levels);
        }
    });

    var a = document.createElement('a');
    let blob = new Blob(continuous_data);
    a.href = URL.createObjectURL(blob);
    a.download = name + ".vx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function loadFile() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vx';

    input.onchange = e => {

        var file = e.target.files[0];

        var reader = new FileReader();
        reader.readAsArrayBuffer(file);

        reader.onload = readerEvent => {
            //delete all old chunks
            chunk_map.clear();
            glMatrix.vec3.set(chunk_offset, 20, 0, 20);
            pos = glMatrix.vec3.fromValues(0, 65, 0);
            pixels.splice(0, pixels.length);

            //load new chunks
            let continuous_data = new Uint8Array(readerEvent.target.result);
            let header_len = new Uint32Array(continuous_data.buffer, 0, 1);
            let header = new Uint32Array(continuous_data.buffer, 4, header_len * 3);
            console.log(header);

            let offset = 4 + header_len * 4 * 3;
            for (let c = 0; c < header_len; c++) {
                let chunk = [];
                let msize = size;
                let layer_offset = 0;
                for (let level = 0; level < 7; level++) {
                    chunk.push(new Uint8Array(continuous_data.buffer, offset + 4 * c * chunk_size + layer_offset, msize * msize * msize * pixelsPerVoxel * 4));
                    layer_offset += msize * msize * msize * pixelsPerVoxel * 4;
                    msize /= 2;
                }

                chunk_map.set([header[c * 3 + 0], header[c * 3 + 1], header[c * 3 + 2]].join(','), chunk);
            }

            //place loaded chunks or restore missing chunks nearby
            for (let x = 0; x < 3; x++) {
                for (let z = 0; z < 3; z++) {
                    let chunk = [];
                    let msize = size;
                    for (let level = 0; level < 7; level++) {
                        chunk.push(new Uint8Array(msize * msize * msize * pixelsPerVoxel * 4));
                        msize /= 2;
                    }
                    pixels.push(chunk_map.get([x + chunk_offset[0] - 1, 0, z + chunk_offset[2] - 1].join(',')));
                }
            }

            for (let x = 0; x < 3; x++) {
                for (let z = 0; z < 3; z++) {
                    generate_chunk(chunk_offset[0] + x - 1, 0, chunk_offset[2] + z - 1, gl, true, chunk_offset[0] + x - 1, 0, chunk_offset[2] + z - 1);
                }
            }
        }
    }
    input.click();
}

window.addEventListener("keydown", function (event) {
    if (locked) {
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
                paint = 1;
                break;

            case "Enter":
                document.exitPointerLock();
                break;

            default:
                break;
        }
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
    gl.bindTexture(gl.TEXTURE_3D, textures[i]);
    let msize = size;
    for (let c = 0; c < 7; c++) {
        gl.texImage3D(gl.TEXTURE_3D, c, internalFormat,
            msize * 2, msize, msize, 0, srcFormat, srcType,
            pixels[i][c]);
        msize /= 2;
    }
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
        //if chunk in this position was generated before, use it
        const svkey = [x, y, z];
        const sskey = svkey.join(',');
        if (chunk_map.has(sskey)) {

            pixels[i] = chunk_map.get(sskey);
            console.log("loaded");
            build_new = false;
        }
    }

    if (build_new) {
        
        let chunk = [];
        for (let lv = 0; lv < 7; lv++)
            chunk.push(new Uint8Array(pixels[i][lv]));
        chunk_map.set([x, y, z].join(','), chunk);

        for (let lv = 0; lv < 7; lv++) {
            chunk[lv].fill(0, 0, chunk[lv].length);
        }

        pixels[i] = chunk_map.get([x, y, z].join(','));

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
    for (let x = 0; x < 3; x++) {
        for (let z = 0; z < 3; z++) {
            let chunk = [];
            let msize = size;
            for (let level = 0; level < 7; level++) {
                chunk.push(new Uint8Array(msize * msize * msize * pixelsPerVoxel * 4));
                msize /= 2;
            }
            chunk_map.set([x + chunk_offset[0] - 1, 0, z + chunk_offset[2] - 1].join(','), chunk);
            pixels.push(chunk_map.get([x + chunk_offset[0] - 1, 0, z + chunk_offset[2] - 1].join(',')));
        }
    }

    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
    buffers = initBuffers(gl);

    for (let x = 0; x < 3; x++) {
        for (let z = 0; z < 3; z++) {
            generate_chunk(chunk_offset[0] + x - 1, 0, chunk_offset[2] + z - 1, gl, false, 0, 0, 0);
        }
    }

    var textureLoc = gl.getUniformLocation(shaderProgram, "u_textures[0]");
    // Tell the shader to use texture units 0 to pixel.length
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
        gl.bindTexture(gl.TEXTURE_3D, texture);
        textures.push(texture);
        gl.texImage3D(gl.TEXTURE_3D, 0, internalFormat,
            size * 2, size, size, 0, srcFormat, srcType,
            pixels[i][0]);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.generateMipmap(gl.TEXTURE_3D);
        let msize = size / 2;
        for (let c = 1; c < 7; c++) {
            gl.texImage3D(gl.TEXTURE_3D, c, internalFormat,
                msize * 2, msize, msize, 0, srcFormat, srcType,
                pixels[i][c]);
            msize /= 2;
        }
        gl.bindTexture(gl.TEXTURE_3D, texture);
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

function setElement(x, y, z, r, g, b, a, s, chunk, level, len) {
    let ind = (x + y * len + z * len * len) * 8;
    pixels[chunk][level][ind] = r;
    pixels[chunk][level][ind + 1] = g;
    pixels[chunk][level][ind + 2] = b;
    pixels[chunk][level][ind + 3] = a;
    pixels[chunk][level][ind + 4] = s;
}

function octree_set(x, y, z, r, g, b, a, s, chunk) {
    if (a > 0) {
        // iterate until the mask is shifted to target (leaf) layer
        let xo = 0, yo = 0, zo = 0;
        let pow2 = 1;
        let csize = 64;
        for (let depth = 0; depth < 6; depth++) {
            let ind = ((xo >> (6 - depth)) + (yo >> (6 - depth)) * pow2 + (zo >> (6 - depth)) * pow2 * pow2) * 8;

            csize /= 2;

            let oc = 0;

            xo += (((x >> (5 - depth)) & 1) > 0) * csize;
            yo += (((y >> (5 - depth)) & 1) > 0) * csize;
            zo += (((z >> (5 - depth)) & 1) > 0) * csize;
            oc = (((x >> (5 - depth)) & 1) * 1) + (((y >> (5 - depth)) & 1) * 2) + (((z >> (5 - depth)) & 1) * 4);
            pixels[chunk][6 - depth][ind + 3] |= 1 << oc;

            pixels[chunk][6 - depth][ind] = r;
            pixels[chunk][6 - depth][ind + 1] = g;
            pixels[chunk][6 - depth][ind + 2] = b;
            pixels[chunk][6 - depth][ind + 4] = s;

            pow2 *= 2;
        }
        setElement(x, y, z, r, g, b, a, s, chunk, 0, 64);
    }
    else {
        setElement(x, y, z, r, g, b, 0, s, chunk, 0, 64);
        let xo = x, yo = y, zo = z;
        let pow2 = 32;
        let cut_branches = true;
        for (let depth = 0; depth < 6; depth++) {
            
            xo >>= 1;
            yo >>= 1;
            zo >>= 1;
            oc = (((x >> depth) & 1) * 1) + (((y >> depth) & 1) * 2) + (((z >> depth) & 1) * 4);

            let ind = (xo + yo * pow2 + zo * pow2 * pow2) * 8;
            if (cut_branches)
                pixels[chunk][depth + 1][ind + 3] &= ~(1 << oc);
            if (pixels[chunk][depth + 1][ind + 3] != 0) cut_branches = false;
            pow2 /= 2;
        }
    }


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

    if (pos[0] > 32) {
        pos[0] -= 64;
        for (let z = 0; z < 3; z++)
            generate_chunk(chunk_offset[0] + 2, chunk_offset[1], chunk_offset[2] + z - 1, gl, true, chunk_offset[0] - 1, chunk_offset[1], chunk_offset[2] + z - 1);
        chunk_offset[0]++;
    }

    if (pos[2] > 32) {
        pos[2] -= 64;
        for (let x = 0; x < 3; x++)
            generate_chunk(chunk_offset[0] + x - 1, chunk_offset[1], chunk_offset[2] + 2, gl, true, chunk_offset[0] + x - 1, chunk_offset[1], chunk_offset[2] - 1);
        chunk_offset[2]++;
    }
    
    if (pos[0] < -32) {
        pos[0] += 64;
        for (let z = 0; z < 3; z++)
            generate_chunk(chunk_offset[0] - 2, chunk_offset[1], chunk_offset[2] + z - 1, gl, true, chunk_offset[0] + 1, chunk_offset[1], chunk_offset[2] + z - 1);
        chunk_offset[0]--;
    }

    if (pos[2] < -32) {
        pos[2] += 64;
        for (let x = 0; x < 3; x++)
            generate_chunk(chunk_offset[0] + x - 1, chunk_offset[1], chunk_offset[2] - 2, gl, true, chunk_offset[0] + x - 1, chunk_offset[1], chunk_offset[2] + 1);
        chunk_offset[2]--;
    }
}
var wait = 0;
var fps_time = 0;
function drawScene(gl, canvas, shaderProgram, time) {
    updateCamera(gl);
    const scene = [
        pos[0] + 64.0 + 32.0, pos[1], pos[2] + 64.0 + 32.0,
        rotation[0], rotation[1], 0.0,
        40 - chunk_offset[0], chunk_offset[1], 40 - chunk_offset[2],
        canvas.width, canvas.height, 0.0,
        3.0 / 255.0, 219.0 / 255.0, 252.0 / 255.0, //background
        1.2, 0.01, 100000.0 //projection (fov near far)
    ];

    var location = gl.getUniformLocation(shaderProgram, 'scene_data');
    gl.uniform3fv(location, scene);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (paint > 0) {
        const pixel = new Uint8Array(4);
        gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        if (paint == 3) {
            brush.color_r = pixel[0];
            brush.color_g = pixel[1];
            brush.color_b = pixel[2];
        }

        if (paint < 3) {
            if (paint == 1) {
                cursor3D[0] = Math.round((pos[0] + 64.0 + 32.0 + direction[0] * (pixel[3] / 2.0 - 0.1)) - 0.5);
                cursor3D[1] = Math.round((pos[1] + direction[1] * (pixel[3] / 2.0 - 0.1)) - 0.5);
                cursor3D[2] = Math.round((pos[2] + 64.0 + 32.0 + direction[2] * (pixel[3] / 2.0 - 0.1)) - 0.5);
            }
            else {
                cursor3D[0] = Math.round((pos[0] + 64.0 + 32.0 + direction[0] * (pixel[3] / 2.0 + 0.2)) - 0.5);
                cursor3D[1] = Math.round((pos[1] + direction[1] * (pixel[3] / 2.0 + 0.2)) - 0.5);
                cursor3D[2] = Math.round((pos[2] + 64.0 + 32.0 + direction[2] * (pixel[3] / 2.0 + 0.2)) - 0.5);
            }

            let chunks2send = new Map;
            let r = brush.diameter / 2.0;
            if (brush.diameter > 4) {
                for (let x = -r; x < r; x++) {
                    for (let y = -r; y < r; y++) {
                        for (let z = -r; z < r; z++) {
                            if (cursor3D[0] + x < 3 * 64 && cursor3D[2] + z < 3 * 64 && cursor3D[1] + y < 64 && cursor3D[0] + x >= 0 && cursor3D[2] + z >= 0 && cursor3D[1] + y >= 0) {
                                if (brush.type || (x * x + y * y + z * z < (r - 1.0) * (r - 1.0))) {
                                    let chunkid = Math.floor((cursor3D[0] + x + (chunk_offset[0] + 2) * 64) / 64) % 3 + Math.floor(((cursor3D[2] + z + (chunk_offset[2] + 2) * 64) / 64) % 3) * 3;
                                    octree_set(Math.floor(cursor3D[0] + x) % 64, Math.floor(cursor3D[1] + y) % 64, Math.floor(cursor3D[2] + z) % 64, brush.color_r, brush.color_g, brush.color_b, (paint == 1) ? 255 : 0, brush.clarity, chunkid);
                                    chunks2send.set(chunkid, 1);
                                }
                            }
                        }
                    }
                }
                chunks2send.forEach((val, chunk) => { send_chunk(chunk, gl); console.log(chunk) });
            }
            else {
                const cx = Math.floor(cursor3D[0] / 64);
                //const cy = Math.floor(cursor3D[1] / 64);
                const cz = Math.floor(cursor3D[2] / 64);
                if (cx < 3 && cz < 3 && cx >= 0 && cz >= 0) {
                    cursor3D[0] %= 64;
                    cursor3D[1] %= 64;
                    cursor3D[2] %= 64;
                    let chunkid = (cx + chunk_offset[0] + 2) % 3 + ((cz + chunk_offset[2] + 2) % 3) * 3;
                    octree_set(cursor3D[0], cursor3D[1], cursor3D[2], brush.color_r, brush.color_g, brush.color_b, (paint == 1) ? 255 : 0, brush.clarity, chunkid);
                    send_chunk(chunkid, gl);
                }
            }
        }
        paint = 0;
    }

    window.requestAnimationFrame(function (timestamp) {
        if (wait > 10) {
            document.getElementById('fps_counter').innerHTML = ('FPS:' + (10000.0 / fps_time));
            fps_time = 0;
            wait = 0;
        }
        else
            fps_time += timestamp - time;
        wait++;
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


