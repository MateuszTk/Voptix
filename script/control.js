document.addEventListener('pointerlockchange', lockChange, false);
document.addEventListener('mozpointerlockchange', lockChange, false);

function handleCanvasClick(event) {
    document.body.requestPointerLock();
    locked = true;
    brush_lock = true;
}

function lockChange() {
    if (!(document.pointerLockElement === document.body || document.mozPointerLockElement === document.body)) {
        locked = false;
        console.log('The pointer lock status is now unlocked');
        //show toolbars
        document.getElementById('right-toolbar-editor').style.display = 'block';
        document.getElementById('right-toolbar-container').style.width = '600px';
    }
    else {
        document.getElementById('right-toolbar-editor').style.display = 'none';
        document.getElementById('right-toolbar-container').style.width = '0px';
    }
}

document.onmousemove = handleMouseMove;
function handleMouseMove(event) {
    if (locked) {
        mouseX += event.movementX;
        mouseY += event.movementY;
    }
}

document.onmousedown = handleMouseClick;
function handleMouseClick(event) {
    if (locked) {
        if (!brush_lock) {
            switch (event.button) {
                case 0:
                    paint = 1;
                    break;
                //pick color
                case 1:
                    event.preventDefault();
                    paint = 5;
                    break;
                case 2:
                    paint = 2;
                    break;
            }
        }
        else brush_lock = false;
    }
}

window.addEventListener("wheel", function (event) {
    brush.palette_id = clamp(brush.palette_id + (event.deltaY > 0 ? 1 : -1), 0, 255);
    displayPreviews();
    updateSliders();
});

window.addEventListener("keydown", function (event) {
    if (locked) {
        glMatrix.vec3.normalize(direction, direction);

        var vec = glMatrix.vec3.create();
        var vec_up = glMatrix.vec3.create();
        vec_up[1] = 1;
        switch (event.code) {
            case "KeyW":
            case "ArrowUp":
                glMatrix.vec3.scaleAndAdd(pos, pos, direction, speed);
                break;

            case "KeyS":
            case "ArrowDown":
                glMatrix.vec3.scaleAndAdd(pos, pos, direction, -speed);
                break;

            case "KeyA":
            case "ArrowLeft":
                glMatrix.vec3.cross(vec, direction, vec_up);
                glMatrix.vec3.normalize(vec, vec);
                glMatrix.vec3.scaleAndAdd(pos, pos, vec, speed);
                break;

            case "KeyD":
            case "ArrowRight":
                glMatrix.vec3.cross(vec, direction, vec_up);
                glMatrix.vec3.normalize(vec, vec);
                glMatrix.vec3.scaleAndAdd(pos, pos, vec, -speed);
                break;

            case "KeyQ":
                pos[1] -= speed;
                break;
            case "KeyE":
                pos[1] += speed;
                break;

            //fill
            case "KeyZ":
                paint = 3;
                break;

            //fill empty
            case "KeyX":
                paint = 4
                break;

            //select edit mode
            case "KeyP":
                subvoxel_paint = !subvoxel_paint;
                console.log("subvoxel_paint: " + subvoxel_paint);
                break;

            case "Space":
                paint = 1;
                break;

            case "Enter":
                document.exitPointerLock();
                break;

            default:
                break;
        }
    }

    switch (event.code) {
        //copy
        case "KeyC":
            copy();
            break;

        //paste
        case "KeyV":
            paste();
            break;

        default:
            break;
    }

}, true);


var previewContext = [];
var previewImageData = [];
var centerId = 0;

function initBlockPicker() {
    let pickerPanel = document.getElementById("right-toolbar-blockPicker");
    let pickerPanelHeight = Math.max(pickerPanel.offsetHeight, 100);
    let top = 10;
    centerId = Math.floor((pickerPanelHeight - 10) / 100 / 2);
    let num = 0;

    while (top < pickerPanelHeight) {
        var blockCanvas = document.createElement('canvas');
        blockCanvas.setAttribute("id", "right-toolbar-blockPicker-block");
        blockCanvas.setAttribute("width", "8");
        blockCanvas.setAttribute("height", "8");
        blockCanvas.style.top = top + 'px';

        //change color of the middle preview frame
        if (num == centerId) blockCanvas.style.borderColor = "orange";
        num++;

        pickerPanel.appendChild(blockCanvas);
        top += 100;
        previewContext.push(blockCanvas.getContext('2d'));
    } 
}

function generatePreviews() {
    for (let i = 0; i < pal_size; i++) {

        var idatat;
        //if array is not full create new data, else reuse
        if (previewImageData.length < pal_size)
            idatat = new ImageData(8, 8);
        else
            idatat = previewImageData[i];

        var pixels = idatat.data;

        for (let x = 0; x < subSize; x++) {
            for (let y = 0; y < subSize; y++) {
                let off = (x + y * subSize) * 4;
                let voxel = palGetElement(x, subSize - y - 1, 3, i, 0, 0);
                pixels[off] = voxel[0];
                pixels[off + 1] = voxel[1];
                pixels[off + 2] = voxel[2];
                pixels[off + 3] = voxel[3];
            }
        }
        previewImageData.push(idatat);
    }

    //add empty icon (used for indices out of array bounds)
    if (previewImageData.length == pal_size) {
        previewImageData.push(new ImageData(8, 8));
    }
}

function displayPreviews() {
    if (previewImageData.length >= pal_size) {
        previewContext.forEach((preview, index) => {
            let id = index + brush.palette_id - centerId;
            //last icon is being used for indices out of array bounds
            if (id >= pal_size || id < 0) id = pal_size;
            preview.putImageData(previewImageData[id], 0, 0);
        });
    }
}
