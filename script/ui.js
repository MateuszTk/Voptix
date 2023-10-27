function resize(swidth, sheight) {
	localStorage.setItem("swidth", swidth);
	localStorage.setItem("sheight", sheight);
}

function resize() {
	const resolution = document.getElementById("resolutionSelect").value.split('x');
	const scale = document.getElementById("resScale").value;
	localStorage.setItem("swidth", Math.floor(resolution[0] * scale / 100 / 2) * 2);
	localStorage.setItem("sheight", Math.floor(resolution[1] * scale / 100 / 2) * 2);
}

function updateSliders() {
	r = brush.color_r;
	g = brush.color_g;
	b = brush.color_b;
	p = brush.palette_id;
	v = brush.variant;

	sliderR.value = r;
	sliderG.value = g;
	sliderB.value = b;
	sliderP.value = p;
	sliderV.value = v;

	outputR.innerHTML = r;
	outputG.innerHTML = g;
	outputB.innerHTML = b;
	outputP.innerHTML = p;
	outputV.innerHTML = v;

	previewMask.style.backgroundColor = ["rgb(", r, ",", g, ",", b, ")"].join("");
	displayPreviews();
}

function updateBrush() {
	brush.color_r = r;
	brush.color_g = g;
	brush.color_b = b;
	brush.clarity = c;
	brush.emission = e;
	brush.roughness = ro;
	brush.palette_id = p;
	brush.variant = v;
}

//called by switching tabs
function openTab(tab) {
	if (tab == 1) {
		document.getElementById("blockTab").style.display = "contents";
		document.getElementById("blockTabLink").className = "active";
		document.getElementById("worldTab").style.display = "none";
		document.getElementById("worldTabLink").className = "";
	}
	else {
		setPrecision(false);
		showPrecision(false);
		document.getElementById("blockTab").style.display = "none";
		document.getElementById("blockTabLink").className = "";
		document.getElementById("worldTab").style.display = "contents";
		document.getElementById("worldTabLink").className = "active";
	}
}

//show current precision mode
var precisionPrompt = document.getElementById("precision");
function showPrecision(precision) {
	precisionPrompt.innerText = (precision) ? "Sub-voxel" : "Voxel";
}

//called by precision button
function precisionButton() {
	let subvoxelMode = togglePrecision();
	openTab(((subvoxelMode) ? 1 : 0));
	showPrecision(subvoxelMode);
}
openTab(0);

function readResolution(canvas) {
	let sw = localStorage.getItem("swidth");
	let sh = localStorage.getItem("sheight");

	if (!sw || !sh) {
		sw = canvas.width;
		sh = canvas.height;
		localStorage.setItem("swidth", canvas.width);
		localStorage.setItem("sheight", canvas.height);
	}

	const resolution = sw.toString() + "x" + sh.toString();
	if (document.querySelector("#resolutionSelect option[value='" + resolution + "']"))
		document.getElementById("resolutionSelect").value = resolution;
	else {
		let option = document.createElement("option");
		option.value = resolution;
		option.innerText = resolution;
		document.getElementById("resolutionSelect").appendChild(option);
		document.getElementById("resolutionSelect").value = resolution;
	}
	scaleUpdate(100);
	return [sw, sh];
}

function scaleUpdate(scale = -1) {
	if (scale < 0) {
		scale = document.getElementById("resScale").value;
	}
	else {
		document.getElementById("resScale").value = scale;
    }
	const resolution = document.getElementById("resolutionSelect").value.split('x');
	document.getElementById("resScaleText").innerHTML = scale + "%";
	document.getElementById("resText").innerHTML = Math.floor(resolution[0] * scale / 100 / 2) * 2 + " x " + Math.floor(resolution[1] * scale / 100 / 2) * 2;
}
scaleUpdate();

function updateQuality() {
	let sliderGIsampl = document.getElementById("GI_samples");
	let outputGIsampl = document.getElementById("GI_samples_text");
	outputGIsampl.innerHTML = sliderGIsampl.value;
	graphicsSettings.GI_samples = parseInt(sliderGIsampl.value);

	let sliderReflBounces = document.getElementById("refl_bounces");
	let outputReflBounces = document.getElementById("refl_bounces_text");
	outputReflBounces.innerHTML = sliderReflBounces.value;
	graphicsSettings.reflection_samples = parseInt(sliderReflBounces.value);
}
updateQuality();

var r = 255, g = 255, b = 255, c = 0, e = 0, p = 0, v = 0, ro = 0;
var gora = document.getElementById("matPreview");
var previewMask = document.getElementById("previewMask");

var sliderR = document.getElementById("RRange");
var outputR = document.getElementById("Rtext");
var sliderG = document.getElementById("GRange");
var outputG = document.getElementById("Gtext");
var sliderB = document.getElementById("BRange");
var outputB = document.getElementById("Btext");
var sliderA = document.getElementById("ARange");
var outputA = document.getElementById("Atext");
var sliderE = document.getElementById("ERange");
var outputE = document.getElementById("Etext");
var sliderP = document.getElementById("PRange");
var outputP = document.getElementById("Ptext");
var sliderV = document.getElementById("VRange");
var outputV = document.getElementById("Vtext");
var sliderRo = document.getElementById("RoRange");
var outputRo = document.getElementById("Rotext");
var bs = 1;
var circle = document.getElementById("circle");
var zaznaczenie = document.getElementById('kwadratowypedzelid');
var slider4 = document.getElementById("BsRange");
var output4 = document.getElementById("demo4");
var slider5 = document.getElementById("MSRange");
var output5 = document.getElementById("demo5");
var slider6 = document.getElementById("FSRange");
var output6 = document.getElementById("demo6");

