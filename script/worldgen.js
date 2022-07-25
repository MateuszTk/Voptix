
//called after initialization process is complete
function start() {
    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            for (let z = 4; z < 8; z++) {
                if (Math.random() < 0.5)
                    pal_octree_set(x, z, y, 0, 200, 0, 255, 0, 0, 0);
            }

            for (let z = 0; z < 4; z++) {
                pal_octree_set(x, z, y, getRandomArbitrary(80, 110), 42, 0, 255, 0, 0, 0);
            }
        }
    }

    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            for (let z = 0; z < 8; z++) {
                let color = getRandomArbitrary(60, 180);
                if (Math.random() < 0.5)
                    pal_octree_set(x, z, y, color, color, color, 255, 0, 0, 1);
            }
        }
    }

    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            for (let z = 0; z < 8; z++) {
                pal_octree_set(x, z, y, getRandomArbitrary(80, 110), 42, 0, 255, 0, 0, 2);
            }
        }
    }

    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            for (let z = 0; z < 8; z++) {
                pal_octree_set(x, z, y, 0, Math.random() * 120, 255, 255, Math.random() * 255, 0, 3);
            }
        }
    }

    for (let x = 3; x < 4; x++) {
        for (let y = 0; y < 6; y++) {
            for (let z = 3; z < 4; z++) {
                pal_octree_set(x, y, z, getRandomArbitrary(100, 120), 42, 0, 255, Math.random() * 255, 0, 4);
            }
        }

        for (let y = 6; y < 8; y++) {
            for (let z = 3; z < 4; z++) {
                pal_octree_set(x, y, z, 255, 100, 0, 255, 0, 255, 4);
            }
        }
    }

    updatePalette();
}

//called when new chunk is to be generated
//x, y, z are chunk position
//size is chunk size
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

                        let r = 1;//clamp(value, 20, 40) * 5, g = clamp(value, 20, 40) * 5, b = clamp(value, 20, 40) * 5;

                        // grass layer
                        if (_y > surface - 1) {
                            r = 0; b = 0;
                            g = clamp(value, 150, 200);
                        }

                        // dirt layer
                        else if (_y > surface - 8) {
                            g = 60; b = 0;
                            r = 2;//clamp(value, 90, 180);
                        }

                        if (clp > 0)
                            octree_set(_x, _y, _z, r, g, b, 255, chunk_index);
                        else if (_y < 1) {
                            r = 0;
                            b = 240;
                            g = clamp((value + 255) / 2, 0, 240);
                            //addToPalette(0, g, b, 20, 0);
                            octree_set(_x, _y, _z, 3, g, b, 255, chunk_index);
                        }

                    }
                }
            }
        }
    }
}
