"""Validate the delivered mobile GLBs by importing and rendering in live Blender."""

import bpy
import contextlib
import io
import json
from pathlib import Path

OUT = Path('/Users/ila/dev/projects/renameme/endquote-furniture')
mobile = bpy.app.driver_namespace['endquote_mobile']
preview_dir = OUT / 'reports' / 'roundtrip'
preview_dir.mkdir(exist_ok=True)
report = []

for slug, model in mobile['WEB'].items():
    original_scene = model['scene']
    before = {kind: set(getattr(bpy.data, kind))
              for kind in ('objects', 'meshes', 'materials', 'images', 'collections')}
    scene = bpy.data.scenes.new('EQ_Mobile_Roundtrip_' + slug)
    scene.render.engine = original_scene.render.engine
    scene.world = original_scene.world
    scene.unit_settings.system = original_scene.unit_settings.system
    scene.unit_settings.scale_length = 1.0
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.collection.children.link(bpy.data.collections['EQ_Studio_Excluded_From_GLTF'])
    scene.collection.objects.link(original_scene.camera)
    scene.camera = original_scene.camera
    bpy.context.window.scene = scene
    try:
        captured = io.StringIO()
        with contextlib.redirect_stdout(captured):
            bpy.ops.import_scene.gltf(filepath=str(OUT / 'public' / 'models' / (slug + '.glb')))
        bpy.context.view_layer.update()
        imported = set(bpy.data.objects) - before['objects']
        meshes = [o for o in imported if o.type == 'MESH']
        triangles = 0
        points = []
        materials = set()
        colors = 0
        for obj in meshes:
            obj.data.calc_loop_triangles()
            triangles += len(obj.data.loop_triangles)
            points.extend(obj.matrix_world @ v.co for v in obj.data.vertices)
            materials.update(obj.data.materials)
            colors += len(obj.data.color_attributes)
        lo = [min(p[a] for p in points) for a in range(3)]
        hi = [max(p[a] for p in points) for a in range(3)]
        dimensions = [hi[a] - lo[a] for a in range(3)]
        stats = mobile['inspect'](slug)
        assert triangles == stats['triangles'], (slug, 'triangle mismatch')
        assert len(materials) == stats['materials'], (slug, 'material mismatch')
        assert len(meshes) == len(mobile['meshes'](model)), (slug, 'mesh component mismatch')
        assert max(abs(dimensions[a] - model['dimensions'][a]) for a in range(3)) < 0.00001
        assert abs(lo[2]) < 0.000001, (slug, 'not resting at floor')
        assert abs(lo[0] + hi[0]) < 0.000002 and abs(lo[1] + hi[1]) < 0.000002
        assert not any(o.type in ('CAMERA', 'LIGHT') for o in imported)
        if slug != 'sofa-2-seater':
            assert colors > 0, (slug, 'upholstery vertex colors missing')
        scene.render.filepath = str(preview_dir / (slug + '.png'))
        bpy.ops.render.render(write_still=True)
        result = dict(id=slug, passed=True, triangles=triangles, material_count=len(materials),
                      mesh_count=len(meshes), dimensions_blender_xyz_m=dimensions,
                      vertex_color_layers=colors, floor_z=lo[2], preview=str(scene.render.filepath))
        report.append(result)
        print(json.dumps(result))
    finally:
        bpy.context.window.scene = original_scene
        bpy.data.scenes.remove(scene)
        for kind in ('objects', 'collections', 'meshes', 'materials', 'images'):
            data = getattr(bpy.data, kind)
            for item in set(data) - before[kind]:
                if kind in ('objects', 'collections'):
                    data.remove(item, do_unlink=True)
                elif item.users == 0:
                    data.remove(item)

(OUT / 'reports' / 'mobile-roundtrip.json').write_text(json.dumps(report, indent=2))
print('Twelve delivered mobile GLBs imported, geometry/material counts matched, and rendered.')
