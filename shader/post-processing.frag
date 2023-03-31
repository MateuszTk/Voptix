#version 300 es
precision mediump float;

uniform sampler2D color[2];
uniform vec2 screen_size;

out vec4[2] outColor;

vec2 offsets[4] = vec2[](vec2(0.0f, 1.0f), vec2(0.0f, -1.0f), vec2(1.0f, 0.0f), vec2(-1.0f, 0.0f));

void main() {
    vec4 light = vec4(0.0f);
    const float samples = 1.0f;
    float cnt = 1.0f;
    vec2 pixelPos = gl_FragCoord.xy / screen_size;
    vec2 pos = vec2(0.0f);

    vec4 p_light = texture(color[1], pixelPos);
    vec4 low_light = texture(color[0], pixelPos);
    
    //accumuate light from neighbors
    vec3 p_normal = p_light.xyz;
    if (p_normal != vec3(0, 0, 0)) {
        for (int i = 0; i < 4; i++) {
            pos = clamp((offsets[i] + gl_FragCoord.xy) / screen_size, 0.0f, 1.0f);
            if (p_normal == texture(color[1], pos).xyz) {
                light += texture(color[0], pos);
                cnt++;
            }
        }
    }

    //average light from neighbors and this pixel
    light = (light + low_light) / cnt;

    light.w = low_light.w;
    outColor[0] = p_light;
    outColor[1] = light;  
}
