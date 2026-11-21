# Credits

Textures and the sky image are CC0 from [Poly Haven](https://polyhaven.com).

- `public/textures/kloofendal_43d_clear_puresky_1k.hdr` — Kloofendal 43d Clear (pure sky), Greg Zaal.
- `public/textures/plaster_nor.webp` and `plaster_rough.webp` — Clay Plaster, Dimitrios Savva, converted to WebP.

Baked ambient occlusion was not produced. The exterior GLBs have no second UV channel, and Blender is not available in this environment.

The palms, shrubs, ground cover, people and parked cars in `src/props.js` are original low-poly meshes, dedicated CC0. Photogrammetry trees on Poly Haven are several megabytes and hundreds of thousands of triangles each, which cannot be instanced across the balconies without leaving the triangle budget. Positions are the architect's `vegetation_instances.json`. Those coordinates already lie inside each tower's web-frame box, so they are not transformed again. Moving traffic is the existing car sim; `?traffic=0` holds it still.
