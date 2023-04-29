var sceneConfig = {
    skyColorUP: [0.0, 162 / 255, 1.0],
    skyColorDown: [184 / 255, 242 / 255, 255 / 255],
    skyLight: [0.7, 0.7, 0.7],
    sunColor: [0.8, 0.8, 0.8],
    sunDirection: [2, 1, -1],
    sunSize: 0.18,
    sunDiscSharpness: 256.0,
    sunShadowSharpness: 0.1
};

//called after initialization process is complete
function start() {
    let vari = 0;
    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            for (let z = 4; z < 8; z++) {
                if (Math.random() < 0.5)
                    pal_octree_set(x, z, y, 0, 200, 0, 255, 0, 0, 0, 0, vari);
            }

            for (let z = 0; z < 4; z++) {
                pal_octree_set(x, z, y, getRandomArbitrary(80, 110), 42, 0, 255, 0, 0, 0, 0, vari);
            }
        }
    }

    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            for (let z = 0; z < 8; z++) {
                let color = getRandomArbitrary(60, 180);
                if (Math.random() < 0.5)
                    pal_octree_set(x, z, y, color, color, color, 255, 0, 0, 0, 1, vari);
            }
        }
    }

    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            for (let z = 0; z < 8; z++) {
                pal_octree_set(x, z, y, getRandomArbitrary(80, 110), 42, 0, 255, 0, 0, 0, 2, vari);
            }
        }
    }

    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            for (let z = 0; z < 8; z++) {
                pal_octree_set(x, z, y, 0, Math.random() * 120, 255, 255, getRandomArbitrary(0, 200), 0, 0, 3, vari);
            }
        }
    }

    for (let x = 3; x < 4; x++) {
        for (let y = 0; y < 6; y++) {
            for (let z = 3; z < 4; z++) {
                pal_octree_set(x, y, z, 110, 42, 0, 255, 0, 0, 0, 4, vari);
            }
        }

        for (let y = 6; y < 8; y++) {
            for (let z = 3; z < 4; z++) {
                pal_octree_set(x, y, z, 255, 150, 0, 255, 0, 255, 0, 4, vari);
            }
        }
    }

    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            for (let z = 0; z < 8; z++) {
                pal_octree_set(x, z, y, 255, 255, 255, 255, 0, 255, 0, 5, 0);
            }
        }
    }

    for (let i = 0; i < pal_size; i++) {
        let startVariant = (i > 5) ? 0 : 1;
        for (let variant = startVariant; variant < pal_variants; variant++) {
            for (let x = 6; x < 10; x++) {
                pal_octree_set(x % 8, 0, 0, 50, 50, 50, 255, 0, 0, 0, i, variant);
                pal_octree_set(x % 8, 7, 0, 50, 50, 50, 255, 0, 0, 0, i, variant);
                pal_octree_set(x % 8, 0, 7, 50, 50, 50, 255, 0, 0, 0, i, variant);
                pal_octree_set(x % 8, 7, 7, 50, 50, 50, 255, 0, 0, 0, i, variant);
            }
            for (let y = 6; y < 10; y++) {
                pal_octree_set(0, y % 8, 0, 50, 50, 50, 255, 0, 0, 0, i, variant);
                pal_octree_set(7, y % 8, 0, 50, 50, 50, 255, 0, 0, 0, i, variant);
                pal_octree_set(0, y % 8, 7, 50, 50, 50, 255, 0, 0, 0, i, variant);
                pal_octree_set(7, y % 8, 7, 50, 50, 50, 255, 0, 0, 0, i, variant);
            }
            for (let z = 6; z < 10; z++) {
                pal_octree_set(0, 0, z % 8, 50, 50, 50, 255, 0, 0, 0, i, variant);
                pal_octree_set(0, 7, z % 8, 50, 50, 50, 255, 0, 0, 0, i, variant);
                pal_octree_set(7, 0, z % 8, 50, 50, 50, 255, 0, 0, 0, i, variant);
                pal_octree_set(7, 7, z % 8, 50, 50, 50, 255, 0, 0, 0, i, variant);
            }
        }
    }

    updatePalette();
}

//called when new chunk is to be generated
//x, y, z are chunk position
//size is the size of the chunk
//chunk_index is a number which should be passed to "octree_set" function
function chunkFunction(x, y, z, size, chunk_index) {
    noise.seed(8888);//Math.random());
    const frequency = 2.0;
    const fx = size / frequency;
    const fs = 2.0 * size / frequency;
    for (let _x = 0; _x < size; _x++) {
        for (let _z = 0; _z < size; _z++) {

            if (y < 128) {
                let surface = noise.simplex2((x + _x) / fs, (z + _z) / fs) * 16 + 48;

                for (let _y = 0; _y < size; _y++) {
                    if (_y < surface) {
                        let value = noise.simplex3((x + _x) / fx, (y + _y) / fx, (z + _z) / fx) * 255;
                        let clp = clamp(value + 0, 0, 255);

                        let r = 1;

                        // grass layer
                        if (_y > surface - 1) {
                            r = 0;
                        }

                        // dirt layer
                        else if (_y > surface - 8) {
                            r = 2;
                        }

                        if (clp > 0)
                            octree_set(_x, _y, _z, r, 255, 0, 255, chunk_index);
                        else if (_y < 1) {
                            r = 0;
                            octree_set(_x, _y, _z, 3, 255, 0, 255, chunk_index);
                        }

                    }
                }
            }
        }
    }
}
