function palSetElement(x, y, z, r, g, b, a, slot, level, len, element) {
    x += slot * len;
    y += element * len;
    let ind = (x + (y * len + z * len * len * pal_pix_cnt) * pal_size) * 4;
    palette[level][ind] = r;
    palette[level][ind + 1] = g;
    palette[level][ind + 2] = b;
    palette[level][ind + 3] = a;
}

function palSetColor(x, y, z, r, g, b, slot, level, len, element) {
    x += slot * len;
    y += element * len;
    let ind = (x + (y * len + z * len * len * pal_pix_cnt) * pal_size) * 4;
    palette[level][ind] = r;
    palette[level][ind + 1] = g;
    palette[level][ind + 2] = b;
}

function palGetElement(x, y, z, slot, element) {
    x += slot * subSize;
    y += element * subSize;
    let ind = (x + (y * subSize + z * subSize * subSize * pal_pix_cnt) * pal_size) * 4;
    return [
        palette[0][ind],
        palette[0][ind + 1],
        palette[0][ind + 2],
        palette[0][ind + 3]
    ];
}

function pal_octree_set(x, y, z, r, g, b, a, s, e, slot) {
    if (a > 0) {
        //palSetColor(0, 0, 0, (s & 0b11110000) + (e & 0b00001111), 0, 0, slot, 3, 1);
        // iterate until the mask is shifted to target (leaf) layer
        let pow2 = 1;
        let xo, yo, zo;
        for (let depth = 0; depth < subOctreeDepth; depth++) {
            xo = (x >> (subOctreeDepth - depth));
            yo = (y >> (subOctreeDepth - depth)) * pow2;
            zo = (z >> (subOctreeDepth - depth)) * pow2 * pow2;

            let ind = ((xo + slot * pow2) + (yo + zo * pal_pix_cnt) * pal_size) * 4;
            let oc = (((x >> (subOctreeDepth - 1 - depth)) & 1) * 1) + (((y >> (subOctreeDepth - 1 - depth)) & 1) * 2) + (((z >> (subOctreeDepth - 1 - depth)) & 1) * 4);
            palette[subOctreeDepth - depth][ind + 3] |= 1 << oc;

            pow2 *= 2;
        }
        palSetElement(x, y, z, r, g, b, a, slot, 0, subSize, 0);
        palSetElement(x, y, z, s, e, 0, 0, slot, 0, subSize, 1);
    }
    else {
        palSetElement(x, y, z, 0, 0, 0, 0, slot, 0, subSize, 0);
        palSetElement(x, y, z, 0, 0, 0, 0, slot, 0, subSize, 1);
        let xo = x, yo = y, zo = z;
        let pow2 = 0.5 * subSize;
        let cut_branches = true;
        for (let depth = 0; depth < subOctreeDepth; depth++) {

            xo >>= 1;
            yo >>= 1;
            zo >>= 1;
            oc = (((x >> depth) & 1) * 1) + (((y >> depth) & 1) * 2) + (((z >> depth) & 1) * 4);

            let ind = (xo + slot * pow2) * 4 + (yo * pow2 + zo * pow2 * pow2 * pal_pix_cnt) * pal_size * 4;
            if (cut_branches) {
                palette[depth + 1][ind + 3] &= ~(1 << oc);
            }
            if (palette[depth + 1][ind + 3] != 0) { cut_branches = false; }
            pow2 /= 2;
        }
    }
    /*if (a > 0) {
        palSetElement(x, y, z, r, g, b, a, slot, 0, 8);
        palSetElement(x >> 1, y >> 1, z >> 1, r, g, b, a, slot, 1, 4);
        palSetElement(x >> 2, y >> 2, z >> 2, r, g, b, a, slot, 2, 2);
        palSetElement(0, 0, 0, (s & 0b11110000) + (e & 0b00001111), 0, 0, 255, slot, 3, 1);
    }
    else {
        //TODO cut branches
        palSetElement(x, y, z, r, g, b, 0, slot, 0, 8);
    }*/
}

//set voxel values in data texture
function setElement(x, y, z, r, g, b, a, chunk, level, len) {
    let ind = (x + (y * len + z * len * len) * pixelsPerVoxel) * 4 ;
    pixels[chunk][level][ind] = r;
    pixels[chunk][level][ind + 1] = g;
    pixels[chunk][level][ind + 2] = b;
    pixels[chunk][level][ind + 3] = a;
}

