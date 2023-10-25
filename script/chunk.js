function palSetElement(x, y, z, r, g, b, a, slot, level, len, element, variant) {
    x += slot * len;
    y += element * len;
    z += variant * len;
    let ind = (x + (y * len + z * len * len * pal_pix_cnt) * pal_size) * 4;
    palette[level][ind] = r;
    palette[level][ind + 1] = g;
    palette[level][ind + 2] = b;
    palette[level][ind + 3] = a;
}

function palSetColor(x, y, z, r, g, b, slot, level, len, element, variant) {
    x += slot * len;
    y += element * len;
    z += variant * len;
    let ind = (x + (y * len + z * len * len * pal_pix_cnt) * pal_size) * 4;
    palette[level][ind] = r;
    palette[level][ind + 1] = g;
    palette[level][ind + 2] = b;
}

function palGetElement(x, y, z, slot, element, variant) {
    x += slot * subSize;
    y += element * subSize;
    z += variant * subSize;
    let ind = (x + (y * subSize + z * subSize * subSize * pal_pix_cnt) * pal_size) * 4;
    return [
        palette[0][ind],
        palette[0][ind + 1],
        palette[0][ind + 2],
        palette[0][ind + 3]
    ];
}

function pal_octree_set(x, y, z, r, g, b, a, s, e, ro, slot, variant) {
    //variants with indices greater than number of variants are animated
    if (variant >= pal_variants) return;

    if (a > 0) {
        // iterate until the mask is shifted to target (leaf) layer
        let pow2 = 1;
        let xo, yo, zo;
        for (let depth = 0; depth < subOctreeDepth; depth++) {
            xo = (x >> (subOctreeDepth - depth));
            yo = (y >> (subOctreeDepth - depth)) * pow2;
            zo = (z >> (subOctreeDepth - depth)) * pow2 * pow2;

            let pal_variant_z_offset = pow2 * pow2 * pow2 * variant * pal_pix_cnt;
            let pal_material_y_offset = pow2 * pow2 * pal_size * 4;
            let ind = ((xo + slot * pow2) + (yo + zo * pal_pix_cnt + pal_variant_z_offset) * pal_size) * 4;
            let oc = (((x >> (subOctreeDepth - 1 - depth)) & 1) * 1) + (((y >> (subOctreeDepth - 1 - depth)) & 1) * 2) + (((z >> (subOctreeDepth - 1 - depth)) & 1) * 4);
            palette[subOctreeDepth - depth][ind + 3] |= 1 << oc;
            palette[subOctreeDepth - depth][ind + 0] = r;
            palette[subOctreeDepth - depth][ind + 1] = g;
            palette[subOctreeDepth - depth][ind + 2] = b;
            palette[subOctreeDepth - depth][ind + pal_material_y_offset] = s;
            palette[subOctreeDepth - depth][ind + pal_material_y_offset + 1] = e;
            palette[subOctreeDepth - depth][ind + pal_material_y_offset + 2] = ro;
            //palSetColor(xo, yo, zo, s, e, 0, slot, subOctreeDepth - depth, pow2, 1, variant);

            pow2 *= 2;
        }
        palSetElement(x, y, z, r, g, b, a, slot, 0, subSize, 0, variant);
        palSetElement(x, y, z, s, e, ro, 0, slot, 0, subSize, 1, variant);
    }
    else {
        palSetElement(x, y, z, 0, 0, 0, 0, slot, 0, subSize, 0, variant);
        palSetElement(x, y, z, 0, 0, 0, 0, slot, 0, subSize, 1, variant);
        let xo = x, yo = y, zo = z;
        let pow2 = 0.5 * subSize;
        let cut_branches = true;
        for (let depth = 0; depth < subOctreeDepth; depth++) {

            xo >>= 1;
            yo >>= 1;
            zo >>= 1;
            oc = (((x >> depth) & 1) * 1) + (((y >> depth) & 1) * 2) + (((z >> depth) & 1) * 4);

            let pal_variant_z_offset = pow2 * pow2 * pow2 * variant * pal_pix_cnt;
            let ind = (xo + slot * pow2) * 4 + (yo * pow2 + zo * pow2 * pow2 * pal_pix_cnt + pal_variant_z_offset) * pal_size * 4;
            if (cut_branches) {
                palette[depth + 1][ind + 3] &= ~(1 << oc);
            }
            if (palette[depth + 1][ind + 3] != 0) { cut_branches = false; }
            pow2 /= 2;
        }
    }
}
class Chunk {
    #data = [];
    #x;
    #y;
    #z;
    #pixelsPerVoxel;
    #edgeSize;
    #octreeDepth;
    #pixelSize = 4;

