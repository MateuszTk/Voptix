#version 300 es

precision highp float;
precision highp sampler3D;

//#define LOD
//#define DEBUG

const float chunk_size = 128.0f * 8.0f;
const int chunk_edge_count = 5;

struct Ray {
	vec3 orig;
	vec3 dir;
};

out vec4[3] outColor;
uniform sampler3D megaChunkTexture;
uniform sampler3D paletteTexture;
uniform sampler2D light_high;
uniform sampler2D light_low;
uniform ivec3[chunk_edge_count * chunk_edge_count] chunk_map;
uniform Scene{
	vec4 camera_origin;
	vec4 camera_direction;
	vec4 chunk_offset;
	vec4 screen;
	vec4 projection;
	vec4 prev_pos;
	vec4 prev_rot;
	vec4 skyColorUp;
	vec4 skyColorDown;
	vec4 skyLight;
	vec4 sunColor;
	vec4 sunDirection;
	vec4 sunParam;
	// x: GI_samples, y: reflection_samples
	vec4 graphicsSettings;
} scene;

#ifdef DEBUG
int debug_cnt = 0;
#endif
float animationTime = 0.0f;

float hash1(inout float seed) {
	return fract(sin(seed += 0.1) * 43758.5453123);
}

vec2 hash2(inout float seed) {
	return fract(sin(vec2(seed += 0.1, seed += 0.1)) * vec2(43758.5453123, 22578.1459123));
}

vec3 hash3(inout float seed) {
	return fract(sin(vec3(seed += 0.1, seed += 0.1, seed += 0.1)) * vec3(43758.5453123, 22578.1459123, 19642.3490423));
}

vec3 cosWeightedRandomHemisphereDirection(const vec3 n, inout float seed) {
	vec2 r = hash2(seed);

	vec3  uu = normalize(cross(n, vec3(0.0, 1.0, 1.0)));
	vec3  vv = cross(uu, n);

	float ra = sqrt(r.y);
	float rx = ra * cos(6.2831 * r.x);
	float ry = ra * sin(6.2831 * r.x);
	float rz = sqrt(1.0 - r.y);
	vec3  rr = vec3(rx * uu + ry * vv + rz * n);

	return normalize(rr);
}

vec3 randomSphereDirection(inout float seed) {
	vec2 h = hash2(seed) * vec2(2., 6.28318530718) - vec2(1, 0);
	float phi = h.y;
	return vec3(sqrt(1. - h.x * h.x) * vec2(sin(phi), cos(phi)), h.x);
}

vec4 getVoxel(vec3 fpos, float level, out vec2 mask, float element, float voxelSize) {
	vec4 fvoxel;

	//move sampling point to the center of the texel
	fpos = (floor(fpos / voxelSize) + 0.5f) * voxelSize;

	vec3 ofpos = fpos;
	float olevel = level;

	ivec3 chunkPos = ivec3(fpos / chunk_size);
	ivec3 id = chunk_map[chunk_edge_count * chunkPos.z + chunkPos.x];
	fpos /= chunk_size;
	fpos -= vec3(chunkPos);	
	fpos += vec3(id);
	fpos /= vec3(chunk_edge_count, 1.0f, chunk_edge_count);

	//3 lowest levels are subvoxels
	level = max(level - 3.0f, 0.0f);

	fvoxel = textureLod(megaChunkTexture, fpos, level);

	mask.x = fvoxel.w;
	mask.y = fvoxel.y;

	if (olevel < 3.0f) {
		if (fvoxel.w > 0.0f) {
			//256 blocks in palette; 2 pixels per voxel; 8 variants
			ofpos = fract(ofpos / vec3(8.0f)) / vec3(256.0f, 2.0f, 8.0f);
			ofpos.x += fvoxel.x * (255.0f / 256.0f);
			ofpos.y += element * 0.5f;
			if(fvoxel.z < (8.0f / 256.0f))
				ofpos.z += fvoxel.z * (32.0f * 255.0f / 256.0f);
			else
				ofpos.z += animationTime;

			fvoxel = textureLod(paletteTexture, ofpos, olevel);
			mask.y = textureLod(paletteTexture, ofpos, olevel + 1.0f).w;
			mask.x = fvoxel.w;
		}
		else {
			//mask.x is already 0
			mask.y = 0.0f;
		}
	}

	
	return fvoxel;
}

void load_direction(inout vec3 vec, vec3 rotation) {
	float rotated;

	float cosx = cos(rotation.x);
	float cosy = cos(rotation.y);

	float sinx = sin(rotation.x);
	float siny = sin(rotation.y);

	rotated = vec.z * cosx + vec.y * sinx;
	vec.y = vec.y * cosx - vec.z * sinx;
	vec.z = rotated;

	rotated = vec.x * cosy - vec.z * siny;
	vec.z = vec.z * cosy + vec.x * siny;
	vec.x = rotated;
}