outputR.innerHTML = sliderR.value; // Display the default slider value
sliderR.oninput = function () {
	outputR.innerHTML = sliderR.value;
	r = parseInt(sliderR.value);
	previewMask.style.backgroundColor = ["rgb(", r, ",", g, ",", b, ")"].join("");
	updateBrush();
}

outputG.innerHTML = sliderG.value; // Display the default slider value
sliderG.oninput = function () {
	outputG.innerHTML = sliderG.value;
	g = parseInt(sliderG.value);
	previewMask.style.backgroundColor = ["rgb(", r, ",", g, ",", b, ")"].join("");
	updateBrush();
}

outputB.innerHTML = sliderB.value; // Display the default slider value
sliderB.oninput = function () {
	outputB.innerHTML = sliderB.value;
	b = parseInt(sliderB.value);
	previewMask.style.backgroundColor = ["rgb(", r, ",", g, ",", b, ")"].join("");
	updateBrush();
}

outputA.innerHTML = sliderA.value; // Display the default slider value
sliderA.oninput = function () {
	outputA.innerHTML = sliderA.value;
	c = parseInt(sliderA.value);
	gora.style.opacity = c / 255;
	updateBrush();
}

outputE.innerHTML = sliderE.value; // Display the default slider value
sliderE.oninput = function () {
	outputE.innerHTML = sliderE.value;
	e = parseInt(sliderE.value);
	updateBrush();
}

outputRo.innerHTML = sliderRo.value; // Display the default slider value
sliderRo.oninput = function () {
	outputRo.innerHTML = sliderRo.value;
	ro = parseInt(sliderRo.value);
	gora.style.filter = "blur(" + ro / 50 + "px)";
	updateBrush();
}

outputP.innerHTML = sliderP.value; // Display the default slider value
sliderP.oninput = function () {
	outputP.innerHTML = sliderP.value;
	p = parseInt(sliderP.value);
	updateBrush();

	displayPreviews();
}

outputV.innerHTML = sliderV.value; // Display the default slider value
sliderV.oninput = function () {
	outputV.innerHTML = sliderV.value;
	v = parseInt(sliderV.value);
	updateBrush();

	displayPreviews();
}

sliderR.value = r;
sliderG.value = g;
sliderB.value = b;
sliderA.value = c;
sliderE.value = e;
sliderRo.value = ro;
sliderP.value = p;
sliderV.value = v;

outputR.innerHTML = r;
outputG.innerHTML = g;
outputB.innerHTML = b;
outputA.innerHTML = c;
outputE.innerHTML = e;
outputRo.innerHTML = ro;
outputP.innerHTML = p;
outputV.innerHTML = v;

gora.style.opacity = c / 255;
gora.style.filter = "blur(" + ro / 50 + "px)";
previewMask.style.backgroundColor = ["rgb(", r, ",", g, ",", b, ")"].join("");
updateBrush();

output4.innerHTML = slider4.value; // Display the default slider value
slider4.oninput = function () {
	output4.innerHTML = slider4.value;
	bs = parseInt(slider4.value);
	circle.style.height = (bs * 2).toString() + "px";
	circle.style.width = (bs * 2).toString() + "px";
	var x = 40;
	var y = 40;

	circle.style.left = (x - bs * 2 / 2).toString() + "px";
	circle.style.top = (y - bs * 1).toString() + "px";
	brush.diameter = bs;
}
zaznaczenie.checked = false;
brush.type = zaznaczenie.checked;
zaznaczenie.addEventListener('change', () => {
	if (zaznaczenie.checked) {
		circle.style.borderRadius = (0).toString() + "%";
		console.log("z");
	}
	else {
		circle.style.borderRadius = (50).toString() + "%";
	}
	brush.type = zaznaczenie.checked;
});

slider4.value = bs;

circle.style.height = (bs * 2).toString() + "px";
circle.style.width = (bs * 2).toString() + "px";
brush.diameter = bs;
output4.innerHTML = bs;

var ms = 50;
var fs = 50;

output5.innerHTML = slider5.value; // Display the default slider value
slider5.oninput = function () {
	output5.innerHTML = slider5.value;
	ms = parseInt(slider5.value);
	sensivity = ms / 100;
}
slider5.value = ms;
output5.innerHTML = ms;
sensivity = ms / 100;

output6.innerHTML = slider6.value; // Display the default slider value
slider6.oninput = function () {
	output6.innerHTML = slider6.value;
	fs = parseInt(slider6.value);
	speed = fs / 50;
}
slider6.value = fs;
output6.innerHTML = fs;
speed = fs / 50;
