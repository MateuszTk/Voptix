// vector representing where the camera is currently pointing
var direction = glMatrix.vec3.create();
var sensivity = 0.8;
var speed = 1.0;

document.addEventListener('pointerlockchange', lockChange, false);
document.addEventListener('mozpointerlockchange', lockChange, false);

function handleCanvasClick() {
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

var cursorPosX = 0, cursorPosY = 0;

document.onmousemove = handleMouseMove;
function handleMouseMove(event) {
    if (locked) {
        mouseX += event.movementX;
        mouseY += event.movementY;
    }
    cursorPosX = event.clientX;
    cursorPosY = event.clientY;
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
    if (locked || window.innerWidth - cursorPosX > 600) {
        if (shift == false)
            brush.palette_id = clamp(brush.palette_id + (event.deltaY > 0 ? 1 : -1), 0, 255);
        else
            brush.variant = clamp(brush.variant + (event.deltaY > 0 ? -1 : 1), 0, 8);

        displayPreviews();
        updateSliders();
    }
});

var acceleration = 0.1;

window.addEventListener("keydown", function (event) {
    if (locked) {
        glMatrix.vec3.normalize(direction, direction);

        var vec = glMatrix.vec3.create();
        var vec_up = glMatrix.vec3.create();
        vec_up[1] = 1;
        let realSpeed = speed * deltaTime * 0.04 * Math.sqrt(acceleration);
        acceleration = clamp(acceleration * (1 + deltaTime * 0.1), 0.1, 1);

        switch (event.code) {
            case "KeyW":
            case "ArrowUp":
                glMatrix.vec3.scaleAndAdd(pos, pos, direction, realSpeed);
                break;

            case "KeyS":
            case "ArrowDown":
                glMatrix.vec3.scaleAndAdd(pos, pos, direction, -realSpeed);
                break;

            case "KeyA":
            case "ArrowLeft":
                glMatrix.vec3.cross(vec, direction, vec_up);
                glMatrix.vec3.normalize(vec, vec);
                glMatrix.vec3.scaleAndAdd(pos, pos, vec, realSpeed);
                break;

            case "KeyD":
            case "ArrowRight":
                glMatrix.vec3.cross(vec, direction, vec_up);
                glMatrix.vec3.normalize(vec, vec);
                glMatrix.vec3.scaleAndAdd(pos, pos, vec, -realSpeed);
                break;

            case "KeyQ":
                pos[1] -= realSpeed;
                break;
            case "KeyE":
                pos[1] += realSpeed;
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
                togglePrecision();
                break;

            case "Space":
                paint = 1;
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

        //show variants panel
        case "ShiftLeft":
            variantsPanel.style.display = 'block';
            shift = true;
            break;

        //exit pointer lock
        case "KeyF":
            if (locked)
                document.exitPointerLock();
            else
                handleCanvasClick();
            break;

        default:
            break;
    }

}, true);

window.addEventListener("keyup", function (event) {

    switch (event.code) {
        //copy
        case "ShiftLeft":
            variantsPanel.style.display = 'none';
            shift = false;
            break;

        case "KeyW":
        case "ArrowUp":
        case "KeyS":
        case "ArrowDown":
        case "KeyA":
        case "ArrowLeft":
        case "KeyD":
        case "ArrowRight":
        case "KeyQ":
        case "KeyE":
            acceleration = 0.1;
            break;

        default:
            break;
    }

}, true);

function togglePrecision() {
    subvoxel_paint = !subvoxel_paint;
    showPrecision(subvoxel_paint);
    console.log("subvoxel_paint: " + subvoxel_paint);
}

var shift = false;
var previewContext = [];
//variantPreview: [0] - canvas; [1] - context;
var variantPreview = [];
var previewImageData = [];
var variantsPanel;
var centerId = 0;

function initBlockPicker() {
    let pickerPanel = document.getElementById("right-toolbar-blockPicker");
    let pickerPanelHeight = Math.max(pickerPanel.offsetHeight, 100);
    let top = 10;
    centerId = Math.floor((pickerPanelHeight - 10) / 100 / 2);
    let num = 0;

    while (top < pickerPanelHeight) {
        var blockCanvas = document.createElement('canvas');
        //apply special style to the preview frame in the center
        if (num == centerId) {
            blockCanvas.setAttribute("class", "right-toolbar-blockPicker-block-center");

            //variant previews
            variantsPanel = document.createElement('div');
            variantsPanel.setAttribute("class", "right-toolbar-blockPicker-block");
            variantsPanel.style.top = top + 'px';
            //hidden by default; keyboard activated
            variantsPanel.style.display = 'none';

            for (let x = 0; x < 8; x++) {
                var variantCanvas = document.createElement('canvas');
                variantCanvas.setAttribute("class", "right-toolbar-blockPicker-block");
                variantCanvas.setAttribute("width", "8");
                variantCanvas.setAttribute("height", "8");
                variantCanvas.style.top = '-2px';
                variantCanvas.style.left = ((x + 1) * -74) + 'px';
                variantsPanel.appendChild(variantCanvas);
                variantPreview.push([variantCanvas, variantCanvas.getContext('2d')]);
            }

            //add the animation icon in place of the last variant
            var animationImg = document.createElement("img");
            animationImg.src = "./images/animation.png";
            animationImg.setAttribute("class", "right-toolbar-blockPicker-block");
            animationImg.style.left = (9 * -74) + 'px';
            variantCanvas.style.top = '-2px';
            variantsPanel.appendChild(animationImg);
            variantPreview.push([animationImg, 0]);


            pickerPanel.appendChild(variantsPanel);
        }
        else blockCanvas.setAttribute("class", "right-toolbar-blockPicker-block");

        blockCanvas.setAttribute("width", "8");
        blockCanvas.setAttribute("height", "8");
        blockCanvas.style.top = top + 'px';

        
        num++;

        pickerPanel.appendChild(blockCanvas);
        top += 100;
        previewContext.push(blockCanvas.getContext('2d'));
    } 
}

function generatePreviews() {
    //if array is not full create new data
    if (previewImageData.length < pal_size) {
         //+1 to add empty icon (used for indices outside the bounds of the array)
        for (let i = 0; i < pal_size + 1; i++) {
            var block = [];
            for (let variant = 0; variant < pal_variants; variant++) {
                block.push(new ImageData(8, 8));
            }
            previewImageData.push(block);
        }        
    }

    for (let i = 0; i < pal_size; i++) {
        for (let variant = 0; variant < pal_variants; variant++) {

            var imdata = previewImageData[i][variant];
            var pixels = imdata.data;

            for (let x = 0; x < subSize; x++) {
                for (let y = 0; y < subSize; y++) {
                    let off = (x + y * subSize) * 4;
                    let voxel = palGetElement(x, subSize - y - 1, 3, i, 0, variant);
                    pixels[off] = voxel[0];
                    pixels[off + 1] = voxel[1];
                    pixels[off + 2] = voxel[2];
                    pixels[off + 3] = voxel[3];
                }
            }
            
        }
    }
}

function displayPreviews() {
    if (previewImageData.length >= pal_size) {
        previewContext.forEach((preview, index) => {
            let id = index + brush.palette_id - centerId;
            //last icon is being used for indices out of array bounds
            if (id >= pal_size || id < 0) id = pal_size;
            preview.putImageData(previewImageData[id][0], 0, 0);
        });
        variantPreview.forEach((preview, index) => {
            let id = brush.palette_id;
            //last icon is being used for indices out of array bounds
            if (id >= pal_size || id < 0) id = pal_size;
            if (index == brush.variant) preview[0].style.borderColor = 'orange';
            else preview[0].style.borderColor = 'blue';
            if (index != pal_variants)
                preview[1].putImageData(previewImageData[id][index], 0, 0);
        });
    }
}
