#version 300 es
precision mediump float;

uniform sampler2D color[3];
uniform vec2 screen_size;

out vec4[2] outColor;

void main() {
    vec4 lightcoord = texture(color[1], gl_FragCoord.xy/screen_size);
    vec4 light = vec4(0.0f);
    const float samples = 1.0f;
    float cnt = 0.0f;
    vec2 pos = vec2(0.0f);
    //for(pos.x = -samples; pos.x < samples; pos.x++){
        //for(pos.y = -samples; pos.y < samples; pos.y++){
            //vec4 t = texture(color[1], clamp((pos+gl_FragCoord.xy)/screen_size, 0.0f, 1.0f));
            //if(lightcoord.xyz == t.xyz){
                //cnt++;
                light += texture(color[2], clamp((pos+gl_FragCoord.xy)/screen_size, 0.0f, 1.0f));
            //}
        //}
    //}
    //light /= cnt;
    outColor[1] = light;//vec4(gl_FragCoord.x / screen_size.x);

    light = clamp(texture(color[0], gl_FragCoord.xy / screen_size) * (0.5f + light), 0.0f, 1.0f);
    outColor[0] = light;
    
    //vec4 col = texture(color[0], vec2(gl_FragCoord.x/screen_size.x, gl_FragCoord.y/screen_size.y));
    //outColor = texture(color[1], vec2(gl_FragCoord.x / screen_size.x, gl_FragCoord.y / screen_size.y));//mix(vec4(0.6f, 0.6f, 0.6f, 1.0f), col, pow(0.98f,col.w * 200.0f));//
}
