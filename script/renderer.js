var gl;
var worldParameter;
var mouseX = 0, mouseY = 0;
var pos = glMatrix.vec3.fromValues(0, 65, 0);
const vec3_minus_one = glMatrix.vec3.fromValues(-1.0, -1.0, -1.0);
var rotation = glMatrix.vec3.create();
var cursor = glMatrix.vec3.create();
var angle = glMatrix.vec3.create();
var locked = false;
var brush_lock = true;
var prev_rotation = glMatrix.vec3.create();
var prev_position = glMatrix.vec3.create();
var deltaTime = 0;
var cursor3D = glMatrix.vec3.create();
var paint = 0;
var brush = { diameter: 1, color_r: 255, color_g: 255, color_b: 255, clarity: 0, emission: 0, roughness: 0, palette_id: 0, variant: 0, type: true };
var subvoxel_paint = false;

var mapManager;
const pixelsPerVoxel = 1;
const size = 128;
const octree_depth = 7;
const chunk_size = ((1 - Math.pow(8, (octree_depth + 1))) / -7) * pixelsPerVoxel;

var palette;
const subSize = 8;
const subOctreeDepth = 3;
const pal_size = 256;
const pal_pix_cnt = 2;
const pal_variants = 8;

function main() {
    const canvas = document.querySelector("#glCanvas");
    canvas.onmousedown = handleCanvasClick;

    var [sw, sh] = readResolution(canvas);
    if (sw && sh) {
        canvas.width = sw;
        canvas.height = sh;
    }

    gl = canvas.getContext("webgl2");

    if (gl === null) {
        alert("Unable to initialize WebGL. Your browser or machine may not support it.");
        return;
    }

    worldParameter = window.location.search.substr(1);

    initBlockPicker();

    fetch('./shader/vertex_shader.vert').then((response) => response.text()).then((vertex) => {
        fetch('./shader/fragment_shader.frag').then((response2) => response2.text()).then((fragment) => {
            fetch('./shader/post-processing.frag').then((pp_response2) => pp_response2.text()).then((pp_fragment) => {
                fetch('./shader/display.frag').then((disp_response2) => disp_response2.text()).then((disp_fragment) => {
                    fetch('./shader/second_denoiser.frag').then((disp_response2) => disp_response2.text()).then((denoiser_fragment) => {
                        init(vertex, fragment, gl, canvas, pp_fragment, disp_fragment, denoiser_fragment);
                    });
                });
            });
        });
    });

}

window.onload = main;

function save(name) {
    let dataBlob = mapManager.save();

    var a = document.createElement('a');
    a.href = URL.createObjectURL(dataBlob);
    a.download = name + ".vx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function save_palette(name) {
    let pal_blob = palette.save();

    var p = document.createElement('a');   
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
                    pos = glMatrix.vec3.fromValues(0, 65, 0);
                    mapManager.load(continuous_data);
                }
                else if (f_extension == 'vp') {
                    palette.load(continuous_data);
                }
                else {
                    console.log("Unknown file extension");
                }
            }
        }
    }
    input.click();
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
                    let voxA = palette.palGetElement(x, y, z, copied[0], 0, copied[1]);
                    let voxB = palette.palGetElement(x, y, z, copied[0], 1, copied[1]);
                    palette.octreeSet(x, y, z, voxA[0], voxA[1], voxA[2], voxA[3], voxB[0], voxB[1], voxB[2], brush.palette_id, brush.variant);
                }
            }
        }
        palette.update();
    }
    else {
        console.log('Cannot copy animation!');
    }
}