//get voxel values from data texture
function getElement(x, y, z, chunk, level, len) {
    let ind = (x + (y * len + z * len * len) * pixelsPerVoxel) * 4;
    return [pixels[chunk][level][ind],
    pixels[chunk][level][ind + 1],
    pixels[chunk][level][ind + 2],
    pixels[chunk][level][ind + 3]
    ];
}

//set voxel values in the chunk in the given position
function octree_set(x, y, z, r, g, b, a, chunk) {
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
                        pixels[chunk][octree_depth - 1 - depth][nc * 4 + 1] = 255;
                    }


            let oc = (((x >> (octree_depth - 1 - depth)) & 1) * 1) + (((y >> (octree_depth - 1 - depth)) & 1) * 2) + (((z >> (octree_depth - 1 - depth)) & 1) * 4);
            pixels[chunk][octree_depth - depth][ind + 3] |= 1 << oc;

            pixels[chunk][octree_depth - depth][ind] = r;

            pow2 *= 2;
        }
        setElement(x, y, z, r, 255, b, a, chunk, 0, size);
    }
    else {
        setElement(x, y, z, r, 255, b, 0, chunk, 0, size);
        let xo = x, yo = y, zo = z;
        let pow2 = 0.5 * size;
        let cut_branches = true;
        for (let depth = 0; depth < octree_depth; depth++) {

            xo >>= 1;
            yo >>= 1;
            zo >>= 1;
            oc = (((x >> depth) & 1) * 1) + (((y >> depth) & 1) * 2) + (((z >> depth) & 1) * 4);

            let ind = xo * 4 + (yo * pow2 + zo * pow2 * pow2) * 4 * pixelsPerVoxel;
            if (cut_branches) {
                pixels[chunk][depth + 1][ind + 3] &= ~(1 << oc);
                if (depth > 0) {
                    for (let xs = 0; xs < 2; xs++)
                        for (let ys = 0; ys < 2; ys++)
                            for (let zs = 0; zs < 2; zs++) {
                                let nc = ((x >> (depth)) << 1) + xs +
                                    (((y >> (depth)) << 1) + ys) * pow2 * 4 +
                                    (((z >> (depth)) << 1) + zs) * pow2 * pow2 * 16;
                                pixels[chunk][(depth - 1)][nc * 4 + 1] = 0;
                            }
                }
            }
            if (pixels[chunk][depth + 1][ind + 3] != 0) { cut_branches = false; }
            pow2 /= 2;
        }
    }


}

function chunk_octree_set(x, y, z, r, g, b, a, chunk) {
    if (a > 0) {
        // iterate until the mask is shifted to target (leaf) layer
        let pow2 = 1;
        let xo, yo, zo;
        for (let depth = 0; depth < octree_depth; depth++) {
            xo = (x >> (octree_depth - depth));
            yo = (y >> (octree_depth - depth)) * pow2;
            zo = (z >> (octree_depth - depth)) * pow2 * pow2;

            let ind = (xo + yo + zo) * 4;

            let ind_zero = xo * 2 + yo * 2 * 2 + zo * 2 * 4;

            for (let xs = 0; xs < 2; xs++)
                for (let ys = 0; ys < 2; ys++)
                    for (let zs = 0; zs < 2; zs++) {
                        let nc = ind_zero + xs + (ys * 2 + zs * pow2 * 4) * pow2;
                        chunk[octree_depth - 1 - depth][nc * 4 + 1] = 255;
                    }


            let oc = (((x >> (octree_depth - 1 - depth)) & 1) * 1) + (((y >> (octree_depth - 1 - depth)) & 1) * 2) + (((z >> (octree_depth - 1 - depth)) & 1) * 4);
            chunk[octree_depth - depth][ind + 3] |= 1 << oc;

            chunk[octree_depth - depth][ind] = r;

            pow2 *= 2;
        }

        let ind = x * 4 + (y * size + z * size * size) * 4;
        chunk[0][ind] = r;
        chunk[0][ind + 1] = 255;
        chunk[0][ind + 2] = b;
        chunk[0][ind + 3] = a;
    }
}
