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

    initBlockPicker();

    fetch('./shader/vertex_shader.glsl').then((response) => response.text()).then((vertex) => {
        fetch('./shader/fragment_shader.glsl').then((response2) => response2.text()).then((fragment) => {
            fetch('./shader/post-processing.glsl').then((pp_response2) => pp_response2.text()).then((pp_fragment) => {
                fetch('./shader/display.glsl').then((disp_response2) => disp_response2.text()).then((disp_fragment) => {
                    init(vertex, fragment, gl, canvas, pp_fragment, disp_fragment);
                });
            });
        });
    });

}

var mouseX = 0, mouseY = 0;
var pos = glMatrix.vec3.fromValues(0, 65, 0);
var chunk_offset = glMatrix.vec3.fromValues(20, 0, 20);
var vec3_minus_one = glMatrix.vec3.fromValues(-1.0, -1.0, -1.0);
var rotation = glMatrix.vec3.create();
var cursor = glMatrix.vec3.create();
var angle = glMatrix.vec3.create();

var cursor3D = glMatrix.vec3.create();
var paint = 0;
var brush = { diameter: 1, color_r: 255, color_g: 255, color_b: 255, clarity: 0, emission: 0, palette_id: 0, variant: 0, type: true };
var subvoxel_paint = false;

const pixelsPerVoxel = 1;
const size = 128;
const subSize = 8;
const subOctreeDepth = 3;
var pixels = [];
var textures = [];
var pal_texture;
var palette = [];
const pal_size = 256;
const pal_pix_cnt = 2;
const pal_variants = 8;
const chunk_map = new Map;

var fb_textures = [];
var fb;
var pp_fb;
var fb_pixels; //uint8array

const octree_depth = 7;
const chunk_size = ((1 - Math.pow(8, (octree_depth + 1))) / -7) * pixelsPerVoxel;

var locked = false;
var brush_lock = true;

var prev_rotation = glMatrix.vec3.create();
var prev_position = glMatrix.vec3.create();

var deltaTime = 0;

window.onload = main;

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
        continuous_data.push(chunk[0]);
    });

    var a = document.createElement('a');
    let blob = new Blob(continuous_data);
    a.href = URL.createObjectURL(blob);
    a.download = name + ".vx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function save_palette(name) {
    let continuous_data = [];
    let pal_header = new Uint32Array(4);
    pal_header[0] = pal_size;     //x
    pal_header[1] = pal_pix_cnt;  //y
    pal_header[2] = pal_variants; //z
    pal_header[3] = 8;            //edge length
    continuous_data.push(pal_header);
    for (let level = 0; level < 4; level++) {
        continuous_data.push(palette[level]);
    }

    var p = document.createElement('a');
    let pal_blob = new Blob(continuous_data);
    p.href = URL.createObjectURL(pal_blob);
    p.download = name + ".vp";
    document.body.appendChild(p);
    p.click();
    document.body.removeChild(p);
}

