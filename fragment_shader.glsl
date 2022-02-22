#version 300 es

precision mediump float;
precision mediump sampler3D;

// the 299593 is derived from: `((1 - pow(8, (octree_depth + 1))) / -7)`
#define OCTREE_SIZE 299593

// size of single octree leaf
#define VOXEL_SIZE 2

// channel offsets
#define RED 0
#define GREEN 1
#define BLUE 2
#define ALPHA 3
//#define CLARITY 0

const float chunk_size = 64.0f;

const int chunk_count = 9;

out vec4 outColor;
uniform sampler3D u_textures[chunk_count];
uniform vec3[6] scene_data;

vec4 getVoxel(vec3 pos, float i, float level, int chunk) {
	level = 6.0f - level;

	pos = vec3((pos.x * 2.0f + i) / 128.0f, pos.y / 64.0f, pos.z / 64.0f);
	vec4 fvoxel;

	if (chunk == 0)
		fvoxel = textureLod(u_textures[0], pos, level);
	else if (chunk == 1)
		fvoxel = textureLod(u_textures[1], pos, level);
	else if (chunk == 2)
		fvoxel = textureLod(u_textures[2], pos, level);
	else if (chunk == 3)
		fvoxel = textureLod(u_textures[3], pos, level);
	else if (chunk == 4)
		fvoxel = textureLod(u_textures[4], pos, level);
	else if (chunk == 5)
		fvoxel = textureLod(u_textures[5], pos, level);
	else if (chunk == 6)
		fvoxel = textureLod(u_textures[6], pos, level);
	else if (chunk == 7)
		fvoxel = textureLod(u_textures[7], pos, level);
	else if (chunk == 8)
		fvoxel = textureLod(u_textures[8], pos, level);
	//integer approach
	//ivec3 posi = ivec3((int(pos.x) >> level) * 2 + i, int(pos.y) >> level, int(pos.z) >> level);
	//fvoxel = texelFetch(u_textures[0], posi, level);

	return fvoxel;//ivec4(int(fvoxel.x * 255.0f), int(fvoxel.y * 255.0f), int(fvoxel.z * 255.0f), int(fvoxel.w * 255.0f));
}

struct Ray {
	vec3 orig;
	vec3 invdir;
	ivec3 sign;
};

struct Scene {
	vec3 camera_origin;
	vec3 camera_direction;
	vec3 chunk_offset;
	vec3 screen;
	vec3 background;
	vec3 projection;
};

struct OctreeData {
	vec3 xyzo;
	float csize;
	float layerindex;
	int oc;
	int mask;
};

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
	ray.invdir.x = 1.0f / direction.x;
	ray.invdir.y = 1.0f / direction.y;
	ray.invdir.z = 1.0f / direction.z;
	ray.sign = ivec3(int(ray.invdir.x < 0.0f), int(ray.invdir.y < 0.0f), int(ray.invdir.z < 0.0f));
}

// initialize ray object
void load_primary_ray(inout Ray ray, Scene scene, vec2 pos, const float width, const float height, float fov) {
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

	load_ray(ray, dir, scene.camera_origin);
}

void Bounce(inout Ray ray, vec3 hit, vec3 box_pos, float size) {
	ray.orig = hit;
	ray.invdir.x *= ((hit.x >= box_pos.x + size || hit.x <= box_pos.x - size) ? -1.0f : 1.0f);
	ray.invdir.y *= ((hit.y >= box_pos.y + size || hit.y <= box_pos.y - size) ? -1.0f : 1.0f);
	ray.invdir.z *= ((hit.z >= box_pos.z + size || hit.z <= box_pos.z - size) ? -1.0f : 1.0f);
	ray.sign = ivec3(int(ray.invdir.x < 0.0f), int(ray.invdir.y < 0.0f), int(ray.invdir.z < 0.0f));
}

// check is ray intersects with AABB, writes distance to `dist`
bool intersects(Ray r, vec3 bounds[2], inout float dist) {

	float txmin, txmax, tymin, tymax, tzmin, tzmax;

	txmin = (bounds[r.sign.x].x - r.orig.x) * r.invdir.x;
	txmax = (bounds[1 - r.sign.x].x - r.orig.x) * r.invdir.x;
	tymin = (bounds[r.sign.y].y - r.orig.y) * r.invdir.y;
	tymax = (bounds[1 - r.sign.y].y - r.orig.y) * r.invdir.y;

	if ((txmin > tymax) || (tymin > txmax)) return false;

	txmin = max(txmin, tymin);
	txmax = min(txmax, tymax);

	tzmin = (bounds[r.sign.z].z - r.orig.z) * r.invdir.z;
	tzmax = (bounds[1 - r.sign.z].z - r.orig.z) * r.invdir.z;

	dist = max(txmin, tzmin);

	return (txmax >= 0.0) && (tzmax >= 0.0) && (txmin <= tzmax) && (tzmin <= txmax);

}

