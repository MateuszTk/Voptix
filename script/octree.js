function palSetElement(x, y, z, r, g, b, a, slot, level, len) {
    x += slot * len;
    let ind = (x + (y * len + z * len * len) * pal_size) * 4;
    palette[level][ind] = r;
    palette[level][ind + 1] = g;
    palette[level][ind + 2] = b;
    palette[level][ind + 3] = a;
}

function pal_octree_set(x, y, z, r, g, b, a, s, e, slot) {
    palSetElement(x, y, z, r, g, b, a, slot, 0, 8);
    palSetElement(x >> 1, y >> 1, z >> 1, r, g, b, a, slot, 1, 4);
    palSetElement(x >> 2, y >> 2, z >> 2, r, g, b, a, slot, 2, 2);
    palSetElement(0, 0, 0, (s & 0b11110000) + (e & 0b00001111), 0, 0, 255, slot, 3, 1);
}

//set voxel values in data texture
function setElement(x, y, z, r, g, b, a, chunk, level, len) {
    let ind = x * 4 + (y * len + z * len * len) * 4 * pixelsPerVoxel;
    pixels[chunk][level][ind] = r;
    pixels[chunk][level][ind + 1] = g;
    pixels[chunk][level][ind + 2] = b;
    pixels[chunk][level][ind + 3] = a;
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