function loadFile() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = ['.vx', '.vp'];
    input.multiple = 'multiple';

    input.onchange = e => {
        const files = e.target.files;
        for (const file of files) {
            let f_extension = file.name.split('.').pop();

            var reader = new FileReader();
            reader.readAsArrayBuffer(file);

            reader.onload = readerEvent => {
                let continuous_data = new Uint8Array(readerEvent.target.result);
                if (f_extension == 'vx') {
                    //delete all old chunks
                    chunk_map.clear();
                    glMatrix.vec3.set(chunk_offset, 20, 0, 20);
                    pos = glMatrix.vec3.fromValues(0, 65, 0);
                    pixels.splice(0, pixels.length);

                    //load new chunks
                    let header_len = new Uint32Array(continuous_data.buffer, 0, 1);
                    let header = new Uint32Array(continuous_data.buffer, 4, header_len * 3);
                    console.log(header);

                    let offset = 4 + header_len * 4 * 3;
                    for (let c = 0; c < header_len; c++) {
                        let chunk = [];
                        let msize = size;
                        for (let level = 0; level < octree_depth + 1; level++) {
                            chunk.push(new Uint8Array(msize * msize * msize * pixelsPerVoxel * 4));
                            msize /= 2;
                        }

                        for (let vx = 0; vx < size; vx++) {
                            for (let vy = 0; vy < size; vy++) {
                                for (let vz = 0; vz < size; vz++) {
                                    let id = (vx + (vy + vz * size) * size) * 4;
                                    chunk_octree_set(vx, vy, vz, continuous_data[offset + id], 255, continuous_data[offset + id + 2], continuous_data[offset + id + 3], chunk);
                                }
                            }
                        }
                        offset += size * size * size * 4;
                        chunk_map.set([header[c * 3 + 0], header[c * 3 + 1], header[c * 3 + 2]].join(','), chunk);
                    }

                    //place loaded chunks or restore missing chunks nearby
                    for (let x = 0; x < 3; x++) {
                        for (let z = 0; z < 3; z++) {
                            let chunk = [];
                            let msize = size;
                            for (let level = 0; level < octree_depth + 1; level++) {
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
                else if (f_extension == 'vp') {
                    let pal_header = new Uint32Array(continuous_data.buffer, 0, 4);
                    let pal_x = pal_header[0];
                    let pal_y = pal_header[1];
                    let pal_z = pal_header[2];
                    let pal_edge = pal_header[3];
                    let offset = 4 * 4;

                    let msize = pal_edge;
                    for (let level = 0; level < 4; level++) {
                        let lay_size = msize * msize * msize * pal_x * pal_y * pal_z * 4;
                        palette[level] = new Uint8Array(continuous_data.buffer, offset, lay_size);
                        offset += lay_size;
                        msize /= 2;
                    }

                    updatePalette();
                }
                else {
                    console.log("Unknown file extension");
                }
            }
        }
    }
    input.click();
}

function send_chunk(i, gl, x0, y0, z0, x1, y1, z1) {
    const internalFormat = gl.RGBA;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_3D, textures[i]);
    let msize = size;
    for (let c = 0; c < octree_depth + 1; c++) {
       /* gl.texImage3D(gl.TEXTURE_3D, c, internalFormat,
            msize * pixelsPerVoxel, msize, msize, 0, srcFormat, srcType,
            pixels[i][c]);*/
        gl.texSubImage3D(gl.TEXTURE_3D, c, x0, y0, z0, Math.abs(x0 - x1) + 1, Math.abs(y0 - y1) + 1, Math.abs(z0 - z1) + 1, internalFormat, srcType,
            pixels[i][c]);
        x0 = Math.floor(x0 / 2);
        y0 = Math.floor(y0 / 2);
        z0 = Math.floor(z0 / 2);
        x1 = Math.floor(x1 / 2);
        y1 = Math.floor(y1 / 2);
        z1 = Math.floor(z1 / 2);
        msize /= 2;
    }
}

function updatePalette() {
    const internalFormat = gl.RGBA;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    gl.activeTexture(gl.TEXTURE0 + 11);
    gl.bindTexture(gl.TEXTURE_3D, pal_texture);
    
    //edge 2 ^ 3 = 8 voxels
    let msize = 8;
    let palette_oc_depth = 3;
    for (let c = 0; c <= palette_oc_depth; c++) {
        gl.texImage3D(gl.TEXTURE_3D, c, internalFormat,
            msize * pal_size, msize * pal_pix_cnt, msize * pal_variants, 0, srcFormat, srcType,
            palette[c]);
        msize /= 2;
    }

    generatePreviews();
    displayPreviews();
}


var copied = [brush.palette_id, brush.variant];
function copy() {
    copied = [brush.palette_id, brush.variant];
    console.log(copied);
}

function paste() {
    if (brush.variant < 8 && copied[1] < 8) {
        console.log([brush.palette_id, brush.variant]);
        for (let x = 0; x < 8; x++) {
            for (let y = 0; y < 8; y++) {
                for (let z = 0; z < 8; z++) {
                    let voxA = palGetElement(x, y, z, copied[0], 0, copied[1]);
                    let voxB = palGetElement(x, y, z, copied[0], 1, copied[1]);
                    pal_octree_set(x, y, z, voxA[0], voxA[1], voxA[2], voxA[3], voxB[0], voxB[1], brush.palette_id, brush.variant);
                }
            }
        }
        updatePalette();
    }
    else {
        console.log('Cannot copy animation!');
    }
}


function generate_chunk(x, y, z, gl, send, sendx, sendy, sendz) {
    console.log("x" + x + " y" + y + " z" + z);
    let timer_start = Date.now();
   
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
        for (let lv = 0; lv < octree_depth + 1; lv++)
            chunk.push(new Uint8Array(pixels[i][lv]));
        chunk_map.set([x, y, z].join(','), chunk);

        for (let lv = 0; lv < octree_depth + 1; lv++) {
            chunk[lv].fill(0, 0, chunk[lv].length);
        }

        pixels[i] = chunk_map.get([x, y, z].join(','));

        x *= size;
        y *= size;
        z *= size;

        chunkFunction(x, y, z, size, i);
    }
    if (send) {
        i = (sendx % 3) + (sendz % 3) * 3;
        send_chunk(i, gl, 0, 0, 0, size - 1, size - 1, size - 1);
    }

    console.log("Took " + (Date.now() - timer_start) + "ms");
}

function init(vsSource, fsSource, gl, canvas, pp_fragment, disp_fragment) {
    for (let x = 0; x < 3; x++) {
        for (let z = 0; z < 3; z++) {
            let chunk = [];
            let msize = size;
            for (let level = 0; level <= octree_depth; level++) {
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

    //lighting data from previous frame
    var textureLoc0 = gl.getUniformLocation(shaderProgram, "noise");
    //pixels.length - texture unit number
    gl.uniform1i(textureLoc0, pixels.length);
    gl.activeTexture(gl.TEXTURE0 + pixels.length);
    const prev_frame = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, prev_frame);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    //lighting data from previous frame
    var textureLoc2 = gl.getUniformLocation(shaderProgram, "light_low");
    //pixels.length - texture unit number
    gl.uniform1i(textureLoc2, pixels.length + 2);
    gl.activeTexture(gl.TEXTURE0 + pixels.length + 2);
    const light_low = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, light_low);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);


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
            size * pixelsPerVoxel, size, size, 0, srcFormat, srcType,
            pixels[i][0]);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.generateMipmap(gl.TEXTURE_3D);
        let msize = size / 2;
        for (let c = 1; c <= octree_depth; c++) {
            gl.texImage3D(gl.TEXTURE_3D, c, internalFormat,
                msize * pixelsPerVoxel, msize, msize, 0, srcFormat, srcType,
                pixels[i][c]);
            msize /= 2;
        }
        gl.bindTexture(gl.TEXTURE_3D, texture);
    }

    //voxel palette
    var textureLocPal = gl.getUniformLocation(shaderProgram, "u_palette");
    //pixels.length + 1, because we want to use texture unit after chunk data (pixels.length) and previous frame data (+1)
    //TODO - pixels.length is probably equal to 10 which means I use 3 more texture units over count guaranteed by specification
    gl.uniform1i(textureLocPal, pixels.length + 1);
    gl.activeTexture(gl.TEXTURE0 + pixels.length + 1);
    pal_texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, pal_texture);

    let msize = subSize;
    //edge 2 ^ 3 = 8 voxels
    let palette_oc_depth = 3;
    for (let c = 0; c <= palette_oc_depth; c++) {
        palette.push(new Uint8Array(msize * msize * msize * 4 * pal_size * pal_pix_cnt * pal_variants));
        //palette[c].fill(0xff, 0, msize * msize * msize * 4 * 256);
        msize /= 2;
    }

    gl.texImage3D(gl.TEXTURE_3D, 0, internalFormat,
        8 * pal_size, 8 * pal_pix_cnt, 8 * pal_variants, 0, srcFormat, srcType,
        palette[0]);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.generateMipmap(gl.TEXTURE_3D);
   

    msize = subSize;
    for (let c = 0; c <= palette_oc_depth; c++) {
        gl.texImage3D(gl.TEXTURE_3D, c, internalFormat,
            msize * pal_size, msize * pal_pix_cnt, msize * pal_variants, 0, srcFormat, srcType,
            palette[c]);
        msize /= 2;
    }
    gl.bindTexture(gl.TEXTURE_3D, pal_texture);

    // Get the attribute location
    var coord = gl.getAttribLocation(shaderProgram, "coordinates");

    // Point an attribute to the currently bound VBO
    gl.vertexAttribPointer(coord, 2, gl.FLOAT, false, 0, 0);

    // Enable the attribute
    gl.enableVertexAttribArray(coord);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    fb_textures.push(texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const texture1 = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    fb_textures.push(texture1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const texture2 = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    fb_textures.push(texture2);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, texture1, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, texture2, 0);

    gl.drawBuffers([
        gl.COLOR_ATTACHMENT0,
        gl.COLOR_ATTACHMENT1,
        gl.COLOR_ATTACHMENT2
    ]);


    //----shader program for post-processing----//
    const canvasShaderProgram = initShaderProgram(gl, vsSource, pp_fragment);
    initBuffers(gl);
    const colorLoc = gl.getUniformLocation(canvasShaderProgram, "color[0]");
    gl.uniform1iv(colorLoc, [0,1,2]);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fb_textures[0]);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fb_textures[1]);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, fb_textures[2]);

    //output for pp
    const texture3 = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture3);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    fb_textures.push(texture3);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    //bind otuput for pp and last frame
    pp_fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, pp_fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture3, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, prev_frame, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, light_low, 0);
    fb_textures.push(prev_frame);
    fb_textures.push(light_low);

    gl.drawBuffers([
        gl.COLOR_ATTACHMENT0,
        gl.COLOR_ATTACHMENT1,
        gl.COLOR_ATTACHMENT2
    ]);

    const location = gl.getUniformLocation(canvasShaderProgram, 'screen_size');
    gl.uniform2f(location, canvas.width, canvas.height);


    //----shader program for display----//
    const dispShaderProgram = initShaderProgram(gl, vsSource, disp_fragment);
    initBuffers(gl);
    const dispcolorLoc = gl.getUniformLocation(dispShaderProgram, "color");
    gl.uniform1i(dispcolorLoc, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture3);

    const disp_location = gl.getUniformLocation(dispShaderProgram, 'screen_size');
    gl.uniform2f(disp_location, canvas.width, canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    fb_pixels = new Uint8Array(4 * canvas.width * canvas.height);

    //call start in worldgen.js
    start();

    //start render loop
    window.requestAnimationFrame(function (timestamp) {
        drawScene(gl, canvas, shaderProgram, canvasShaderProgram, dispShaderProgram, 0.0);
    });
}

