# EndQuote Sofa Collection

Six original upholstered furniture assets modeled, inspected, rendered, and exported in Blender 5.3 through Blender MCP. The two-seater established the collection's proportions and detailing before the remaining categories were built.

## Delivered assets

Each GLB is self-contained and uses actual geometry, four PBR materials, and one embedded 128 × 128 woven normal map. No cameras, lights, floors, animation, or external resources are exported. Mesh transforms are applied. Seats, backs, arms, base, feet, and subtle welting retain descriptive names for selection and configuration.

| GLB | Seats | Width × depth × height, m | Source polygons | Exported triangles | File size |
|---|---:|---|---:|---:|---:|
| [armchair.glb](armchair.glb) | 1 | 1.110 × 0.965 × 0.916 | 4,110 | 8,220 | 321.1 kB |
| [sofa-2-seater.glb](sofa-2-seater.glb) | 2 | 1.816 × 0.965 × 0.916 | 5,454 | 10,908 | 432.0 kB |
| [sofa-3-seater.glb](sofa-3-seater.glb) | 3 | 2.452 × 0.965 × 0.916 | 7,386 | 14,772 | 577.7 kB |
| [sofa-4-seater.glb](sofa-4-seater.glb) | 4 | 3.068 × 0.965 × 0.916 | 8,730 | 17,460 | 679.1 kB |
| [sofa-l-shaped.glb](sofa-l-shaped.glb) | 3 | 2.602 × 1.845 × 0.916 | 8,054 | 16,100 | 616.6 kB |
| [sofa-u-shaped.glb](sofa-u-shaped.glb) | 5 | 3.594 × 2.045 × 0.916 | 11,408 | 22,804 | 877.1 kB |

The L sofa has three seat/back modules with a continuous chaise on the customer's right when facing the sofa. The U sofa has five seat/back modules, including both continuous end chaises. Cushion counts describe seating positions; chaise extensions do not add another upright position.

## Editable Blender source

Open `endquote-sofas.blend` and use the scene selector to choose any of the six `EndQuote | …` scenes. Each contains one model collection and a shared studio collection for previews. The two-seater is the initial scene. All furniture parts are editable meshes without live modifiers; the fabric image is packed. The earlier `Scene` containing the connection-test cubes is preserved separately and is absent from every GLB.

The source includes construction helpers as text blocks. They are provenance and optional editing aids; the finished models do not depend on running scripts.

## Three.js / React Three Fiber integration

One unit equals one meter. GLBs use Y up, face +Z, and have a named root at `(0, 0, 0)`, centered across the horizontal bounds with the feet resting at Y = 0. Blender source uses Z up and faces −Y. Load at scale 1 and position the named root directly on the floor. Root `userData` includes category, seat count, and axis metadata. Each seat includes its index and chaise flag.

Previews in `previews/` use studio lighting. Supply suitable scene lighting/environment in the application to show the warm beige PBR materials correctly. No compression decoder is required.

## Verification

- Every model was visually inspected in a rendered front three-quarter view, then all final GLBs were imported back into Blender and rendered again.
- Source meshes were checked for closed manifold geometry, positive volume, loose vertices, and nonadjacent triangle self-intersections. Cushions have individual closed shells; seats contact the base, and backs nest within 0.4 mm of the seats.
- `verification.json` records independent binary, decoded geometry, index, normal, UV, tangent, transform, cushion-count, floor-origin, shape, resource, and size checks, plus SHA-256 hashes.
- `roundtrip-verification.json` records imported dimensions and triangle/component counts matching the source. The corresponding renders are in `previews/roundtrip/`.
- `three-loader-verification.json` records Three.js GLTFLoader geometry parsing. That Node test omits texture bindings only in memory; browser image decoding and GPU rendering were not tested.

Run the independent asset checks from this directory:

```sh
python3 tools/verify_glbs.py .
```

These are generic furniture classifications, not manufacturer replicas or measured quotations. There are no LODs or interactive modules. Test loading, visual integration, and frame rate on EndQuote's target browsers/devices before release. The focused verification is not the full Khronos conformance suite.
