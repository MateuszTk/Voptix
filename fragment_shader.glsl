#version 300 es

precision mediump float;

// the 299593 is derived from: `((1 - pow(8, (octree_depth + 1))) / -7)`
#define OCTREE_SIZE 299593

// size of single octree leaf
#define VOXEL_SIZE 4

// channel offsets
#define RED 0
#define GREEN 1
#define BLUE 2
#define ALPHA 3

out vec4 outColor;
uniform sampler2D u_texture;
uniform vec3[6] scene_data;

ivec4 getVoxel(int i) {
	ivec2 pos = ivec2(i % 4096, floor(float(i) / 4096.0f));
	vec4 fvoxel = texelFetch(u_texture, pos, 0);
	ivec4 ivoxel = ivec4(int(fvoxel.x * 255.0f), int(fvoxel.y * 255.0f), int(fvoxel.z * 255.0f), int(fvoxel.w * 255.0f));
	return ivoxel;
}

struct Ray {
	vec3 orig;
	vec3 invdir;
	int sign[3];
};

struct Scene{
	vec3 camera_origin;
	vec3 camera_direction;
	vec3 ambient_light;
	vec3 sky_light;
	vec3 background;
	vec3 projection;
};

struct OctreeData {
	vec3 xyzo;
	float csize;
	int globalid;
	int layerindex;
	int pow8;
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
	ray.sign[0] = int(ray.invdir.x < 0.0f);
	ray.sign[1] = int(ray.invdir.y < 0.0f);
	ray.sign[2] = int(ray.invdir.z < 0.0f);
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
	ray.sign[0] = int(ray.invdir.x < 0.0f);
	ray.sign[1] = int(ray.invdir.y < 0.0f);
	ray.sign[2] = int(ray.invdir.z < 0.0f);
}

// check is ray intersects with AABB, writes distance to `dist`
bool intersects(Ray r, vec3 bounds[2], inout float dist) {

	float txmin, txmax, tymin, tymax, tzmin, tzmax;

	txmin = (bounds[r.sign[0]].x - r.orig.x) * r.invdir.x;
	txmax = (bounds[1 - r.sign[0]].x - r.orig.x) * r.invdir.x;
	tymin = (bounds[r.sign[1]].y - r.orig.y) * r.invdir.y;
	tymax = (bounds[1 - r.sign[1]].y - r.orig.y) * r.invdir.y;

	if ((txmin > tymax) || (tymin > txmax)) return false;

	txmin = max(txmin, tymin);
	txmax = min(txmax, tymax);

	tzmin = (bounds[r.sign[2]].z - r.orig.z) * r.invdir.z;
	tzmax = (bounds[1 - r.sign[2]].z - r.orig.z) * r.invdir.z;

	dist = max(txmin, tzmin);

	return (txmax >= 0.0) && (tzmax >= 0.0) && (txmin <= tzmax) && (tzmin <= txmax);

}

