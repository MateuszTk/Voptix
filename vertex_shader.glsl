#version 300 es

in vec3 coordinates;

void main() {
	gl_Position = vec4(coordinates, 1.0);
}
