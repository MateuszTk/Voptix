importScripts('chunk.js', 'worldgen.js', 'perlin.js');

self.onmessage = function (e) {
    // { type: "generate", id: i, x: x, y: y, z: z, chunkSize: this.#chunkSize, octreeDepth: this.#chunkOctreeDepth, chunkMap: this.#chunkMap }
    let data = e.data;

    console.log('worker received: ' + data.type);

    switch (e.data.type) {
        case 'generate':
            let chunk = new Chunk(data.x, data.y, data.z, 1, data.octreeDepth);

            chunkFunction(data.x * data.chunkSize, data.y * data.chunkSize, data.z * data.chunkSize, data.chunkSize, chunk, data.worldParameter);

            let buffers = [];
            let idArray = new Uint32Array([data.id]);
            buffers.push(idArray.buffer);
            let chunkPosArray = new Uint32Array([data.x, data.y, data.z]);
            buffers.push(chunkPosArray.buffer);
            for (let i = 0; i < chunk.data.length; i++) {
                buffers.push(chunk.data[i].buffer);
            }

            self.postMessage({ buffers: buffers }, buffers);
            break;

        default:
            console.log('worker received unknown message type: ' + e.data.type);
            break;
    }
}