void load_ray(inout Ray ray, vec3 direction, vec3 origin) {

	ray.orig = origin;
	ray.dir = normalize(direction);
}

// initialize ray object
void load_primary_ray(inout Ray ray, vec2 pos, const float width, const float height, float fov) {
	float aspect_ratio = width / height;

	vec3 dir;
	dir.x = (2.0f * pos.x / width - 1.0f) * aspect_ratio * fov;
	dir.y = (2.0f * pos.y / height - 1.0f) * fov;
	dir.z = 1.0f;

	vec3 rotation = vec3(
		scene.camera_direction.y,
		scene.camera_direction.x,
		0.0f
	);

	load_direction(dir, rotation);

	load_ray(ray, dir, scene.camera_origin.xyz);
}

void Bounce(inout Ray ray, vec3 hit, vec3 normal) {
	ray.orig = hit;
	ray.dir.x *= (normal.x > 0.0f ? -1.0f : 1.0f);
	ray.dir.y *= (normal.y > 0.0f ? -1.0f : 1.0f);
	ray.dir.z *= (normal.z > 0.0f ? -1.0f : 1.0f);
}

// draw single pixel queried from octree with a 3D ray
bool octree_get_pixel(Ray ray, float max_dist, inout vec4 voutput, inout vec4 matoutput, inout vec3 box_pos, inout vec3 normals) {

	vec3 ndir = ray.dir;

	//length of vector to add for single step (hypotenuse)
	vec3 unitStepSize = 1.0f / abs(ndir);

	vec3 testPos = ray.orig;

	const float minLayer = 0.0f;
	float cellSize = 1.0f;

	bvec3 comp = lessThan(ndir, vec3(0.0f));
	vec3 rayLength1D = mix(floor(ray.orig) + cellSize - ray.orig, ray.orig - floor(ray.orig), comp) * unitStepSize;	
	float dist = 0.0f;
	bool vHit = false;
	float layer = minLayer;
	bool move = true;
	vec2 mask;

	while (!vHit && dist < max_dist) {
#ifdef DEBUG
		debug_cnt++;
#endif
		move = true;
		if (testPos.x >= 0.0f && testPos.y >= 0.0f && testPos.z >= 0.0f && testPos.x < chunk_size * float(chunk_edge_count) && testPos.y < chunk_size && testPos.z < chunk_size * float(chunk_edge_count)) {
			getVoxel(testPos, layer, mask, 0.0f, cellSize);
			if (mask.x > 0.0f) {
				if (layer <= minLayer) {
					//found intersection
					vHit = true;
				}
				else {
					//something may be nearby - increase accuracy
					layer -= 1.0f;
					cellSize *= 0.5f;
				}	
				move = false;
			}
			else if (mask.y <= 0.0f) {
				//nothing nearby - speed up
				cellSize = min(cellSize * 2.0f, 512.0f);
				layer = min(layer + 1.0f, 9.0f);
			}
		}
		else {
			break;
		}
		if (move) {
			vec3 pos_floor = floor(testPos / cellSize) * cellSize;
			vec3 nextrayLength1D = mix(pos_floor + cellSize - testPos, testPos - pos_floor, comp) * unitStepSize;
			normals = vec3(lessThanEqual(nextrayLength1D.xyz, min(nextrayLength1D.yzx, nextrayLength1D.zxy)));
			dist += dot(nextrayLength1D, normals) + 0.01f;

			//position of curently tested voxel
			testPos = ray.orig + (ndir * (dist + 0.01f));
		}
	}


	if (dist < max_dist && vHit) {
		max_dist = dist;		

		//get material
		float palette_id = getVoxel(testPos, 3.0f, mask, 0.0f, 1.0f).r;
		vec4 vox_mat = getVoxel(testPos, minLayer, mask, 1.0f, 1.0f);

		vec4 vox = getVoxel(testPos, minLayer, mask, 0.0f, 1.0f);
		voutput.xyz = vox.xyz;
		voutput.w = dist;

		//clarity
		matoutput = vox_mat;

		box_pos = floor(testPos) + 0.5f;
		return true;
	}
	return false;
}

//AO test
bool occlusion(vec3 delta_pos, vec3 box_pos, int scx, int scz) {
	vec3 test = box_pos + delta_pos;
	if (test.y < 0.0f || test.y >= chunk_size) return false;
	vec2 mask;
	return (getVoxel(test, 0.0f, mask, 0.0f, 1.0f).w > 0.0f);
}

