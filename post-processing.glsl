#version 300 es
precision mediump float;

uniform sampler2D color[3];
uniform vec2 screen_size;

out vec4[3] outColor;

void main() {
    //vec4 lightcoord = texture(color[1], gl_FragCoord.xy/screen_size);
    vec4 light = vec4(0.0f);
    const float samples = 1.0f;
    float cnt = 1.0f;
    vec2 pos = vec2(0.0f);

    vec4 p_light = texture(color[2], gl_FragCoord.xy / screen_size);
    vec4 low_light = texture(color[1], gl_FragCoord.xy / screen_size);
    //vec4 p_normal = texture(color[1], gl_FragCoord.xy / screen_size);

    /*pos = vec2(0.0f, 1.0f);
    if (p_normal == texture(color[1], clamp((pos + gl_FragCoord.xy) / screen_size, 0.0f, 1.0f))) {
        light += texture(color[2], clamp((pos + gl_FragCoord.xy) / screen_size, 0.0f, 1.0f));
        cnt++;
    }

    pos = vec2(0.0f, -1.0f);
    if (p_normal == texture(color[1], clamp((pos + gl_FragCoord.xy) / screen_size, 0.0f, 1.0f))) {
        light += texture(color[2], clamp((pos + gl_FragCoord.xy) / screen_size, 0.0f, 1.0f));
        cnt++;
    }

    pos = vec2(1.0f, 0.0f);
    if (p_normal == texture(color[1], clamp((pos + gl_FragCoord.xy) / screen_size, 0.0f, 1.0f))) {
        light += texture(color[2], clamp((pos + gl_FragCoord.xy) / screen_size, 0.0f, 1.0f));
        cnt++;
    }

    pos = vec2(-1.0f, 0.0f);
    if (p_normal == texture(color[1], clamp((pos + gl_FragCoord.xy) / screen_size, 0.0f, 1.0f))) {
        light += texture(color[2], clamp((pos + gl_FragCoord.xy) / screen_size, 0.0f, 1.0f));
        cnt++;
    }*/


    //light = (light + p_light) / 5.0f;
    //light.w = p_light.w;
    outColor[1] = p_light;//vec4(gl_FragCoord.x / screen_size.x);
    outColor[2] = low_light;

    //vec4 normal = texture(color[1], gl_FragCoord.xy / screen_size);
    light = low_light;//(light + p_light) / cnt;
    vec4 prim = texture(color[0], gl_FragCoord.xy / screen_size);
    vec4 outColorPrep = clamp(prim * (0.5f + light), 0.0f, 1.0f);

    outColorPrep.w = prim.w;
    //light = clamp(texture(color[0], gl_FragCoord.xy / screen_size) * (0.5f + light), 0.0f, 1.0f);
    outColor[0] = outColorPrep;//prim;//prim for debug//vec4(low_light.w);//
   
}