function addToPalette(r, g, b, s, e, slot) {
    console.log(brush.color_r);
    console.log(brush.color_g);
    console.log(brush.color_b);
    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            for (let z = 0; z < 8; z++) {
                pal_octree_set(x, y, z, r, g, b, 255, s, e, slot, brush.variant);
            }
        }
    }
    updatePalette();
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

    if (pos[0] > 0.5 * size) {
        pos[0] -= size;
        for (let z = 0; z < 3; z++)
            generate_chunk(chunk_offset[0] + 2, chunk_offset[1], chunk_offset[2] + z - 1, gl, true, chunk_offset[0] - 1, chunk_offset[1], chunk_offset[2] + z - 1);
        chunk_offset[0]++;
    }

    if (pos[2] > 0.5 * size) {
        pos[2] -= size;
        for (let x = 0; x < 3; x++)
            generate_chunk(chunk_offset[0] + x - 1, chunk_offset[1], chunk_offset[2] + 2, gl, true, chunk_offset[0] + x - 1, chunk_offset[1], chunk_offset[2] - 1);
        chunk_offset[2]++;
    }

    if (pos[0] < - 0.5 * size) {
        pos[0] += size;
        for (let z = 0; z < 3; z++)
            generate_chunk(chunk_offset[0] - 2, chunk_offset[1], chunk_offset[2] + z - 1, gl, true, chunk_offset[0] + 1, chunk_offset[1], chunk_offset[2] + z - 1);
        chunk_offset[0]--;
    }

    if (pos[2] < - 0.5 * size) {
        pos[2] += size;
        for (let x = 0; x < 3; x++)
            generate_chunk(chunk_offset[0] + x - 1, chunk_offset[1], chunk_offset[2] - 2, gl, true, chunk_offset[0] + x - 1, chunk_offset[1], chunk_offset[2] + 1);
        chunk_offset[2]--;
    }
}
var wait = 0;
var fps_time = 0;
var pixel = new Uint8Array(4);
var chunk_id_map = [0, 1, 2,
    3, 4, 5,
    6, 7, 8];