// get octant id of ray-octant intersection
int octree_test_octant(float csize, Ray ray, vec3 xyz, int id, inout float dist, int mask) {

	if (id > 0) xyz.z += csize;

	int vid = 255;
	float tmpdist;

	vec3 bounds[2] = vec3[2](xyz, vec3(csize + xyz.x, csize + xyz.y, csize + xyz.z));

	if (((mask >> id) & 1) > 0) {
		if (intersects(ray, bounds, tmpdist)) {
			if (dist >= tmpdist) {
				vid = id;
				dist = tmpdist;
			}
		}
	}

	bounds[0].x = csize + xyz.x;
	bounds[1].x = csize * 2.0f + xyz.x;

	if (((mask >> (id + 1)) & 1) > 0) {
		if (intersects(ray, bounds, tmpdist)) {
			if (dist >= tmpdist) {
				vid = id + 1;
				dist = tmpdist;
			}
		}
	}

	bounds[0].y = csize + xyz.y;
	bounds[1].y = csize * 2.0f + xyz.y;

	if (((mask >> (id + 3)) & 1) > 0) {
		if (intersects(ray, bounds, tmpdist)) {
			if (dist >= tmpdist) {
				vid = id + 3;
				dist = tmpdist;
			}
		}
	}

	if (((mask >> (id + 2)) & 1) > 0) {
		bounds[0].x = xyz.x;
		bounds[1].x = csize + xyz.x;
		if (intersects(ray, bounds, tmpdist)) {
			if (dist >= tmpdist) {
				vid = id + 2;
				dist = tmpdist;
			}
		}
	}

	return vid;
}

// draw single pixel queried from octree with a 3D ray
void octree_get_pixel(vec3 xyzc, Ray ray, int chunk, inout float max_dist, inout vec4 voutput, inout vec4 matoutput, int octree_depth, float csize, inout vec3 box_pos) {

	float dist;

	// id of hit voxel (from 0 to 7, 255 = miss)
	int oc = 255;

	// coordinates of the currently tested octant
	vec3 xyzo = vec3(0, 0, 0);

	// id of the first element in the currently tested level
	float layerindex = 0.0f;

	// store alternate nodes in case of ray miss
	OctreeData alt_data[7];
	for (int d = 0; d <= octree_depth; d++) {
		alt_data[d].mask = 255;
	}

	// currently tested level 
	int depth = 1;
	for (; depth <= octree_depth; depth++) {

		// store variables in case of having to choose a different path 
		alt_data[depth].csize = csize;
		alt_data[depth].layerindex = layerindex;
		alt_data[depth].xyzo = xyzo;

		// mask representing transparency of children
		int alpha_mask = alt_data[depth].mask & int(getVoxel(xyzo, 0.0f, layerindex, chunk).w * 255.0f);

		// clearing the closest distance to the voxel
		dist = max_dist;

		// decreasing octant size
		csize /= 2.0f;

		// test first 4 octants
		if ((alt_data[depth].mask & 15) > 0)  //0b00001111
			oc = octree_test_octant(csize, ray, xyzo + xyzc, 0, dist, alpha_mask);

		// test next 4 octants
		if ((alt_data[depth].mask & 240) > 0) { //0b11110000
			int oc1 = octree_test_octant(csize, ray, xyzo + xyzc, 4, dist, alpha_mask);

			// checking if ray from the second test hit anything
			if (oc1 != 255) oc = oc1;
		}

		// if intersected anything
		if (oc != 255) {

			// move coordinates of the currently tested octant
			xyzo.x += float((oc & 1) > 0) * csize;
			xyzo.y += float((oc & 2) > 0) * csize;
			xyzo.z += float((oc & 4) > 0) * csize;
			//xyzo *= vec3(2.0f, 2.0f, 2.0f);

			alt_data[depth].mask &= ~(1 << oc);
			alt_data[depth].oc = oc;
			layerindex++;
		}
		else {
			if (alt_data[1].mask == 0 || depth == 1)
				break;

			alt_data[depth].mask = 255;

			layerindex = alt_data[depth - 1].layerindex;
			csize = alt_data[depth - 1].csize;
			xyzo = alt_data[depth - 1].xyzo;
			depth -= 2;
		}
	}

	if (dist < max_dist) {
		max_dist = dist;

		vec4 vox = getVoxel(xyzo, 0.0f, 6.0f, chunk);
		vec4 vox_mat = getVoxel(xyzo, 1.0f, 6.0f, chunk);
		voutput.x = vox.x;
		voutput.y = vox.y;
		voutput.z = vox.z;
		voutput.w = dist;

		//clarity
		matoutput.x = vox_mat.x;

		box_pos = xyzo + xyzc;
		box_pos.x += 0.5f;
		box_pos.y += 0.5f;
		box_pos.z += 0.5f;
	}
}