// get octant id of ray-octant intersection
int octree_test_octant(float csize, Ray ray, vec3 xyz, int id, inout float dist, int mask) {

	if (id > 0) xyz.z += csize;

	int vid = 255;
	float tmpdist;

	vec3 bounds[2] = vec3[2]( xyz, vec3( csize + xyz.x, csize + xyz.y, csize + xyz.z ) );

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
void octree_get_pixel(vec3 xyzc, Ray ray, int octree, inout float max_dist, inout vec4 moutput, int octree_depth, float csize, inout vec3 box_pos) {

	float dist;

	// id of hit voxel (from 0 to 7, 255 = miss)
	int oc = 255;

	// coordinates of the currently tested octant
	vec3 xyzo = vec3( 0, 0, 0 );

	// id of tested voxel relative to the start of the currently tested level
	int globalid = 0;

	// id of the first element in the currently tested level
	int layerindex = 1;

	// the power of 8 calculated progressively
	int pow8 = 1;

	// store alternate nodes in case of ray miss
	OctreeData alt_data[7];
	for (int d = 0; d <= octree_depth; d++) {
		alt_data[d].mask = 255;
	}

	// currently tested level 
	int depth = 1;
	for (; depth <= octree_depth; depth++) {

		// store variables in case of having to choose a different path 
		alt_data[depth].globalid = globalid;
		alt_data[depth].csize = csize;
		alt_data[depth].layerindex = layerindex;
		alt_data[depth].pow8 = pow8;
		alt_data[depth].xyzo = xyzo;

		// mask representing transparency of children
		int alpha_mask = alt_data[depth].mask & getVoxel(octree + (layerindex - pow8 + globalid) * VOXEL_SIZE).w;

		// clearing the closest distance to the voxel
		dist = max_dist;

		// decreasing octant size
		csize /= 2.0f;

		// entry to the area where children will be tested
		globalid *= 8;

		// test first 4 octants
		if ((alt_data[depth].mask & 15) > 0)  //0b00001111
			oc = octree_test_octant(csize, ray, xyzo + xyzc, 0, dist, alpha_mask);

		// test next 4 octants
		if ((alt_data[depth].mask & 240) > 0) { //0b11110000
			int oc1 = octree_test_octant(csize, ray, xyzo + xyzc, 4, dist, alpha_mask);

			// checking if ray from the second test hit anything
			if (oc1 != 255) oc = oc1;
		}

		// move to the next child (by the id of the one that got intersected)
		globalid += oc;

		// if intersected anything
		if (oc != 255) {

			// move coordinates of the currently tested octant
			xyzo.x += float(!!((oc & 1) > 0)) * csize;
			xyzo.y += float(!!((oc & 2) > 0)) * csize;
			xyzo.z += float(!!((oc & 4) > 0)) * csize;

			alt_data[depth].mask &= ~(1 << oc);
			alt_data[depth].oc = oc;
			pow8 *= 8;
			layerindex += pow8;

		}
		else {
			if (alt_data[1].mask == 0 || depth == 1)
				break;

			alt_data[depth].mask = 255;

			pow8 = alt_data[depth - 1].pow8;
			layerindex = alt_data[depth - 1].layerindex;
			globalid = alt_data[depth - 1].globalid;
			csize = alt_data[depth - 1].csize;
			xyzo = alt_data[depth - 1].xyzo;
			depth -= 2;
		}
	}

	if (dist < max_dist) {
		max_dist = dist;

		int index = ((1 - pow8) / -7 + globalid) * VOXEL_SIZE;
		vec4 vox = vec4(getVoxel(index + octree));
		moutput.x = vox.x;
		moutput.y = vox.y;
		moutput.z = vox.z;
		moutput.w = dist;

		box_pos = xyzo + xyzc;
		box_pos.x += 1.0f;
		box_pos.y += 1.0f;
		box_pos.z += 1.0f;
	}
}

void main() {
	const int chunk_count = 1;

	Scene scene = Scene(
		scene_data[0],
		scene_data[1],
		scene_data[2],
		scene_data[3],
		scene_data[4],
		scene_data[5]
	);

	vec2 pos = vec2(gl_FragCoord.x, gl_FragCoord.y);

	const float scale = 2.0f;
	float fov = scene.projection.x;
	float near = scene.projection.y;
	float far = scene.projection.z;

	// set background color
	vec4 pixel_color = vec4( scene.background.x, scene.background.y, scene.background.z, far );

	const float ray_retreat = 0.01f;

	Ray ray;
	load_primary_ray(ray, scene, pos, 640.0f, 480.0f, tan(fov / 2.0f));
	Ray primary_ray = ray;

	int octree_depth = 6;

	for (int bounces = 0; bounces < 2; bounces++) {
		vec4 ray_pixel_color = vec4(scene.background.x, scene.background.y, scene.background.z, far);
		vec3 hit = vec3(0, 0, 0);
		vec3 box_pos = vec3(0, 0, 0);

		for (int spp = 0; spp < 2; spp++) {

			vec4 color = vec4(scene.background.x, scene.background.y, scene.background.z, far);
			float max_dist = far;
			float size = 64.0f * scale;

			// iterate all chunks
			for (int chunk = 0; chunk < chunk_count; chunk++) {

				// read chunk offset from chunks array
				vec3 chunk_pos;
				//load_vec3(chunk_pos, chunks + chunk * 3);

				chunk_pos = chunk_pos * scale;

				vec3 bounds[2] = vec3[2](
					chunk_pos,
					chunk_pos + size
					);

				float tmp_dist = 0.0f;
				if (intersects(ray, bounds, tmp_dist)) {

					// 222 = csize * sqrt(3)
					if (tmp_dist > -222.0f && tmp_dist < max_dist) {

						// get pointer to octree of given chunk
						int octree = (chunk * OCTREE_SIZE * VOXEL_SIZE);

						// render the chunk
						vec3 box_pos_t;
						octree_get_pixel(chunk_pos, ray, octree, max_dist, color, octree_depth, size, box_pos_t);
						if (spp == 0) box_pos = box_pos_t;
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
					//even more random
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
		}
		else {
			const float intensity = 0.5f;
			pixel_color.x = clamp((pixel_color.x + ray_pixel_color.x * intensity) / (1.0f + intensity), 0.0f, 255.0f);
			pixel_color.y = clamp((pixel_color.y + ray_pixel_color.y * intensity) / (1.0f + intensity), 0.0f, 255.0f);
			pixel_color.z = clamp((pixel_color.z + ray_pixel_color.z * intensity) / (1.0f + intensity), 0.0f, 255.0f);
		}

		if (ray_pixel_color.w >= far) break;
		Bounce(primary_ray, hit, box_pos, 1.0f);
		ray = primary_ray;
	}



	outColor = vec4(pixel_color.x, pixel_color.y, pixel_color.z, 255.0f) / 255.0f;
}