function init(vsSource, fsSource, gl, canvas, pp_fragment, disp_fragment, denoiser_fragment) {
    const shaderProgram = new ShaderProgram(gl, vsSource, fsSource);
    initBuffers(gl);

    let chunkOffset = glMatrix.vec3.fromValues(20, 0, 20);
    mapManager = new MapManager(chunkOffset, gl, shaderProgram, octree_depth, 'chunk_map');

    palette = new Palette(pal_size, pal_pix_cnt, pal_variants, subOctreeDepth, shaderProgram, 3);

    // Get the attribute location
    var coord = gl.getAttribLocation(shaderProgram.program, "coordinates");

    // Point an attribute to the currently bound VBO
    gl.vertexAttribPointer(coord, 2, gl.FLOAT, false, 0, 0);

    // Enable the attribute
    gl.enableVertexAttribArray(coord);


    let mainFb = new Framebuffer(gl, canvas.width, canvas.height, 3);

    //scene buffer
    const sceneBuffer = new UniformBuffer(gl, 4 * 13 + 4, 0);
    const block = gl.getUniformBlockIndex(shaderProgram.program, "Scene");
    console.log(block);
    gl.uniformBlockBinding(shaderProgram.program, block, sceneBuffer.boundLocation);

    //----shader program for post-processing and 1st pass----//
    const canvasShaderProgram = new ShaderProgram(gl, vsSource, pp_fragment);
    initBuffers(gl);
    let canvasMat = new Material(gl, canvasShaderProgram);
    canvasMat.addTexture("color0", mainFb.textures[1]);
    canvasMat.addTexture("color1", mainFb.textures[2]);
    canvasMat.addVec2f("screen_size", canvas.width, canvas.height);

    //bind otuput for pp and last frame
    let postpFb = new Framebuffer(gl, canvas.width, canvas.height, 2);

    // ----feedback loop----
    shaderProgram.use();

    let mainMat = new Material(gl, shaderProgram, 1);
    mainMat.addTexture("light_high", postpFb.textures[0]);
    mainMat.addTexture("light_low", postpFb.textures[1]);

    //----shader program for 2nd pass----//
    const denoiserShaderProgram = new ShaderProgram(gl, vsSource, denoiser_fragment);
    initBuffers(gl);
    let denMat = new Material(gl, denoiserShaderProgram);
    denMat.addTexture("color1", mainFb.textures[2]);
    denMat.addTexture("color2", postpFb.textures[1]);
    denMat.addVec2f("screen_size", canvas.width, canvas.height);

    //output
    let denFb = new Framebuffer(gl, canvas.width, canvas.height, 1);

    //----shader program for display and 3rd pass----//
    const dispShaderProgram = new ShaderProgram(gl, vsSource, disp_fragment);
    initBuffers(gl);

    let dispMat = new Material(gl, dispShaderProgram);
    dispMat.addTexture("color0", mainFb.textures[0]);
    dispMat.addTexture("color1", mainFb.textures[2]);
    dispMat.addTexture("color2", denFb.textures[0]);
    dispMat.addVec2f("screen_size", canvas.width, canvas.height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    //call start in worldgen.js
    start();

    let renderParams = {
        canvas: canvas,
        shaderProgram: shaderProgram,
        canvasShaderProgram: canvasShaderProgram,
        dispShaderProgram: dispShaderProgram,
        sceneBuffer: sceneBuffer,
        denoiserShaderProgram: denoiserShaderProgram,
        dispMat: dispMat,
        denMat: denMat,
        canvasMat: canvasMat,
        mainMat: mainMat,
        mapManager: mapManager,
        mainFb: mainFb,
        postpFb: postpFb,
        denFb: denFb
    };

    //start render loop
    window.requestAnimationFrame(function (timestamp) {
        drawScene(renderParams, 0.0);
    });
}

function addToPalette(r, g, b, s, e, ro, slot) {
    console.log(brush.color_r);
    console.log(brush.color_g);
    console.log(brush.color_b);
    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            for (let z = 0; z < 8; z++) {
                palette.octreeSet(x, y, z, r, g, b, 255, s, e, ro, slot, brush.variant);
            }
        }
    }
    palette.update();
}

function updateCamera(mapManager) {
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

    mapManager.setViewPosition(pos);
}

var wait = 0;
var fps_time = 0;
var pixel = new Uint8Array(4);

var fill = vec3_minus_one;

var frame = 0.0;
var animationTime = 0;
setInterval(function () {
    animationTime = (animationTime + 1) % 8;
}, 250);