//AO test
bool occlusion(ivec3 delta_pos, ivec3 box_pos, int scx, int scz) {
	ivec3 test = box_pos + delta_pos;
	if (test.y < 0 || test.y >= int(chunk_size)) return false;
	vec3 pos = vec3(test % ivec3(chunk_size, chunk_size, chunk_size));
	ivec3 chu = test / ivec3(chunk_size, chunk_size, chunk_size);
	int chi = (chu.x + 40 - scx + 2) % 3 + ((chu.z + 40 - scz + 2) % 3) * 3;	
	return (getVoxel(pos, 0.0f, 6.0f, chi).w > 0.0f);
}

void main() {

	Scene scene = Scene(
		scene_data[0],
		scene_data[1],
		scene_data[2],
		scene_data[3],
		scene_data[4],
		scene_data[5]
	);

	vec2 pos = vec2(gl_FragCoord.x, gl_FragCoord.y);

	float fov = scene.projection.x;
	float near = scene.projection.y;
	float far = scene.projection.z;

	// set background color
	vec4 pixel_color = vec4(scene.background.x, scene.background.y, scene.background.z, far);

	const float ray_retreat = 0.01f;

	Ray ray;
	load_primary_ray(ray, scene, pos, scene.screen.x, scene.screen.y, tan(fov / 2.0f));
	Ray primary_ray = ray;

	int octree_depth = 6;

	vec4 prevmat = vec4(0, 0, 0, 0);
	vec4 tmpmat = vec4(0, 0, 0, 0);

	for (int bounces = 0; bounces < 2; bounces++) {
		vec4 ray_pixel_color = vec4(scene.background.x, scene.background.y, scene.background.z, far);
		vec3 hit = vec3(0, 0, 0);
		vec3 box_pos = vec3(0, 0, 0);
		vec4 vmat = vec4(0, 0, 0, 0);

		for (int spp = 0; spp < 2; spp++) {

			vec4 color = vec4(scene.background.x, scene.background.y, scene.background.z, far);
			float max_dist = far;
			float size = chunk_size;

			// iterate all chunks
			for (int chunk = 0; chunk < chunk_count; chunk++) {

				// read chunk offset from chunk array
				//vec3((chunk % 3 + (int(scene.chunk_offset.x)) % 3 + 3) % 3, 0, (chunk / 3 + (int(scene.chunk_offset.z)) % 3 + 3) % 3);
				vec3 chunk_pos = vec3((chunk % 3 + int(scene.chunk_offset.x)) % 3, (chunk / 9 + int(scene.chunk_offset.y)) % 3, (chunk / 3 + int(scene.chunk_offset.z)) % 3);
				//load_vec3(chunk_pos, chunks + chunk * 3);

				chunk_pos *= size;

				vec3 bounds[2] = vec3[2](
					chunk_pos,
					chunk_pos + size
					);

				float tmp_dist = 0.0f;
				if (intersects(ray, bounds, tmp_dist)) {

					// 222 = csize * sqrt(3)
					if (tmp_dist > -222.0f && tmp_dist < max_dist) {

						// render the chunk
						vec3 box_pos_t = vec3(-1, -1, -1);
						octree_get_pixel(chunk_pos, ray, chunk, max_dist, color, tmpmat, octree_depth, size, box_pos_t);
						if (spp == 0 && box_pos_t.x != -1.0f) {
							box_pos = box_pos_t;
							vmat = tmpmat;
						}
					}
				}
			}

			if (spp == 0) ray_pixel_color = color;
			else {
				ray_pixel_color.x = ((color.w >= far) ? ray_pixel_color.x : ray_pixel_color.x * 0.5f);
				ray_pixel_color.y = ((color.w >= far) ? ray_pixel_color.y : ray_pixel_color.y * 0.5f);
				ray_pixel_color.z = ((color.w >= far) ? ray_pixel_color.z : ray_pixel_color.z * 0.5f);
			}

			if (color.w >= far) {
				break;
			}
			else {
				ray = primary_ray;
				color = ray_pixel_color;

				vec3 dir = vec3(
					2.0f,
					1.0f,
					-1.0f
				);

				vec3 origin = vec3(
					ray.orig.x + (1.0f / ray.invdir.x) * (color.w - ray_retreat),
					ray.orig.y + (1.0f / ray.invdir.y) * (color.w - ray_retreat),
					ray.orig.z + (1.0f / ray.invdir.z) * (color.w - ray_retreat)
				);

				if (spp == 0) hit = origin;

				load_ray(ray, dir, origin);
			}
		}

		if (ray_pixel_color.w >= far) {
			ray_pixel_color.x = scene.background.x;
			ray_pixel_color.y = scene.background.y;
			ray_pixel_color.z = scene.background.z;
		}

		if (bounces == 0) {
			pixel_color = ray_pixel_color;

			//AO
			const float size = 0.5f;
			if (ray_pixel_color.w < far) {
				bool a = hit.x >= box_pos.x + size;
				bool b = hit.x <= box_pos.x - size;
				float shade = 0.0f;
				if (a || b) {
					int x = (a) ? 1 : -1;

					for (int y = -1; y < 2; y++) {
						for (int z = -1; z < 2; z++) {
							if (!(y == 0 && z == 0) && occlusion(ivec3(x, y, z), ivec3(box_pos), int(scene.chunk_offset.x), int(scene.chunk_offset.z))) {
								float bl = 0.0f;
								if (abs(z * y) > 0) {
									bl = (1.0f - sqrt(pow(box_pos.z + float(z) * 0.5f - hit.z, 2.0f) + pow(box_pos.y + float(y) * 0.5f - hit.y, 2.0f)));
								}
								else {
									bl = (((y == 0) ? 0.0f : abs(box_pos.y - float(y) * 0.5f - hit.y))
										+ ((z == 0) ? 0.0f : abs(box_pos.z - float(z) * 0.5f - hit.z)));
								}
								shade = max(bl, shade);
							}
						}
					}
				}
				else {
					a = hit.y >= box_pos.y + size;
					b = hit.y <= box_pos.y - size;
					if (a || b) {
						int y = (a) ? 1 : -1;
						for (int x = -1; x < 2; x++) {
							for (int z = -1; z < 2; z++) {
								if (!(x == 0 && z == 0) && occlusion(ivec3(x, y, z), ivec3(box_pos), int(scene.chunk_offset.x), int(scene.chunk_offset.z))) {
									float bl = 0.0f;
									if (abs(z * x) > 0) {
										bl = (1.0f - sqrt(pow(box_pos.z + float(z) * 0.5f - hit.z, 2.0f) + pow(box_pos.x + float(x) * 0.5f - hit.x, 2.0f)));
									}
									else {
										bl = (((x == 0) ? 0.0f : abs(box_pos.x - float(x) * 0.5f - hit.x))
											+ ((z == 0) ? 0.0f : abs(box_pos.z - float(z) * 0.5f - hit.z)));
									}
									shade = max(bl, shade);
								}
							}
						}
					}
					else {
						a = hit.z >= box_pos.z + size;
						b = hit.z <= box_pos.z - size;
						if (a || b) {
							int z = (a) ? 1 : -1;
							for (int x = -1; x < 2; x++) {
								for (int y = -1; y < 2; y++) {
									if (!(y == 0 && x == 0) && occlusion(ivec3(x, y, z), ivec3(box_pos), int(scene.chunk_offset.x), int(scene.chunk_offset.z))) {
										float bl = 0.0f;
										if (abs(y * x) > 0) {
											bl = (1.0f - sqrt(pow(box_pos.y + float(y) * 0.5f - hit.y, 2.0f) + pow(box_pos.x + float(x) * 0.5f - hit.x, 2.0f)));
										}
										else {
											bl = (((y == 0) ? 0.0f : abs(box_pos.y - float(y) * 0.5f - hit.y))
												+ ((x == 0) ? 0.0f : abs(box_pos.x - float(x) * 0.5f - hit.x)));
										}
										shade = max(bl, shade);
									}
								}
							}
						}
					}
				}
				pixel_color = mix(pixel_color, vec4(0.0f, 0.0f, 0.0f, ray_pixel_color.w), pow(shade, 2.0f) * 0.1f);
			}
		}
		else {
			float intensity = prevmat.x / 10.0f * 255.0f;
			pixel_color.x = clamp((pixel_color.x + ray_pixel_color.x * intensity) / (1.0f + intensity), 0.0f, 1.0f);
			pixel_color.y = clamp((pixel_color.y + ray_pixel_color.y * intensity) / (1.0f + intensity), 0.0f, 1.0f);
			pixel_color.z = clamp((pixel_color.z + ray_pixel_color.z * intensity) / (1.0f + intensity), 0.0f, 1.0f);
		}

		if (vmat.x < 0.001f) break;
		else prevmat = vmat;
		if (ray_pixel_color.w >= far) break;
		Bounce(primary_ray, hit, box_pos, 0.5f);
		ray = primary_ray;
	}



	outColor = vec4(pixel_color.x, pixel_color.y, pixel_color.z, clamp(pixel_color.w / 255.0f * 2.0f, 0.0f, 1.0f));
}
