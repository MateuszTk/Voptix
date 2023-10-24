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
        this.#data[level][ind] = r;
        this.#data[level][ind + 1] = g;
        this.#data[level][ind + 2] = b;
        this.#data[level][ind + 3] = a;
    }

    //get voxel values from data texture
    getElement(x, y, z, level, len) {
        let ind = (x + (y * len + z * len * len) * pixelsPerVoxel) * 4;
        return [
            this.#data[level][ind],
            this.#data[level][ind + 1],
            this.#data[level][ind + 2],
            this.#data[level][ind + 3]
        ];
    }

    //set voxel values in the chunk in the given position
    octree_set(x, y, z, r, g, b, a) {
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
            this.setElement(x, y, z, r, 255, b, a, 0, size);
        }
        else {
            this.setElement(x, y, z, r, 255, b, 0, 0, size);
            let xo = x, yo = y, zo = z;
            let pow2 = 0.5 * size;
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