function drawScene(renderParams, time) {
    updateCamera(renderParams.mapManager);

    const scene = [
        (pos[0] + renderParams.mapManager.chunkEdgeCount / 2 * size) * subSize, (pos[1]) * subSize, (pos[2] + renderParams.mapManager.chunkEdgeCount / 2 * size) * subSize, 0,
        rotation[0], rotation[1], animationTime,0,
        40 - renderParams.mapManager.chunkOffset[0], renderParams.mapManager.chunkOffset[1], 40 - renderParams.mapManager.chunkOffset[2],0,
        renderParams.canvas.width, renderParams.canvas.height, frame,0,
        1.2, 0.01, 255.0 * 8.0 * 3.0, 0,//projection (fov near far)
        (prev_position[0] + renderParams.mapManager.chunkEdgeCount / 2 * size) * subSize, (prev_position[1]) * subSize, (prev_position[2] + renderParams.mapManager.chunkEdgeCount / 2 * size) * subSize,0,
        prev_rotation[0], prev_rotation[1], prev_rotation[2],0,
        sceneConfig.skyColorUP[0], sceneConfig.skyColorUP[1], sceneConfig.skyColorUP[2],0,
        sceneConfig.skyColorDown[0], sceneConfig.skyColorDown[1], sceneConfig.skyColorDown[2],0,
        sceneConfig.skyLight[0], sceneConfig.skyLight[1], sceneConfig.skyLight[2],0,
        sceneConfig.sunColor[0], sceneConfig.sunColor[1], sceneConfig.sunColor[2],0,
        sceneConfig.sunDirection[0], sceneConfig.sunDirection[1], sceneConfig.sunDirection[2],0,
        sceneConfig.sunSize, sceneConfig.sunDiscSharpness, sceneConfig.sunShadowSharpness, 0,
        graphicsSettings.GI_samples, graphicsSettings.reflection_samples, 0, 0
    ];
    frame += 0.5;
    if (frame >= 0xffffff) frame = 0.0;
    prev_rotation = glMatrix.vec3.clone(rotation);
    prev_position = glMatrix.vec3.clone(pos);

    renderParams.shaderProgram.use();
    renderParams.mainFb.bind();
    renderParams.mainMat.use();

    renderParams.sceneBuffer.update(scene, 0);

    renderParams.mapManager.updateIdMapUniform();

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.viewport(0, 0, renderParams.canvas.width, renderParams.canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    if (paint > 0) {
        gl.readPixels(renderParams.canvas.width / 2, renderParams.canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);       
    }

    //post-processing
    renderParams.canvasShaderProgram.use(true);
    renderParams.postpFb.bind();
    renderParams.canvasMat.use();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    //second pass - denoiser
    renderParams.denoiserShaderProgram.use(true);
    renderParams.denFb.bind();
    renderParams.denMat.use();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    //draw to display
    renderParams.dispShaderProgram.use(true);
    renderParams.denFb.unbind();
    renderParams.dispMat.use();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    brushPaint(renderParams);

    window.requestAnimationFrame(function (timestamp) {
        deltaTime = timestamp - time;

        if (wait > 10) {
            document.getElementById('fps_counter').innerHTML = (Math.round(10000.0 / fps_time) + "FPS");
            fps_time = 0;
            wait = 0;
        }
        else
            fps_time += deltaTime;

        wait++;
        drawScene(renderParams, timestamp);
    });
}

function brushPaint(renderParams) {
    if (paint > 0) {
        let chunkEdgeCount = renderParams.mapManager.chunkEdgeCount;
        let center = (Math.floor(chunkEdgeCount / 2) + 1);
        if (subvoxel_paint) {
            //place voxel
            let offset = 0.0;
            let smallSize = subSize * size;
            let parentVox = [-1, -1, -1, -1];
            //try moving cursor up to 8 times
            for (let it = 0; it < 8; it++) {
                let rayLength = pixel[3] / 2.0 + offset;
                let chunkOffset = renderParams.mapManager.chunkOffset;
                cursor3D[0] = Math.round((pos[0] * 8.0 + (chunkOffset[0] + 0.5) * smallSize + direction[0] * rayLength) - 0.5);
                cursor3D[1] = Math.round((pos[1] * 8.0 + direction[1] * rayLength) - 0.5)
                cursor3D[2] = Math.round((pos[2] * 8.0 + (chunkOffset[2] + 0.5) * smallSize + direction[2] * rayLength) - 0.5);
                console.log(cursor3D);

                const cx = Math.floor(cursor3D[0] / smallSize);
                const cz = Math.floor(cursor3D[2] / smallSize);

                let chunkKey = [cx, 0, cz].join(",");
                let chunk = renderParams.mapManager.chunkMap.get(chunkKey);
                if (chunk == undefined) {
                    break;
                }

                parentVox = chunk.getElement(Math.floor(cursor3D[0] / 8) % size, Math.floor(cursor3D[1] / 8) % size, Math.floor(cursor3D[2] / 8) % size, 0, size);

                if (paint == 1 || paint == 3 || paint == 4) {
                    //adjust position for voxel placement  
                    if (parentVox[3] > 0 && palette.getElement(cursor3D[0] % 8, cursor3D[1] % 8, cursor3D[2] % 8, parentVox[0], 0, parentVox[2])[3] > 0) {
                        offset -= 0.1;
                    }
                    else
                        break;
                }
                else {
                    //adjust position for voxel deletion  
                    if (parentVox[3] <= 0 || palette.getElement(cursor3D[0] % 8, cursor3D[1] % 8, cursor3D[2] % 8, parentVox[0], 0, parentVox[2])[3] <= 0) {
                        offset += 0.1;
                    }
                    else {
                        break;
                    }
                }
            }
            if (parentVox[3] > 0) {
                palette.octreeSet(cursor3D[0] % 8, cursor3D[1] % 8, cursor3D[2] % 8, brush.color_r, brush.color_g, brush.color_b, (paint == 1) ? 255 : 0, brush.clarity, brush.emission, brush.roughness, parentVox[0], parentVox[2]);
                palette.update();
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
                    let rayLength = pixel[3] / 2.0 + offset;
                    let chunkOffset = renderParams.mapManager.chunkOffset;
                    cursor3D[0] = Math.round((pos[0] + (chunkOffset[0] + 0.5) * size + direction[0] * rayLength) - 0.5);
                    cursor3D[1] = Math.round((pos[1] + direction[1] * rayLength) - 0.5);
                    cursor3D[2] = Math.round((pos[2] + (chunkOffset[2] + 0.5) * size + direction[2] * rayLength) - 0.5);

                    const cx = Math.floor(cursor3D[0] / size);
                    const cz = Math.floor(cursor3D[2] / size);
                    let chunkKey = [cx, 0, cz].join(",");
                    let chunk = renderParams.mapManager.chunkMap.get(chunkKey);
                    if (chunk == undefined) {
                        break;
                    }

                    if (paint == 1 || paint == 3 || paint == 4) {
                        //adjust position for voxel placement                     
                        if (chunk.getElement(cursor3D[0] % size, cursor3D[1] % size, cursor3D[2] % size, 0, size)[3] > 0) {
                            offset -= 0.1;
                        }
                        else
                            break;
                    }
                    else {
                        //adjust position for voxel deletion   
                        if (paint == 5) {
                            let element = chunk.getElement(cursor3D[0] % size, cursor3D[1] % size, cursor3D[2] % size, 0, size);
                            pick = element[0];
                            pickVariant = element[2];
                        }

                        if (chunk.getElement(cursor3D[0] % size, cursor3D[1] % size, cursor3D[2] % size, 0, size)[3] <= 0) {
                            offset += 0.1;
                        }
                        else {
                            break;
                        }
                    }
                }

                if (paint == 5) {
                    //pick color
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
                                        if (y < size && y >= 0) {
                                            const cx = Math.floor(x / size);
                                            const cz = Math.floor(z / size);
                                            let chunkKey = [cx, 0, cz].join(",");
                                            let chunk = renderParams.mapManager.chunkMap.get(chunkKey);
                                            if (chunk != undefined) {
                                                if (paint == 3)
                                                    chunk.octreeSet(Math.floor(x) % size, Math.floor(y) % size, Math.floor(z) % size, brush.palette_id, 255, brush.variant, 255);
                                                else
                                                    chunk.octreeSet(Math.floor(x) % size, Math.floor(y) % size, Math.floor(z) % size, brush.palette_id, 255, brush.variant, 0);
                                                chunks2send.set(chunk, 1);
                                            }
                                        }
                                    }
                                }
                            }

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
                        let r = Math.floor(brush.diameter / 2.0);
                        for (let x = -r; x <= r; x++) {
                            for (let y = -r; y <= r; y++) {
                                for (let z = -r; z <= r; z++) {
                                    if (cursor3D[1] + y < size && cursor3D[1] + y >= 0) {
                                        if (brush.type || (x * x + y * y + z * z <= r * r)) {
                                            const cx = Math.floor((cursor3D[0] + x) / size);
                                            const cy = 0;
                                            const cz = Math.floor((cursor3D[2] + z) / size);
                                            let chunkKey = [cx, cy, cz].join(",");
                                            let chunk = renderParams.mapManager.chunkMap.get(chunkKey);
                                            if (chunk != undefined) {
                                                chunk.octreeSet(Math.floor(cursor3D[0] + x) % size, Math.floor(cursor3D[1] + y) % size, Math.floor(cursor3D[2] + z) % size, brush.palette_id, 255, brush.variant, (paint == 1) ? 255 : 0);
                                                chunks2send.set(chunk, 1);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    chunks2send.forEach((val, chunk) => {
                        renderParams.mapManager.sendChunk(chunk, 0, 0, 0, size - 1, size - 1, size - 1);
                    });
                }
            }
        }
        paint = 0;
    }
}