    constructor(x, y, z, pixelsPerVoxel, octreeDepth) {
        this.#x = x;
        this.#y = y;
        this.#z = z;
        this.#pixelsPerVoxel = pixelsPerVoxel;
        this.#edgeSize = Math.pow(2, octreeDepth); 
        this.#octreeDepth = octreeDepth;

        let tmpSize = this.#edgeSize;
        for (let i = 0; i <= this.#octreeDepth; i++) {
            this.#data.push(new Uint8Array(tmpSize * tmpSize * tmpSize * this.#pixelsPerVoxel * this.#pixelSize));
            this.#data[i].fill(0);
            tmpSize /= 2;
        }
    }

    //set voxel values in data texture
    setElement(x, y, z, r, g, b, a, level, len) {
        let ind = (x + (y * len + z * len * len) * pixelsPerVoxel) * 4;
        let levelData = this.#data[level];
        levelData[ind] = r;
        levelData[ind + 1] = g;
        levelData[ind + 2] = b;
        levelData[ind + 3] = a;
    }

    //get voxel values from data texture
    getElement(x, y, z, level, len) {
        let ind = (x + (y * len + z * len * len) * pixelsPerVoxel) * 4;
        let levelData = this.#data[level];
        return [
            levelData[ind],
            levelData[ind + 1],
            levelData[ind + 2],
            levelData[ind + 3]
        ];
    }

