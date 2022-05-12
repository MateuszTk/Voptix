#version 300 es
precision mediump float;

uniform sampler2D color[3];
uniform vec2 screen_size;

out vec4[2] outColor;

void main() {
    //vec4 lightcoord = texture(color[1], gl_FragCoord.xy/screen_size);
    vec4 light = vec4(0.0f);
    const float samples = 1.0f;
    float cnt = 0.0f;
    vec2 pos = vec2(0.0f);
    //for(pos.x = -samples; pos.x < samples; pos.x++){
        //for(pos.y = -samples; pos.y < samples; pos.y++){
            //vec4 t = texture(color[1], clamp((pos+gl_FragCoord.xy)/screen_size, 0.0f, 1.0f));
            //if(lightcoord.xyz == t.xyz){
                //cnt++;
                light = texture(color[2], gl_FragCoord.xy / screen_size);//vec4 p_light =
                /*pos = vec2(0.0f, 1.0f);
                light += texture(color[2], clamp((pos + gl_FragCoord.xy) / screen_size, 0.0f, 1.0f));
                pos = vec2(0.0f, -1.0f);
                light += texture(color[2], clamp((pos + gl_FragCoord.xy) / screen_size, 0.0f, 1.0f));
                pos = vec2(1.0f, 0.0f);
                light += texture(color[2], clamp((pos + gl_FragCoord.xy) / screen_size, 0.0f, 1.0f));
                pos = vec2(-1.0f, 0.0f);
                light += texture(color[2], clamp((pos + gl_FragCoord.xy) / screen_size, 0.0f, 1.0f));*/
            //}
        //}
    //}
    //light /= cnt;
    // 
    //light = (light + p_light) / 5.0f;
    //light.w = p_light.w;
    outColor[1] = light;//vec4(gl_FragCoord.x / screen_size.x);

    //light = clamp(texture(color[0], gl_FragCoord.xy / screen_size) * (0.5f + light), 0.0f, 1.0f);
    outColor[0] = texture(color[0], gl_FragCoord.xy / screen_size);
}
