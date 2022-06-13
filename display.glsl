#version 300 es
precision mediump float;

uniform sampler2D color;
uniform vec2 screen_size;

out vec4 outColor;

void main() {
    outColor = texture(color, vec2(gl_FragCoord.x / screen_size.x, gl_FragCoord.y / screen_size.y));
}
