
class Palette {
    #data = [];
    #slots;
    #subOctreeDepth;
    #pixelsPerVoxel;
    #variantCnt;
    #dataTexture;
    #subVoxelSize;
    #textureId;

    constructor(slots, pixelsPerVoxel, variantCnt, subOctreeDepth, shaderProgram, textureId = 0) {
        this.#slots = slots;
        this.#pixelsPerVoxel = pixelsPerVoxel;
        this.#variantCnt = variantCnt;
        this.#subOctreeDepth = subOctreeDepth;
        this.#subVoxelSize = 1 << subOctreeDepth;
        this.#textureId = textureId;

        let textureLocPal = gl.getUniformLocation(shaderProgram.program, "paletteTexture");

        gl.uniform1i(textureLocPal, textureId);
        gl.activeTexture(gl.TEXTURE0 + textureId);
        this.#dataTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_3D, this.#dataTexture);

        let msize = this.#subVoxelSize;
        for (let c = 0; c <= this.#subOctreeDepth; c++) {
            this.#data.push(new Uint8Array(msize * msize * msize * 4 * this.#slots * this.#pixelsPerVoxel * this.#variantCnt));
            msize /= 2;
        }

        const internalFormat = gl.RGBA;
        const srcFormat = gl.RGBA;
        const srcType = gl.UNSIGNED_BYTE;
        gl.texImage3D(gl.TEXTURE_3D, 0, internalFormat,
            this.#subVoxelSize * this.#slots, this.#subVoxelSize * this.#pixelsPerVoxel, this.#subVoxelSize * this.#variantCnt,
            0, srcFormat, srcType, this.#data[0]);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.generateMipmap(gl.TEXTURE_3D);


        msize = this.#subVoxelSize;
        for (let c = 0; c <= this.#subOctreeDepth; c++) {
            gl.texImage3D(gl.TEXTURE_3D, c, internalFormat,
                msize * this.#slots, msize * this.#pixelsPerVoxel, msize * this.#variantCnt,
                0, srcFormat, srcType, this.#data[c]);
            msize /= 2;
        }
        gl.bindTexture(gl.TEXTURE_3D, this.#dataTexture);
    }

    update() {
        const internalFormat = gl.RGBA;
        const srcFormat = gl.RGBA;
        const srcType = gl.UNSIGNED_BYTE;
        gl.activeTexture(gl.TEXTURE0 + this.#textureId);
        gl.bindTexture(gl.TEXTURE_3D, this.#dataTexture);


        let msize = this.#subVoxelSize;
        for (let c = 0; c <= this.#subOctreeDepth; c++) {
            gl.texImage3D(gl.TEXTURE_3D, c, internalFormat,
                msize * this.#slots, msize * this.#pixelsPerVoxel, msize * this.#variantCnt,
                0, srcFormat, srcType, this.#data[c]);
            msize /= 2;
        }

        generatePreviews();
        displayPreviews();
    }

    setElement(x, y, z, r, g, b, a, slot, level, len, element, variant) {
        x += slot * len;
        y += element * len;
        z += variant * len;
        let ind = (x + (y * len + z * len * len * this.#pixelsPerVoxel) * this.#slots) * 4;
        this.#data[level][ind] = r;
        this.#data[level][ind + 1] = g;
        this.#data[level][ind + 2] = b;
        this.#data[level][ind + 3] = a;
    }

    getElement(x, y, z, slot, element, variant) {
        x += slot * this.#subVoxelSize;
        y += element * this.#subVoxelSize;
        z += variant * this.#subVoxelSize;
        let ind = (x + (y * this.#subVoxelSize + z * this.#subVoxelSize * this.#subVoxelSize * this.#pixelsPerVoxel) * this.#slots) * 4;
        return [
            this.#data[0][ind],
            this.#data[0][ind + 1],
            this.#data[0][ind + 2],
            this.#data[0][ind + 3]
        ];
    }

    octreeSet(x, y, z, r, g, b, a, s, e, ro, slot, variant) {
        //variants with indices greater than number of variants are animated
        if (variant >= this.#variantCnt) return;

        if (a > 0) {
            // iterate until the mask is shifted to target (leaf) layer
            let pow2 = 1;
            let xo, yo, zo;
            for (let depth = 0; depth < this.#subOctreeDepth; depth++) {
                xo = (x >> (this.#subOctreeDepth - depth));
                yo = (y >> (this.#subOctreeDepth - depth)) * pow2;
                zo = (z >> (this.#subOctreeDepth - depth)) * pow2 * pow2;

                let pal_variant_z_offset = pow2 * pow2 * pow2 * variant * this.#pixelsPerVoxel;
                let pal_material_y_offset = pow2 * pow2 * this.#slots * 4;
                let ind = ((xo + slot * pow2) + (yo + zo * this.#pixelsPerVoxel + pal_variant_z_offset) * pal_size) * 4;
                let oc = (((x >> (subOctreeDepth - 1 - depth)) & 1) * 1) + (((y >> (this.#subOctreeDepth - 1 - depth)) & 1) * 2) + (((z >> (this.#subOctreeDepth - 1 - depth)) & 1) * 4);
                this.#data[this.#subOctreeDepth - depth][ind + 3] |= 1 << oc;
                this.#data[this.#subOctreeDepth - depth][ind + 0] = r;
                this.#data[this.#subOctreeDepth - depth][ind + 1] = g;
                this.#data[this.#subOctreeDepth - depth][ind + 2] = b;
                this.#data[this.#subOctreeDepth - depth][ind + pal_material_y_offset] = s;
                this.#data[this.#subOctreeDepth - depth][ind + pal_material_y_offset + 1] = e;
                this.#data[this.#subOctreeDepth - depth][ind + pal_material_y_offset + 2] = ro;

                pow2 *= 2;
            }
            this.setElement(x, y, z, r, g, b, a, slot, 0, this.#subVoxelSize, 0, variant);
            this.setElement(x, y, z, s, e, ro, 0, slot, 0, this.#subVoxelSize, 1, variant);
        }
        else {
            this.setElement(x, y, z, 0, 0, 0, 0, slot, 0, this.#subVoxelSize, 0, variant);
            this.setElement(x, y, z, 0, 0, 0, 0, slot, 0, this.#subVoxelSize, 1, variant);
            let xo = x, yo = y, zo = z;
            let pow2 = 0.5 * this.#subVoxelSize;
            let cut_branches = true;
            for (let depth = 0; depth < this.#subOctreeDepth; depth++) {
                xo >>= 1;
                yo >>= 1;
                zo >>= 1;
                let oc = (((x >> depth) & 1) * 1) + (((y >> depth) & 1) * 2) + (((z >> depth) & 1) * 4);

                let pal_variant_z_offset = pow2 * pow2 * pow2 * variant * this.#pixelsPerVoxel;
                let ind = (xo + slot * pow2) * 4 + (yo * pow2 + zo * pow2 * pow2 * this.#pixelsPerVoxel + pal_variant_z_offset) * this.#slots * 4;
                if (cut_branches) {
                    this.#data[depth + 1][ind + 3] &= ~(1 << oc);
                }
                if (this.#data[depth + 1][ind + 3] != 0) {
                    cut_branches = false;
                }
                pow2 /= 2;
            }
        }
    }

    save() {
        let continuous_data = [];
        let pal_header = new Uint32Array(4);
        pal_header[0] = pal_size;     //x
        pal_header[1] = pal_pix_cnt;  //y
        pal_header[2] = pal_variants; //z
        pal_header[3] = 8;            //edge length
        continuous_data.push(pal_header);
        for (let level = 0; level < 4; level++) {
            continuous_data.push(this.#data[level]);
        }
        return new Blob(continuous_data);
    }

    load(continuous_data) {
        let pal_header = new Uint32Array(continuous_data.buffer, 0, 4);
        let pal_x = pal_header[0];
        let pal_y = pal_header[1];
        let pal_z = pal_header[2];
        let pal_edge = pal_header[3];
        let offset = 4 * 4;

        let msize = pal_edge;
        for (let level = 0; level < 4; level++) {
            let lay_size = msize * msize * msize * pal_x * pal_y * pal_z * 4;
            this.#data[level] = new Uint8Array(continuous_data.buffer, offset, lay_size);
            offset += lay_size;
            msize /= 2;
        }

        this.update();
    }
};

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

    get position() {
        return { x: this.#x, y: this.#y, z: this.#z };
    }
};

class MapManager {
    #chunkMap = new Map;

    // player position in chunks
    #chunkOffset;

    #gl;
    #shaderProgram;
    #chunkTexture;
    #chunkSize;
    #chunkOctreeDepth;
    #idMapUni;
    #chunkEdgeCount = 5;

    constructor(chunkOffset, gl, shaderProgram, octreeDepth, idMapUniName) {
        this.#chunkOffset = chunkOffset;
        this.#gl = gl;
        this.#shaderProgram = shaderProgram;
        this.#chunkSize = Math.pow(2, octreeDepth);
        this.#chunkOctreeDepth = octreeDepth;
        this.#idMapUni = this.#gl.getUniformLocation(this.#shaderProgram.program, idMapUniName);

        let halfEdge = Math.floor(this.#chunkEdgeCount / 2);
        for (let x = 0; x < this.#chunkEdgeCount; x++) {
            for (let z = 0; z < this.#chunkEdgeCount; z++) {
                this.generateChunk(this.#chunkOffset[0] + x - halfEdge, 0, this.#chunkOffset[2] + z - halfEdge, false);       
            }
        }

        var textureLoc = this.#gl.getUniformLocation(shaderProgram.program, "megaChunkTexture");

        // Tell the shader to use texture units 0 to pixel.length
        this.#gl.uniform1i(textureLoc, 0);

        const internalFormat = this.#gl.RGBA;
        const srcFormat = this.#gl.RGBA;
        const srcType = this.#gl.UNSIGNED_BYTE;
        this.#gl.activeTexture(this.#gl.TEXTURE0);

        this.#chunkTexture = this.#gl.createTexture();
        this.#gl.bindTexture(this.#gl.TEXTURE_3D, this.#chunkTexture);

        let zeroData = new Uint8Array(this.#chunkSize * this.#chunkSize * this.#chunkSize * 4 * this.#chunkEdgeCount * this.#chunkEdgeCount);
        this.#gl.texImage3D(this.#gl.TEXTURE_3D, 0, internalFormat,
            this.#chunkSize * this.#chunkEdgeCount, this.#chunkSize, this.#chunkSize * this.#chunkEdgeCount,
            0, srcFormat, srcType, zeroData);

        this.#gl.texParameteri(this.#gl.TEXTURE_3D, this.#gl.TEXTURE_MAG_FILTER, this.#gl.NEAREST);

        this.#gl.generateMipmap(this.#gl.TEXTURE_3D);

        for (let x = 0; x < this.#chunkEdgeCount; x++) {
            for (let z = 0; z < this.#chunkEdgeCount; z++) {
                let xc = this.#chunkOffset[0] + x - halfEdge;
                let zc = this.#chunkOffset[2] + z - halfEdge;
                let chunk = this.#chunkMap.get([xc, 0, zc].join(','));
                this.sendChunk(chunk, 0, 0, 0, this.#chunkSize - 1, this.#chunkSize - 1, this.#chunkSize - 1);
            }
        }
    }

    sendChunk(chunk, x0, y0, z0, x1, y1, z1) {
        let cPos = chunk.position;
        let offsetX = (cPos.x % this.#chunkEdgeCount) * this.#chunkSize;
        let offsetY = (cPos.y % this.#chunkEdgeCount) * this.#chunkSize;
        let offsetZ = (cPos.z % this.#chunkEdgeCount) * this.#chunkSize;

        x0 += offsetX;
        y0 += offsetY;
        z0 += offsetZ;

        x1 += offsetX;
        y1 += offsetY;
        z1 += offsetZ;

        const internalFormat = gl.RGBA;
        const srcType = gl.UNSIGNED_BYTE;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_3D, this.#chunkTexture);
        let msize = this.#chunkSize;
        for (let c = 0; c < this.#chunkOctreeDepth + 1; c++) {
            gl.texSubImage3D(gl.TEXTURE_3D, c, x0, y0, z0, Math.abs(x0 - x1) + 1, Math.abs(y0 - y1) + 1, Math.abs(z0 - z1) + 1, internalFormat, srcType,
                chunk.data[c]);
            x0 = Math.floor(x0 / 2);
            y0 = Math.floor(y0 / 2);
            z0 = Math.floor(z0 / 2);
            x1 = Math.floor(x1 / 2);
            y1 = Math.floor(y1 / 2);
            z1 = Math.floor(z1 / 2);
            msize /= 2;
        }
    }

    generateChunk(x, y, z, send) {
        console.log("x" + x + " y" + y + " z" + z);
        let timer_start = Date.now();

        let build_new = true;
        const cKey = [x, y, z].join(',');

        if (send) {
            //if chunk in this position was generated before, use it          
            if (this.#chunkMap.has(cKey)) {
                console.log("loaded");
                build_new = false;
            }
        }

        if (build_new) {

            let chunk = new Chunk(x, y, z, pixelsPerVoxel, this.#chunkOctreeDepth);
            this.#chunkMap.set(cKey, chunk);

            x *= this.#chunkSize;
            y *= this.#chunkSize;
            z *= this.#chunkSize;

            chunkFunction(x, y, z, this.#chunkSize, chunk);
        }
        if (send) {
            this.sendChunk(this.#chunkMap.get(cKey), 0, 0, 0, this.#chunkSize - 1, this.#chunkSize - 1, this.#chunkSize - 1);
        }

        console.log("Took " + (Date.now() - timer_start) + "ms");
    }

    setViewPosition(vPos) {
        //let edgeOffset = (this.#chunkEdgeCount - 1);
        let halfEdge = Math.floor(this.#chunkEdgeCount / 2);
        if (vPos[0] > 0.5 * this.#chunkSize) {
            vPos[0] -= this.#chunkSize;
            for (let z = 0; z < this.#chunkEdgeCount; z++)
                this.generateChunk(this.#chunkOffset[0] + (halfEdge + 1), this.#chunkOffset[1], this.#chunkOffset[2] + z - halfEdge, true);
            this.#chunkOffset[0]++;
            console.log("x+");
        }

        if (vPos[0] < - 0.5 * this.#chunkSize) {
            vPos[0] += this.#chunkSize;
            for (let z = 0; z < this.#chunkEdgeCount; z++)
                this.generateChunk(this.#chunkOffset[0] - (halfEdge + 1), this.#chunkOffset[1], this.#chunkOffset[2] + z - halfEdge, true);
            this.#chunkOffset[0]--;
            console.log("x-");
        }

        if (vPos[2] > 0.5 * this.#chunkSize) {
            vPos[2] -= this.#chunkSize;
            for (let x = 0; x < this.#chunkEdgeCount; x++)
                this.generateChunk(this.#chunkOffset[0] + x - halfEdge, this.#chunkOffset[1], this.#chunkOffset[2] + (halfEdge + 1), true);
            this.#chunkOffset[2]++;
            console.log("z+");
        }        

        if (vPos[2] < - 0.5 * this.#chunkSize) {
            vPos[2] += this.#chunkSize;
            for (let x = 0; x < this.#chunkEdgeCount; x++)
                this.generateChunk(this.#chunkOffset[0] + x - halfEdge, this.#chunkOffset[1], this.#chunkOffset[2] - (halfEdge + 1), true);
            this.#chunkOffset[2]--;
            console.log("z-");
        }
    }

    updateIdMapUniform() {
        let chunkIdMap = new Int32Array(this.#chunkEdgeCount * this.#chunkEdgeCount * 3);
        let halfEdge = Math.floor(this.#chunkEdgeCount / 2);
        for (let x = 0; x < this.#chunkEdgeCount; x++) {
            for (let z = 0; z < this.#chunkEdgeCount; z++) {
                chunkIdMap[(x + z * this.#chunkEdgeCount) * 3 + 0] = (x + this.#chunkOffset[0] - halfEdge) % this.#chunkEdgeCount;
                chunkIdMap[(x + z * this.#chunkEdgeCount) * 3 + 1] = 0;
                chunkIdMap[(x + z * this.#chunkEdgeCount) * 3 + 2] = (z + this.#chunkOffset[2] - halfEdge) % this.#chunkEdgeCount;
            }
        }
        gl.uniform3iv(this.#idMapUni, chunkIdMap);
    }

    load(continuousData) {
        //delete all old chunks
        this.#chunkMap.clear();
        glMatrix.vec3.set(this.#chunkOffset, 20, 0, 20);

        //load new chunks
        let header_len = new Uint32Array(continuousData.buffer, 0, 1);
        let header = new Uint32Array(continuousData.buffer, 4, header_len * 3);
        console.log(header);

        let offset = 4 + header_len * 4 * 3;
        for (let c = 0; c < header_len; c++) {
            let x = header[c * 3 + 0];
            let y = header[c * 3 + 1];
            let z = header[c * 3 + 2];

            let chunk = new Chunk(x, y, z, pixelsPerVoxel, this.#chunkOctreeDepth);

            for (let vx = 0; vx < this.#chunkSize; vx++) {
                for (let vy = 0; vy < this.#chunkSize; vy++) {
                    for (let vz = 0; vz < this.#chunkSize; vz++) {
                        let id = (vx + (vy + vz * this.#chunkSize) * this.#chunkSize) * 4;
                        chunk.octreeSet(vx, vy, vz, continuousData[offset + id], 255, continuousData[offset + id + 2], continuousData[offset + id + 3]);
                    }
                }
            }
            offset += this.#chunkSize * this.#chunkSize * this.#chunkSize * 4;
            this.#chunkMap.set([x, y, z].join(','), chunk);
        }

        let halfEdge = Math.floor(this.#chunkEdgeCount / 2);
        for (let x = 0; x < this.#chunkEdgeCount; x++) {
            for (let z = 0; z < this.#chunkEdgeCount; z++) {
                this.generateChunk(this.#chunkOffset[0] + x - halfEdge, 0, this.#chunkOffset[2] + z - halfEdge, true);
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

    set chunkOffset(chunkOffset) {
        this.#chunkOffset = chunkOffset;
    }

    get chunkEdgeCount() {
        return this.#chunkEdgeCount;
    }
};
