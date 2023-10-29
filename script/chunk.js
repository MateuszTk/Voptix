
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
        let ind = (x + (y * len + z * len * len) * this.#pixelsPerVoxel) * 4;
        let levelData = this.#data[level];
        levelData[ind] = r;
        levelData[ind + 1] = g;
        levelData[ind + 2] = b;
        levelData[ind + 3] = a;
    }

    //get voxel values from data texture
    getElement(x, y, z, level, len) {
        let ind = (x + (y * len + z * len * len) * this.#pixelsPerVoxel) * 4;
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
            for (let depth = 0; depth < this.#octreeDepth; depth++) {
                xo = (x >> (this.#octreeDepth - depth));
                yo = (y >> (this.#octreeDepth - depth)) * pow2;
                zo = (z >> (this.#octreeDepth - depth)) * pow2 * pow2;

                let ind = (xo + yo + zo) * 4 * this.#pixelsPerVoxel;

                let ind_zero = xo * 2 + yo * 2 * 2 + zo * 2 * 4;

                for (let xs = 0; xs < 2; xs++)
                    for (let ys = 0; ys < 2; ys++)
                        for (let zs = 0; zs < 2; zs++) {
                            let nc = ind_zero + xs + (ys * 2 + zs * pow2 * 4) * pow2;
                            this.#data[this.#octreeDepth - 1 - depth][nc * 4 + 1] = 255;
                        }


                let oc = (((x >> (this.#octreeDepth - 1 - depth)) & 1) * 1) + (((y >> (this.#octreeDepth - 1 - depth)) & 1) * 2) + (((z >> (this.#octreeDepth - 1 - depth)) & 1) * 4);
                this.#data[this.#octreeDepth - depth][ind + 3] |= 1 << oc;

                this.#data[this.#octreeDepth - depth][ind] = r;

                pow2 *= 2;
            }
            this.setElement(x, y, z, r, 255, b, a, 0, this.#edgeSize);
        }
        else {
            this.setElement(x, y, z, r, 255, b, 0, 0, this.#edgeSize);
            let xo = x, yo = y, zo = z;
            let pow2 = 0.5 * this.#edgeSize;
            let cut_branches = true;
            for (let depth = 0; depth < this.#octreeDepth; depth++) {

                xo >>= 1;
                yo >>= 1;
                zo >>= 1;
                let oc = (((x >> depth) & 1) * 1) + (((y >> depth) & 1) * 2) + (((z >> depth) & 1) * 4);

                let ind = xo * 4 + (yo * pow2 + zo * pow2 * pow2) * 4 * this.#pixelsPerVoxel;
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