var fill = vec3_minus_one;

var frame = 0.0;
var animationTime = 0;
setInterval(function () {
    animationTime = (animationTime + 1) % 8;
}, 250);

function drawScene(gl, canvas, shaderProgram, canvasShaderProgram, dispShaderProgram, time) {
    updateCamera(gl);
    const scene = [
        (pos[0] + 1.5 * size) * subSize, (pos[1]) * subSize, (pos[2] + 1.5 * size) * subSize,
        rotation[0], rotation[1], animationTime,
        40 - chunk_offset[0], chunk_offset[1], 40 - chunk_offset[2],
        canvas.width, canvas.height, frame,
        3.0 / 255.0, 219.0 / 255.0, 252.0 / 255.0, //background
        1.2, 0.01, 100000.0, //projection (fov near far)
        (prev_position[0] + 1.5 * size) * subSize, (prev_position[1]) * subSize, (prev_position[2] + 1.5 * size) * subSize,
        prev_rotation[0], prev_rotation[1], prev_rotation[2]
    ];
    frame += 0.5;
    if (frame >= 0xffffff) frame = 0.0;
    prev_rotation = glMatrix.vec3.clone(rotation);
    prev_position = glMatrix.vec3.clone(pos);

    gl.useProgram(shaderProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

    var location = gl.getUniformLocation(shaderProgram, 'scene_data');
    gl.uniform3fv(location, scene);

    for (let x = 0; x < 3; x++) {
        for (let z = 0; z < 3; z++) {
            chunk_id_map[x + z * 3] = (x + chunk_offset[0] + 2) % 3 + ((z + chunk_offset[2] + 2) % 3) * 3;
        }
    }
    var map_location = gl.getUniformLocation(shaderProgram, 'chunk_map');
    gl.uniform3iv(map_location, chunk_id_map);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    if (paint > 0) {
        gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);       
    }

    //post-processing
    gl.useProgram(canvasShaderProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pp_fb);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fb_textures[0]);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fb_textures[1]);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, fb_textures[2]);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    //draw to display
    gl.useProgram(dispShaderProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fb_textures[3]);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (paint > 0) {
        if (subvoxel_paint) {
            //place voxel
            let offset = 0.0;
            let smallSize = subSize * size;
            let parentVox = [-1, -1, -1, -1];
            //try moving cursor up to 8 times
            for (let it = 0; it < 8; it++) {
                cursor3D[0] = Math.round((pos[0] * 8.0 + 1.5 * smallSize + direction[0] * (pixel[3] / 2.0 + offset)) - 0.5);
                cursor3D[1] = Math.round((pos[1] * 8.0 + direction[1] * (pixel[3] / 2.0 + offset)) - 0.5);
                cursor3D[2] = Math.round((pos[2] * 8.0 + 1.5 * smallSize + direction[2] * (pixel[3] / 2.0 + offset)) - 0.5);

                const cx = Math.floor(cursor3D[0] / smallSize);
                const cz = Math.floor(cursor3D[2] / smallSize);
                if (cx < 3 && cz < 3 && cx >= 0 && cz >= 0) {
                    let chunkid = (cx + chunk_offset[0] + 2) % 3 + ((cz + chunk_offset[2] + 2) % 3) * 3;
                    parentVox = getElement(Math.floor(cursor3D[0] / 8) % size, Math.floor(cursor3D[1] / 8) % size, Math.floor(cursor3D[2] / 8) % size, chunkid, 0, size);

                    if (paint == 1 || paint == 3 || paint == 4) {
                        //place voxel
                        if (parentVox[3] > 0 && palGetElement(cursor3D[0] % 8, cursor3D[1] % 8, cursor3D[2] % 8, parentVox[0], 0, parentVox[2])[3] > 0) {
                            offset -= 0.1;
                        }
                        else
                            break;
                    }
                    else {
                        //delete voxel
                        if (parentVox[3] <= 0 || palGetElement(cursor3D[0] % 8, cursor3D[1] % 8, cursor3D[2] % 8, parentVox[0], 0, parentVox[2])[3] <= 0) {
                            offset += 0.1;
                        }
                        else {
                            break;
                        }
                    }
                }
                else {
                    break;
                }
            }
            if (parentVox[3] > 0) {
                pal_octree_set(cursor3D[0] % 8, cursor3D[1] % 8, cursor3D[2] % 8, brush.color_r, brush.color_g, brush.color_b, (paint == 1) ? 255 : 0, brush.clarity, brush.emission, parentVox[0], parentVox[2]);
                updatePalette();
            }
        }
        else {
            if (paint <= 5) {
                pixel[3] /= subSize;
                //place voxel
                let offset = 0.0;
                let pick = -1;
                //try moving cursor up to 8 times
                for (let it = 0; it < 8; it++) {
                    cursor3D[0] = Math.round((pos[0] + 1.5 * size + direction[0] * (pixel[3] / 2.0 + offset)) - 0.5);
                    cursor3D[1] = Math.round((pos[1] + direction[1] * (pixel[3] / 2.0 + offset)) - 0.5);
                    cursor3D[2] = Math.round((pos[2] + 1.5 * size + direction[2] * (pixel[3] / 2.0 + offset)) - 0.5);

                    const cx = Math.floor(cursor3D[0] / size);
                    const cz = Math.floor(cursor3D[2] / size);
                    if (cx < 3 && cz < 3 && cx >= 0 && cz >= 0) {
                        let chunkid = (cx + chunk_offset[0] + 2) % 3 + ((cz + chunk_offset[2] + 2) % 3) * 3;
                        if (paint == 1 || paint == 3 || paint == 4) {
                            //place voxel
                            if (getElement(cursor3D[0] % size, cursor3D[1] % size, cursor3D[2] % size, chunkid, 0, size)[3] > 0) {
                                offset -= 0.1;
                            }
                            else
                                break;
                        }
                        else {
                            //delete voxel
                            if (paint == 5) {
                                let element = getElement(cursor3D[0] % size, cursor3D[1] % size, cursor3D[2] % size, chunkid, 0, size);
                                pick = element[0];
                                pickVariant = element[2];
                            }

                            if (getElement(cursor3D[0] % size, cursor3D[1] % size, cursor3D[2] % size, chunkid, 0, size)[3] <= 0) {
                                offset += 0.1;
                            }
                            else {
                                break;
                            }
                        }
                    }
                    else {
                        break;
                    }
                }

                //pick color
                if (paint == 5) {
                    if (pick >= 0) {
                        brush.palette_id = pick;
                        brush.variant = pickVariant;
                        console.log('picked: ' + pick);
                        updateSliders();
                    }
                }
                else {

                    let chunks2send = new Map;

                    //fill with voxels or void
                    if (paint == 3 || paint == 4) {
                        if (fill != vec3_minus_one) {
                            console.log("P1:" + cursor3D);
                            let xstart = Math.min(fill[0], cursor3D[0]);
                            let ystart = Math.min(fill[1], cursor3D[1]);
                            let zstart = Math.min(fill[2], cursor3D[2]);
                            for (let x = xstart; x <= Math.max(fill[0], cursor3D[0]); x++) {
                                for (let y = ystart; y <= Math.max(fill[1], cursor3D[1]); y++) {
                                    for (let z = zstart; z <= Math.max(fill[2], cursor3D[2]); z++) {
                                        if (x < 3 * size && z < 3 * size && y < size && x >= 0 && z >= 0 && y >= 0) {
                                            let chunkid = Math.floor((x + (chunk_offset[0] + 2) * size) / size) % 3 + Math.floor(((z + (chunk_offset[2] + 2) * size) / size) % 3) * 3;
                                            if (paint == 3)
                                                octree_set(Math.floor(x) % size, Math.floor(y) % size, Math.floor(z) % size, brush.palette_id, 255, brush.variant, 255, chunkid);
                                            else
                                                octree_set(Math.floor(x) % size, Math.floor(y) % size, Math.floor(z) % size, brush.palette_id, 255, brush.variant, 0, chunkid);
                                            chunks2send.set(chunkid, 1);
                                        }
                                    }
                                }
                            }
                            chunks2send.forEach((val, chunk) => { send_chunk(chunk, gl, 0, 0, 0, size - 1, size - 1, size - 1); console.log(chunk) });

                            fill = vec3_minus_one;
                            paint = 0;
                        }
                        else {
                            fill = glMatrix.vec3.clone(cursor3D);
                            console.log("P0:" + fill);
                        }
                    }
                    else
                        fill = vec3_minus_one;

                    if (paint > 0) {
                        let r = brush.diameter / 2.0;
                        if (brush.diameter > 4) {
                            for (let x = -r; x < r; x++) {
                                for (let y = -r; y < r; y++) {
                                    for (let z = -r; z < r; z++) {
                                        if (cursor3D[0] + x < 3 * size && cursor3D[2] + z < 3 * size && cursor3D[1] + y < size && cursor3D[0] + x >= 0 && cursor3D[2] + z >= 0 && cursor3D[1] + y >= 0) {
                                            if (brush.type || (x * x + y * y + z * z < (r - 1.0) * (r - 1.0))) {
                                                let chunkid = Math.floor((cursor3D[0] + x + (chunk_offset[0] + 2) * size) / size) % 3 + Math.floor(((cursor3D[2] + z + (chunk_offset[2] + 2) * size) / size) % 3) * 3;
                                                octree_set(Math.floor(cursor3D[0] + x) % size, Math.floor(cursor3D[1] + y) % size, Math.floor(cursor3D[2] + z) % size, brush.palette_id, 255, brush.variant, (paint == 1) ? 255 : 0, chunkid);
                                                chunks2send.set(chunkid, 1);
                                            }
                                        }
                                    }
                                }
                            }
                            chunks2send.forEach((val, chunk) => { send_chunk(chunk, gl, 0, 0, 0, size - 1, size - 1, size - 1); console.log(chunk) });
                        }
                        else {
                            const cx = Math.floor(cursor3D[0] / size);
                            //const cy = Math.floor(cursor3D[1] / 64);
                            const cz = Math.floor(cursor3D[2] / size);
                            if (cx < 3 && cz < 3 && cx >= 0 && cz >= 0) {
                                cursor3D[0] %= size;
                                cursor3D[1] %= size;
                                cursor3D[2] %= size;
                                let chunkid = (cx + chunk_offset[0] + 2) % 3 + ((cz + chunk_offset[2] + 2) % 3) * 3;
                                octree_set(cursor3D[0], cursor3D[1], cursor3D[2], brush.palette_id, 255, brush.variant, (paint == 1) ? 255 : 0, chunkid);
                                send_chunk(chunkid, gl, 0, 0, 0, size - 1, size - 1, size - 1);
                            }
                        }
                    }
                }
            }
        }
        paint = 0;
    }

    window.requestAnimationFrame(function (timestamp) {
        deltaTime = timestamp - time;

        if (wait > 10) {
            document.getElementById('fps_counter').innerHTML = ('FPS:' + Math.round(10000.0 / fps_time));
            fps_time = 0;
            wait = 0;
        }
        else
            fps_time += deltaTime;

        wait++;
        drawScene(gl, canvas, shaderProgram, canvasShaderProgram, dispShaderProgram, timestamp);
    });
}