    //set voxel values in the chunk in the given position
    octreeSet(x, y, z, r, g, b, a) {
        if (a > 0) {
            // iterate until the mask is shifted to target (leaf) layer
            let pow2 = 1;
            let xo, yo, zo;
            for (let depth = 0; depth < octree_depth; depth++) {
                xo = (x >> (octree_depth - depth));
                yo = (y >> (octree_depth - depth)) * pow2;
                zo = (z >> (octree_depth - depth)) * pow2 * pow2;

                let ind = (xo + yo + zo) * 4 * pixelsPerVoxel;

                let ind_zero = xo * 2 + yo * 2 * 2 + zo * 2 * 4;

                for (let xs = 0; xs < 2; xs++)
                    for (let ys = 0; ys < 2; ys++)
                        for (let zs = 0; zs < 2; zs++) {
                            let nc = ind_zero + xs + (ys * 2 + zs * pow2 * 4) * pow2;
                            this.#data[octree_depth - 1 - depth][nc * 4 + 1] = 255;
                        }


                let oc = (((x >> (octree_depth - 1 - depth)) & 1) * 1) + (((y >> (octree_depth - 1 - depth)) & 1) * 2) + (((z >> (octree_depth - 1 - depth)) & 1) * 4);
                this.#data[octree_depth - depth][ind + 3] |= 1 << oc;

                this.#data[octree_depth - depth][ind] = r;

                pow2 *= 2;
            }
            this.setElement(x, y, z, r, 255, b, a, 0, this.#edgeSize);
        }
        else {
            this.setElement(x, y, z, r, 255, b, 0, 0, this.#edgeSize);
            let xo = x, yo = y, zo = z;
            let pow2 = 0.5 * this.#edgeSize;
            let cut_branches = true;
            for (let depth = 0; depth < octree_depth; depth++) {

                xo >>= 1;
                yo >>= 1;
                zo >>= 1;
                let oc = (((x >> depth) & 1) * 1) + (((y >> depth) & 1) * 2) + (((z >> depth) & 1) * 4);

                let ind = xo * 4 + (yo * pow2 + zo * pow2 * pow2) * 4 * pixelsPerVoxel;
                if (cut_branches) {
                    this.#data[depth + 1][ind + 3] &= ~(1 << oc);
                    if (depth > 0) {
                        for (let xs = 0; xs < 2; xs++)
                            for (let ys = 0; ys < 2; ys++)
                                for (let zs = 0; zs < 2; zs++) {
                                    let nc = ((x >> (depth)) << 1) + xs +
                                        (((y >> (depth)) << 1) + ys) * pow2 * 4 +
                                        (((z >> (depth)) << 1) + zs) * pow2 * pow2 * 16;
                                    this.#data[(depth - 1)][nc * 4 + 1] = 0;
                                }
                    }
                }
                if (this.#data[depth + 1][ind + 3] != 0) { cut_branches = false; }
                pow2 /= 2;
            }
        }
    }

    get data() {
        return this.#data;
    }
};

class MapManager {
    #chunkMap = new Map;
    #visibleChunks = [];

    // player position in chunks
    #chunkOffset;

    #gl;
    #shaderProgram;
    #chunkTextures = [];
    #chunkSize;
    #idMapUni;

    constructor(chunkOffset, gl, shaderProgram, chunkSize, idMapUniName) {
        this.#chunkOffset = chunkOffset;
        this.#gl = gl;
        this.#shaderProgram = shaderProgram;
        this.#chunkSize = chunkSize;
        this.#idMapUni = this.#gl.getUniformLocation(this.#shaderProgram.program, idMapUniName);

        for (let x = 0; x < 3; x++) {
            for (let z = 0; z < 3; z++) {
                let chunk = new Chunk(x, 0, z, pixelsPerVoxel, octree_depth);
                this.#chunkMap.set([x + this.#chunkOffset[0] - 1, 0, z + this.#chunkOffset[2] - 1].join(','), chunk);
                this.#visibleChunks.push(chunk);
                this.generateChunk(this.#chunkOffset[0] + x - 1, 0, this.#chunkOffset[2] + z - 1, false, 0, 0, 0);
            }
        }

        var textureLoc = this.#gl.getUniformLocation(shaderProgram.program, "chunkTextures[0]");

        // Tell the shader to use texture units 0 to pixel.length
        let tex_uni = [0];
        for (let j = 1; j < this.#visibleChunks.length; j++)
            tex_uni.push(j);
        this.#gl.uniform1iv(textureLoc, tex_uni);

        const internalFormat = this.#gl.RGBA;
        const srcFormat = this.#gl.RGBA;
        const srcType = this.#gl.UNSIGNED_BYTE;
        for (let i = 0; i < this.#visibleChunks.length; i++) {
            this.#gl.activeTexture(this.#gl.TEXTURE0 + i);
            const texture = this.#gl.createTexture();
            this.#gl.bindTexture(this.#gl.TEXTURE_3D, texture);
            this.#chunkTextures.push(texture);

            this.#gl.texImage3D(this.#gl.TEXTURE_3D, 0, internalFormat,
                this.#chunkSize * pixelsPerVoxel, this.#chunkSize, this.#chunkSize, 0, srcFormat, srcType,
                this.#visibleChunks[i].data[0]);

            this.#gl.texParameteri(this.#gl.TEXTURE_3D, this.#gl.TEXTURE_MAG_FILTER, this.#gl.NEAREST);

            this.#gl.generateMipmap(this.#gl.TEXTURE_3D);
            let msize = this.#chunkSize / 2;
            for (let c = 1; c <= octree_depth; c++) {
                this.#gl.texImage3D(this.#gl.TEXTURE_3D, c, internalFormat,
                    msize * pixelsPerVoxel, msize, msize, 0, srcFormat, srcType,
                    this.#visibleChunks[i].data[c]);
                msize /= 2;
            }
        }
    }

    sendChunk(i, x0, y0, z0, x1, y1, z1) {
        const internalFormat = gl.RGBA;
        const srcType = gl.UNSIGNED_BYTE;
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_3D, this.#chunkTextures[i]);
        let msize = this.#chunkSize;
        for (let c = 0; c < octree_depth + 1; c++) {
            gl.texSubImage3D(gl.TEXTURE_3D, c, x0, y0, z0, Math.abs(x0 - x1) + 1, Math.abs(y0 - y1) + 1, Math.abs(z0 - z1) + 1, internalFormat, srcType,
                this.#visibleChunks[i].data[c]);
            x0 = Math.floor(x0 / 2);
            y0 = Math.floor(y0 / 2);
            z0 = Math.floor(z0 / 2);
            x1 = Math.floor(x1 / 2);
            y1 = Math.floor(y1 / 2);
            z1 = Math.floor(z1 / 2);
            msize /= 2;
        }
    }

    generateChunk(x, y, z, send, sendx, sendy, sendz) {
        console.log("x" + x + " y" + y + " z" + z);
        let timer_start = Date.now();

        let build_new = true;
        let i = (x % 3) + (z % 3) * 3;
        if (send) {
            //if chunk in this position was generated before, use it
            const svkey = [x, y, z];
            const sskey = svkey.join(',');
            if (this.#chunkMap.has(sskey)) {

                this.#visibleChunks[i] = this.#chunkMap.get(sskey);
                console.log("loaded");
                build_new = false;
            }
        }

        if (build_new) {

            let chunk = new Chunk(x, y, z, pixelsPerVoxel, octree_depth);
            this.#chunkMap.set([x, y, z].join(','), chunk);

            this.#visibleChunks[i] = chunk;

            x *= this.#chunkSize;
            y *= this.#chunkSize;
            z *= this.#chunkSize;

            chunkFunction(x, y, z, this.#chunkSize, i, this);
        }
        if (send) {
            i = (sendx % 3) + (sendz % 3) * 3;
            this.sendChunk(i, 0, 0, 0, this.#chunkSize - 1, this.#chunkSize - 1, this.#chunkSize - 1);
        }

        console.log("Took " + (Date.now() - timer_start) + "ms");
    }

    setViewPosition(vPos) {
        if (vPos[0] > 0.5 * this.#chunkSize) {
            vPos[0] -= this.#chunkSize;
            for (let z = 0; z < 3; z++)
                this.generateChunk(this.#chunkOffset[0] + 2, this.#chunkOffset[1], this.#chunkOffset[2] + z - 1, true, this.#chunkOffset[0] - 1, this.#chunkOffset[1], this.#chunkOffset[2] + z - 1);
            this.#chunkOffset[0]++;
        }

        if (vPos[2] > 0.5 * this.#chunkSize) {
            vPos[2] -= this.#chunkSize;
            for (let x = 0; x < 3; x++)
                this.generateChunk(this.#chunkOffset[0] + x - 1, this.#chunkOffset[1], this.#chunkOffset[2] + 2, true, this.#chunkOffset[0] + x - 1, this.#chunkOffset[1], this.#chunkOffset[2] - 1);
            this.#chunkOffset[2]++;
        }

        if (vPos[0] < - 0.5 * this.#chunkSize) {
            vPos[0] += this.#chunkSize;
            for (let z = 0; z < 3; z++)
                this.generateChunk(this.#chunkOffset[0] - 2, this.#chunkOffset[1], this.#chunkOffset[2] + z - 1, true, this.#chunkOffset[0] + 1, this.#chunkOffset[1], this.#chunkOffset[2] + z - 1);
            this.#chunkOffset[0]--;
        }

        if (vPos[2] < - 0.5 * this.#chunkSize) {
            vPos[2] += this.#chunkSize;
            for (let x = 0; x < 3; x++)
                this.generateChunk(this.#chunkOffset[0] + x - 1, this.#chunkOffset[1], this.#chunkOffset[2] - 2, true, this.#chunkOffset[0] + x - 1, this.#chunkOffset[1], this.#chunkOffset[2] + 1);
            this.#chunkOffset[2]--;
        }
    }

    updateIdMapUniform() {
        let chunkIdMap = new Int32Array(9);
        for (let x = 0; x < 3; x++) {
            for (let z = 0; z < 3; z++) {
                chunkIdMap[x + z * 3] = (x + this.#chunkOffset[0] + 2) % 3 + ((z + this.#chunkOffset[2] + 2) % 3) * 3;
            }
        }

        gl.uniform3iv(this.#idMapUni, chunkIdMap);
    }

    load(continuousData) {
        //delete all old chunks
        this.#chunkMap.clear();
        glMatrix.vec3.set(this.#chunkOffset, 20, 0, 20);
        
        this.#visibleChunks.splice(0, this.#visibleChunks.length);

        //load new chunks
        let header_len = new Uint32Array(continuousData.buffer, 0, 1);
        let header = new Uint32Array(continuousData.buffer, 4, header_len * 3);
        console.log(header);

        let offset = 4 + header_len * 4 * 3;
        for (let c = 0; c < header_len; c++) {
            let chunk = new Chunk(0, 0, 0, pixelsPerVoxel, octree_depth);

            for (let vx = 0; vx < this.#chunkSize; vx++) {
                for (let vy = 0; vy < this.#chunkSize; vy++) {
                    for (let vz = 0; vz < this.#chunkSize; vz++) {
                        let id = (vx + (vy + vz * this.#chunkSize) * this.#chunkSize) * 4;
                        chunk.octreeSet(vx, vy, vz, continuousData[offset + id], 255, continuousData[offset + id + 2], continuousData[offset + id + 3]);
                    }
                }
            }
            offset += this.#chunkSize * this.#chunkSize * this.#chunkSize * 4;
            this.#chunkMap.set([header[c * 3 + 0], header[c * 3 + 1], header[c * 3 + 2]].join(','), chunk);
        }

        for (let x = 0; x < 3; x++) {
            for (let z = 0; z < 3; z++) {
                if (!this.#chunkMap.has([x + this.#chunkOffset[0] - 1, 0, z + this.#chunkOffset[2] - 1].join(','))) {
                    let chunk = new Chunk(x, 0, z, pixelsPerVoxel, octree_depth);
                    this.#chunkMap.set([x + this.#chunkOffset[0] - 1, 0, z + this.#chunkOffset[2] - 1].join(','), chunk);
                    this.#visibleChunks.push(this.#chunkMap.get([x + this.#chunkOffset[0] - 1, 0, z + this.#chunkOffset[2] - 1].join(',')));
                }
                this.generateChunk(this.#chunkOffset[0] + x - 1, 0, this.#chunkOffset[2] + z - 1, true, this.#chunkOffset[0] + x - 1, 0, this.#chunkOffset[2] + z - 1);
            }
        }
    }

    save() {
        //first 4 bytes are the header describing the following chunk info length 
        let header = new Uint32Array(1 + 3 * this.#chunkMap.size);
        header[0] = this.#chunkMap.size;

        let chunk_no = 1;
        let continuousData = [header];
        this.#chunkMap.forEach((chunk, posi) => {
            const coord = posi.split(',').map((e) => parseInt(e));
            header[chunk_no] = coord[0];
            header[chunk_no + 1] = coord[1];
            header[chunk_no + 2] = coord[2];
            chunk_no += 3;
            continuousData.push(chunk.data[0]);
        });

        return new Blob(continuousData);       
    }

    get chunkOffset() {
        return this.#chunkOffset;
    }

    get chunkMap() {
        return this.#chunkMap;
    }

    get visibleChunks() {
        return this.#visibleChunks;
    }

    set chunkOffset(chunkOffset) {
        this.#chunkOffset = chunkOffset;
    }
};