vec3 getBackgroundColor(Ray ray, vec3 sunRayDir){
	float dist =  distance(ray.dir, sunRayDir);
	vec3 sky = mix(scene.skyColorDown.xyz, scene.skyColorUp.xyz, ray.dir.y * 0.5f);
	return mix(scene.sunColor.xyz * 1.5f, sky, clamp(log(dist * scene.sunParam.y) * scene.sunParam.x, 0.0f, 1.0f));
}

void main() {
#ifdef DEBUG
	int deb_cnt_loc = 0;
#endif

	//pixel position
	vec2 pos = vec2(gl_FragCoord.x, gl_FragCoord.y);
	//normalized pixel coordinates
	vec2 centerPos = -1.0f + 2.0f * (pos.xy) / scene.screen.xy;
	
	
	Ray ray;
	float fov = tan(scene.projection.x / 2.0f);
	float far = scene.projection.z;
	load_primary_ray(ray, pos, scene.screen.x, scene.screen.y, fov);
	Ray primary_ray = ray;

	animationTime = scene.camera_direction.z / 8.0f;

	const float ray_retreat = 0.01f;
	int gi_samples = int(scene.graphicsSettings.x);
	
	//new
	float seed = centerPos.x + centerPos.y * 3.43121412313 + fract(1.12345314312 * scene.screen.z);
	vec3 illumination =	scene.sunColor.xyz * float(max(gi_samples, 1));
	vec3 sunDirection = normalize(scene.sunDirection.xyz);
	vec3 backgroundColor = getBackgroundColor(ray, sunDirection);
	vec4 pixel_color = vec4(backgroundColor, far);
	
	//primary ray
	vec4 primMat = vec4(0.0f);
	vec3 prim_box_pos = vec3(-1.0f);
	vec3 primaryNormals;
	bool hit = octree_get_pixel(ray, far, pixel_color, primMat, prim_box_pos, primaryNormals);
	vec3 primary_hit = ray.orig + ray.dir * (pixel_color.w - ray_retreat);
	if (hit) {
		if (primMat.y > 0.0f) { 
			//if hit light source make sure the clamped multiplier is 1.0
			illumination = vec3(64.0f);
		}

		//shadow for primary ray
		ray.orig = primary_hit;	
		vec3 jitter = (hash3(seed) * 2.0f - 1.0f) * scene.sunParam.z;
		ray.dir = normalize(sunDirection + jitter);
		vec4 shadowColor, shadowMat;
		vec3 shadow_box_pos;
		vec3 shadowNormals;
		if(octree_get_pixel(ray, far, shadowColor, shadowMat, shadow_box_pos, shadowNormals)) illumination *= 0.1f;

		//GI ray
		for(int GIsample = 0; GIsample < gi_samples; GIsample++){
			ray.orig = primary_hit;	
			vec3 signedPrimNormal = primaryNormals;
			signedPrimNormal.x *= ((primary_hit.x > prim_box_pos.x) ? 1.0f : -1.0f);
			signedPrimNormal.y *= ((primary_hit.y > prim_box_pos.y) ? 1.0f : -1.0f);
			signedPrimNormal.z *= ((primary_hit.z > prim_box_pos.z) ? 1.0f : -1.0f);

			ray.dir = cosWeightedRandomHemisphereDirection(signedPrimNormal + vec3(0.001f), seed);
			vec4 giColor, giMat;
			vec3 gi_box_pos;
			vec3 normals;
			if (octree_get_pixel(ray, far / 8.0f, giColor, giMat, gi_box_pos, normals)) {
				//add light from hit voxel
				illumination += vec3(giMat.y) * giColor.xyz * 12.0f;

				ray.orig = ray.orig + ray.dir * (giColor.w - ray_retreat);
				vec3 jitter = (hash3(seed) * 2.0f - 1.0f) * scene.sunParam.z;
				ray.dir = normalize(sunDirection + jitter);
				vec4 shadowColor, shadowMat;
				vec3 shadow_box_pos;
				vec3 shadowNormals;
				if(!octree_get_pixel(ray, far, shadowColor, shadowMat, shadow_box_pos, shadowNormals)) {
					illumination += giColor.xyz * 1.5f;
				}
			}
			else{
				//add sky light
				illumination += scene.skyLight.xyz;
			}
		}

		//reflections
		if (primMat.x > 0.0f){
			vec3 reflHit = primary_hit;
			vec3 refl_box_pos = prim_box_pos;
			vec4 reflMat = primMat;
			vec4 reflColor;
			vec3 norm;
			int maxBounces = int(scene.graphicsSettings.y);
			for(int bounces = 0; bounces < maxBounces; bounces++){				
				Bounce(primary_ray, reflHit, primaryNormals);
				vec3 refl_jitter = (hash3(seed) * 2.0f - 1.0f) * 0.2f * reflMat.z;
				primary_ray.dir = normalize(primary_ray.dir + refl_jitter);				
				vec4 tmpMat = reflMat;
				if(reflMat.x <= 0.0f) break;
				reflColor.xyz = getBackgroundColor(primary_ray, sunDirection);
				reflMat = vec4(0.0f);
				bool _hit = octree_get_pixel(primary_ray, far, reflColor, reflMat, refl_box_pos, norm);
				//blend reflections			
				float intensity = tmpMat.x;
				if(tmpMat.z <= 0.0f && primMat.z <= 0.0f){
					//specular reflection
					pixel_color.xyz = mix(pixel_color.xyz, reflColor.xyz, intensity);
				}
				else{
					//mate reflection (goes to the denoiser together with illumination)
					illumination.xyz = mix(pixel_color.xyz, reflColor.xyz, intensity) * clamp(illumination.xyz, vec3(0.0f), vec3(1.0f)) * float(max(gi_samples, 1));
				}
				if (reflMat.y > 0.0f) { 
					//if hit light source make sure the clamped multiplier is 1.0
					illumination = vec3(64.0f);
				}
				if(!_hit) break;
				reflHit = primary_ray.orig + primary_ray.dir * (reflColor.w - ray_retreat);

				//reflection shadow ray
				ray.orig = reflHit;	
				ray.dir = normalize(sunDirection + jitter);
				vec4 reflShadowColor, reflShadowMat;
				vec3 refl_shadow_box_pos;
				if(octree_get_pixel(ray, far, reflShadowColor, reflShadowMat, refl_shadow_box_pos, norm)) illumination *= 0.5f;
			}
		}
	}
	else{
		//if hit sky prevent it from being dimmed
		illumination = vec3(64.0f);
	}
	
	float w = pixel_color.w;
	pixel_color = clamp(pixel_color, 0.0f, 1.0f);
	pixel_color.w = clamp(w / 255.0f * 2.0f, 0.0f, 255.0f);

	//restore lighting from previous frame
	vec3 direction = primary_hit - scene.prev_pos.xyz;
	vec3 ray_dir = normalize(direction);

	vec3 rotation = vec3(
		0.0f,
		-scene.prev_rot.x,
		0.0f
	);
	load_direction(direction, rotation);

	rotation = vec3(
		-scene.prev_rot.y,
		0.0f,
		0.0f
	);
	load_direction(direction, rotation);

	direction = normalize(direction);
	float ar = scene.screen.y / scene.screen.x;
	vec2 pixel = vec2(
		((direction.x / direction.z) * ar / fov + 1.0f) * 0.5f,
		((direction.y / direction.z) / fov + 1.0f) * 0.5f);

	//pixel = pos / scene.screen.xy;
	//direction.yz *= -1.0f;
	vec4 acc_ill = vec4(-1);
	vec4 light = vec4(0.0f);
	illumination /= float(max(gi_samples, 1));
	if (pixel.x > 0.0f && pixel.y > 0.0f && pixel.y < 1.0f && pixel.x < 1.0) {
		vec4 lightData = (texture(light_high, pixel) * vec4(1.0f / 256.0f, 1.0f / 256.0f,1.0f / 256.0f, 256.0f) + texture(light_low, pixel));
		if (distance(scene.prev_pos.xyz + ray_dir * (lightData.w * 255.0f / 2.0f), primary_hit) < 0.6f) {
			acc_ill = lightData;
			light = (acc_ill * 20.0f + vec4(illumination.xyz, 0.0f)) / 21.0f;
		}
		else {
			//pixel_color.r = 1.0f;
			light.xyz = illumination;
		}
	}
	else {
		//pixel_color.r = 1.0f;
		light.xyz = illumination;
	}
	

	//color output
#ifdef DEBUG
	pixel_color.rgb = vec3(float(deb_cnt_loc) / 100.0f);
#endif
	outColor[0] = pixel_color;
	
	//gradient on normals helps denoiser not to blur edges
	vec3 gradient = (vec3(ivec3(prim_box_pos) % ivec3(127, 127, 255) + 1)) / 255.0f;
	//normals, least significant bit corresponds to the material properties
	vec3 normal = primaryNormals * gradient * vec3(2, 2, 1) + vec3(primMat.x > 0.0f, primMat.y > 0.0f, 0);

	//ligting data output	
	light.w = pixel_color.w;
	//low
	outColor[1].xyz = light.xyz;
	outColor[1].w = float(int(light.w * 255.0f) % 256) / 255.0f;
	//high
	outColor[2].xyz = normal;
	outColor[2].w = float(int(light.w * 255.0f) / 256) / 255.0f;
}
