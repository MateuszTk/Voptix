#version 300 es
precision mediump float;

uniform sampler2D color0;
uniform sampler2D color1;
uniform sampler2D color2;
uniform vec2 screen_size;

out vec4 outColor;

void main() {
    vec4 light = vec4(0.0f);
    const float samples = 1.0f;
    float cnt = 1.0f;
    vec2 pixelPos = gl_FragCoord.xy / screen_size;
    vec2 pos = vec2(0.0f);

    vec4 p_light = texture(color1, pixelPos);
    vec4 low_light = texture(color2, pixelPos);
    
    vec3 p_normal = p_light.xyz;
    vec2 testPos = vec2(-1.0f, -1.0f);
    if (p_normal != vec3(0, 0, 0)) {
        for (; testPos.y < 2.0f; testPos.y++) {
            for (testPos.x = -1.0f; testPos.x < 2.0f; testPos.x++) {
                if(testPos != vec2(0.0f, 0.0f)) {
                    pos = clamp(((testPos * 9.0f) + gl_FragCoord.xy) / screen_size, 0.0f, 1.0f);
                    if (p_normal == texture(color1, pos).xyz) {
                        light += texture(color2, pos);
                        cnt++;
                    }
                }
            }
        }
    }

    //average light from neighbors and this pixel
    light = (light + low_light) / cnt;

    // tone mapping
    //float exposure = 1.8f;
    //light.xyz = vec3(1.0) - exp(-light.xyz * exposure);

    //gamma correction
    //light = pow(light, vec4(1.0f / 2.2f));

    vec4 prim = texture(color0, pixelPos);
    vec4 outColorPrep = clamp(prim * light, 0.0f, 1.0f);
    outColorPrep.w = prim.w;

    outColor = outColorPrep;
}
