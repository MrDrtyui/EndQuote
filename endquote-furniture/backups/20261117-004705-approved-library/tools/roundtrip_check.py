"""Import the delivered GLBs in the live Blender and render their actual contents."""

import bpy
import json
from pathlib import Path
from mathutils import Vector

ns = bpy.app.driver_namespace['endquote_tools']
out = Path('/Users/ila/dev/projects/renameme/endquote-furniture')
preview_dir = out / 'previews' / 'roundtrip'
preview_dir.mkdir(exist_ok=True)
results = []

for slug, model in ns['MODELS'].items():
    original = model['scene']
    original_meshes = [o for o in model['collection'].objects if o.type == 'MESH']
    expected = sum(len(o.data.loop_triangles) for o in original_meshes)
    before = {kind: set(getattr(bpy.data, kind))
              for kind in ('objects', 'meshes', 'materials', 'images', 'collections')}
    scene = bpy.data.scenes.new('EQ_QA_' + slug)
    scene.render.engine = original.render.engine
    scene.render.resolution_x = original.render.resolution_x
    scene.render.resolution_y = original.render.resolution_y
    scene.render.resolution_percentage = 100
    scene.world = original.world
    scene.collection.children.link(bpy.data.collections['EQ_Studio_Excluded_From_GLTF'])
    scene.collection.objects.link(original.camera)
    scene.camera = original.camera
    bpy.context.window.scene = scene
    try:
        bpy.ops.import_scene.gltf(filepath=str(out / (slug + '.glb')))
        bpy.context.view_layer.update()
        imported = set(bpy.data.objects) - before['objects']
        meshes = [o for o in imported if o.type == 'MESH']
        points = []
        count = 0
        for obj in meshes:
            obj.data.calc_loop_triangles()
            count += len(obj.data.loop_triangles)
            points.extend(obj.matrix_world @ v.co for v in obj.data.vertices)
        lo = [min(p[a] for p in points) for a in range(3)]
        hi = [max(p[a] for p in points) for a in range(3)]
        dimensions = [hi[a] - lo[a] for a in range(3)]
        assert count == expected, (slug, count, expected)
        assert len(meshes) == len(original_meshes), (slug, 'component mismatch')
        assert all(abs(dimensions[a] - model['dimensions'][a]) < 0.00001 for a in range(3))
        assert abs(lo[2]) < 0.000001, (slug, 'floor mismatch')
        assert abs((lo[0] + hi[0]) / 2) < 0.000001
        assert abs((lo[1] + hi[1]) / 2) < 0.000001
        assert not any(o.type in ('CAMERA', 'LIGHT') for o in imported)
        scene.render.filepath = str(preview_dir / (slug + '.png'))
        bpy.ops.render.render(write_still=True)
        result = dict(file=slug + '.glb', passed=True, triangles=count,
                      mesh_components=len(meshes), dimensions_blender_xyz_m=dimensions,
                      floor_z=lo[2], preview=str(scene.render.filepath))
        results.append(result)
        print(json.dumps(result))
    finally:
        bpy.context.window.scene = original
        bpy.data.scenes.remove(scene)
        for kind in ('objects', 'collections', 'meshes', 'materials', 'images'):
            data = getattr(bpy.data, kind)
            for item in set(data) - before[kind]:
                if kind in ('objects', 'collections'):
                    data.remove(item, do_unlink=True)
                elif item.users == 0:
                    data.remove(item)

(out / 'roundtrip-verification.json').write_text(json.dumps(results, indent=2))
print('All six delivered GLBs imported, matched source geometry, and rendered successfully.')
