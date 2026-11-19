"""EndQuote mobile library helpers. Executed in the connected Blender via MCP."""

import bpy
import bmesh
import contextlib
import hashlib
import io
import json
import math
import shutil
from pathlib import Path
from mathutils import Vector

OUT = Path('/Users/ila/dev/projects/renameme/endquote-furniture')
for folder in ('sources', 'public/models', 'public/previews', 'reports', 'previews/mobile-png'):
    (OUT / folder).mkdir(parents=True, exist_ok=True)

OLD = bpy.app.driver_namespace['endquote_tools']
FABRIC = bpy.data.materials['EQ_Warm_Beige_Woven_Upholstery']
FRAME = bpy.data.materials['EQ_Warm_Beige_Upholstered_Frame']
SEAM = bpy.data.materials['EQ_Tonal_Stitched_Welting']
OAK = bpy.data.materials['EQ_Smoked_Oak_Feet']
APPROVED = OLD['MODELS']['sofa-2-seater']
SOURCES = dict(OLD['MODELS'])
WEB = {}
STATS = {}

# Copies only: the approved material datablocks are never edited.
MOBILE_FABRIC = FABRIC.copy()
MOBILE_FABRIC.name = 'EQ_Mobile_Woven_Upholstery_VertexTint'
shader = next(n for n in MOBILE_FABRIC.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
shader.inputs['Base Color'].default_value = (1, 1, 1, 1)
shader.inputs['Roughness'].default_value = 0.89
colors = MOBILE_FABRIC.node_tree.nodes.new('ShaderNodeVertexColor')
colors.layer_name = 'UpholsteryTint'
MOBILE_FABRIC.node_tree.links.new(colors.outputs['Color'], shader.inputs['Base Color'])
MOBILE_OAK = OAK.copy()
MOBILE_OAK.name = 'EQ_Mobile_Smoked_Oak'


def meshes(model):
    return [o for o in model['collection'].objects if o.type == 'MESH']


def bounds(model):
    points = [o.matrix_world @ v.co for o in meshes(model) for v in o.data.vertices]
    lo = Vector([min(p[a] for p in points) for a in range(3)])
    hi = Vector([max(p[a] for p in points) for a in range(3)])
    return lo, hi


def new_scene(label, collection):
    scene = bpy.data.scenes.new(label)
    scene.unit_settings.system = APPROVED['scene'].unit_settings.system
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = APPROVED['scene'].render.engine
    scene.world = APPROVED['scene'].world
    scene.collection.children.link(collection)
    scene.collection.children.link(bpy.data.collections['EQ_Studio_Excluded_From_GLTF'])
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = APPROVED['scene'].view_settings.view_transform
    scene.view_settings.look = APPROVED['scene'].view_settings.look
    return scene


def new_source(slug, label, seats=0):
    collection = bpy.data.collections.new('EQ_Library_Source_' + slug)
    scene = new_scene('EndQuote Source | ' + label, collection)
    root = bpy.data.objects.new('EQ_' + slug, None)
    collection.objects.link(root)
    root['category'] = slug
    if seats:
        root['seat_count'] = seats
    model = dict(slug=slug, label=label, collection=collection, scene=scene, root=root, seats=seats)
    SOURCES[slug] = model
    bpy.context.window.scene = scene
    return model


def add_box(model, role, dims, center, radius=0.05, mat=FABRIC, **kwargs):
    return OLD['rounded_box']('EQ_' + model['slug'] + '_' + role, dims, center, radius,
                              mat, model['collection'], model['root'], **kwargs)


def add_piping(model, role, half, radius, deform, back=False):
    return OLD['piping']('EQ_' + model['slug'] + '_' + role, half, radius, deform,
                         back, model['collection'], model['root'])


def finish_source(model):
    bpy.context.window.scene = model['scene']
    bpy.context.view_layer.update()
    lo, hi = bounds(model)
    shift = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    for obj in meshes(model):
        for v in obj.data.vertices:
            v.co += shift
        obj.data.update()
    model['dimensions'] = tuple(hi - lo)
    return model


def clone_source(base, slug, label, seats):
    model = new_source(slug, label, seats)
    for obj in meshes(base):
        copy = obj.copy()
        copy.data = obj.data.copy()
        copy.name = obj.name.replace(base['slug'], slug)
        copy.data.name = copy.name + '_Mesh'
        copy.parent = model['root']
        model['collection'].objects.link(copy)
    return model


def save_source(slug):
    source = SOURCES[slug]
    data = {source['scene']}
    if slug in WEB:
        data.add(WEB[slug]['scene'])
    path = OUT / 'sources' / (slug + '.blend')
    bpy.data.libraries.write(str(path), data, fake_user=True, compress=True)
    print('Editable source saved:', path)


def camera(model):
    scene = model['scene']
    if scene.camera is None:
        original = APPROVED['scene'].camera
        obj = original.copy()
        obj.data = original.data.copy()
        obj.name = 'EQ_Library_' + model['slug'] + '_PreviewCamera'
        scene.collection.objects.link(obj)
        scene.camera = obj
    obj = scene.camera
    target = Vector((0, 0, model['dimensions'][2] * 0.48))
    direction = Vector((1.25, -2.1, 1.48)).normalized()
    obj.location = target + direction * 8
    obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()
    inv = obj.matrix_world.inverted()
    projected = [inv @ (o.matrix_world @ v.co) for o in meshes(model) for v in o.data.vertices]
    xmin, xmax = min(p.x for p in projected), max(p.x for p in projected)
    ymin, ymax = min(p.y for p in projected), max(p.y for p in projected)
    basis = obj.matrix_world.to_3x3()
    obj.location += basis.col[0] * ((xmin + xmax) / 2) + basis.col[1] * ((ymin + ymax) / 2)
    obj.data.ortho_scale = max(xmax - xmin, ymax - ymin) * 1.16


def preview(slug, suffix=''):
    model = WEB[slug]
    bpy.context.window.scene = model['scene']
    camera(model)
    scene = model['scene']
    scene.render.filepath = str(OUT / 'previews' / 'mobile-png' / (slug + suffix + '.png'))
    bpy.ops.render.render(write_still=True)
    print('Preview:', scene.render.filepath)


def reproject_uv(mesh):
    layer = mesh.uv_layers.active or mesh.uv_layers.new(name='FabricUV')
    layer.name = 'FabricUV'
    for polygon in mesh.polygons:
        axis = max(range(3), key=lambda a: abs(polygon.normal[a]))
        axes = ((1, 2), (0, 2), (0, 1))[axis]
        for li in polygon.loop_indices:
            p = mesh.vertices[mesh.loops[li].vertex_index].co
            layer.data[li].uv = (p[axes[0]] / 0.064, p[axes[1]] / 0.064)


def optimize(slug, quality=1.0):
    assert slug != 'sofa-2-seater', 'Approved geometry is immutable'
    source = SOURCES[slug]
    collection = bpy.data.collections.new('EQ_Mobile_Model_' + slug)
    scene = new_scene('EndQuote Mobile | ' + source['label'], collection)
    bpy.context.window.scene = scene
    root = bpy.data.objects.new('EQ_Mobile_' + slug, None)
    collection.objects.link(root)
    root['category'] = slug
    root['units'] = 'meters'
    root['front_axis'] = '+Z in glTF'
    if source.get('seats'):
        root['seat_count'] = source['seats']
    groups = {'Upholstery': [], 'OakStructure': []}
    original_parts = []
    for original in meshes(source):
        # Sub-millimeter seam tubes are retained in source, omitted on mobile.
        if any(word in original.name.lower() for word in ('piping', 'welting')):
            continue
        obj = original.copy()
        obj.data = original.data.copy()
        obj.parent = None
        obj.matrix_world = original.matrix_world.copy()
        obj.name = 'EQ_Mobile_Part_' + original.name
        collection.objects.link(obj)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        name = original.name.lower()
        if 'piping' in name:
            ratio = 0.15
        elif any(word in name for word in ('foot', 'leg', 'post', 'rail', 'support')):
            ratio = 0.10 if 'rear_support' not in name else 0.18
        elif 'cushion' in name:
            ratio = 0.32 if source.get('seats', 0) >= 5 else 0.36
        elif 'armrest' in name:
            ratio = 0.30
        elif 'base' in name:
            ratio = 0.55
        else:
            ratio = 0.45
        modifier = obj.modifiers.new('Mobile_Geometry_Reduction', 'DECIMATE')
        modifier.ratio = min(1.0, ratio * quality)
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        reproject_uv(obj.data)
        material = original.data.materials[0]
        wood = 'Oak' in material.name or 'Wood' in material.name
        if wood:
            obj.data.materials.clear()
            obj.data.materials.append(MOBILE_OAK)
            groups['OakStructure'].append(obj)
        else:
            shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            tint = tuple(shader.inputs['Base Color'].default_value)
            layer = obj.data.color_attributes.new(name='UpholsteryTint', type='FLOAT_COLOR', domain='CORNER')
            for color in layer.data:
                color.color = tint
            obj.data.materials.clear()
            obj.data.materials.append(MOBILE_FABRIC)
            groups['Upholstery'].append(obj)
        original_parts.append(original.name)
    for role, objects in groups.items():
        if not objects:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = 'EQ_Mobile_' + slug + '_' + role
        obj.data.name = obj.name + '_Mesh'
        obj.parent = root
        obj.data.calc_loop_triangles()
    model = dict(slug=slug, label=source['label'], collection=collection, scene=scene,
                 root=root, seats=source.get('seats', 0))
    lo, hi = bounds(model)
    shift = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    for obj in meshes(model):
        for vertex in obj.data.vertices:
            vertex.co += shift
        obj.data.update()
    model['dimensions'] = tuple(hi - lo)
    root['source_components'] = json.dumps(original_parts)
    WEB[slug] = model
    print(json.dumps(inspect(slug), indent=2))
    return model


def inspect(slug):
    model = WEB[slug]
    errors = []
    for obj in meshes(model):
        obj.data.calc_loop_triangles()
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        nonmanifold = sum(not edge.is_manifold for edge in bm.edges)
        loose = sum(not vertex.link_edges for vertex in bm.verts)
        bm.free()
        if nonmanifold or loose:
            errors.append(dict(object=obj.name, nonmanifold=nonmanifold, loose=loose))
    report = dict(id=slug, triangles=sum(len(o.data.loop_triangles) for o in meshes(model)),
                  dimensions_m=list(model['dimensions']), draw_calls=sum(len(o.data.materials) for o in meshes(model)),
                  materials=len({m for o in meshes(model) for m in o.data.materials}), errors=errors)
    STATS[slug] = report
    return report


def export(slug):
    model = WEB[slug]
    path = OUT / 'public' / 'models' / (slug + '.glb')
    bpy.context.window.scene = model['scene']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [model['root']] + meshes(model):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = model['root']
    captured = io.StringIO()
    with contextlib.redirect_stdout(captured):
        bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB',
            use_selection=True, use_active_scene=True, export_yup=True,
            export_apply=True, export_normals=True, export_texcoords=True,
            export_tangents=True, export_animations=False,
            export_cameras=False, export_lights=False, export_extras=True,
            export_draco_mesh_compression_enable=False)
    warnings = [line for line in captured.getvalue().splitlines() if 'WARNING' in line or 'Warning' in line]
    if slug == 'sofa-2-seater':
        # Preserve the approved published asset, including every vertex and material.
        shutil.copyfile(OUT / 'sofa-2-seater.glb', path)
    report = inspect(slug)
    report.update(file_size_bytes=path.stat().st_size,
                  sha256=hashlib.sha256(path.read_bytes()).hexdigest(), export_warnings=warnings)
    (OUT / 'reports' / (slug + '-mobile-geometry.json')).write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return path


def approved_export():
    scene = new_scene('EndQuote Mobile | Approved 2-Seater', APPROVED['collection'])
    model = dict(APPROVED)
    model['scene'] = scene
    WEB['sofa-2-seater'] = model
    export('sofa-2-seater')
    save_source('sofa-2-seater')
    preview('sofa-2-seater')


def create_additional_sources():
    model = clone_source(APPROVED, 'sofa-bed', 'Unfolded Sofa Bed', 2)
    for obj in list(meshes(model)):
        if 'SeatCushion' in obj.name or 'SeatPiping' in obj.name:
            bpy.data.objects.remove(obj, do_unlink=True)
    add_box(model, 'Rear_Platform_Support', (1.40, 0.86, 0.05), (0, -0.18, 0.315), 0.016, FRAME)
    add_box(model, 'Deployed_Sleeping_Platform', (1.414, 2.03, 0.04), (0, -0.78, 0.36), 0.012, OAK)
    for i in range(3):
        y = 0.23 - (i + 0.5) * (2.01 / 3)
        obj, deform, half, radius = add_box(model, 'Folded_Mattress_Panel_' + str(i + 1),
            (1.40, 2.01 / 3 - 0.012, 0.10), (0, y, 0.43), 0.043,
            FABRIC, crown_axis=2, crown=0.006)
        add_piping(model, 'Mattress_Welting_' + str(i + 1), half, radius, deform)
    for i, (x, y) in enumerate(((-0.60, -1.70), (0.60, -1.70), (-0.60, -0.88), (0.60, -0.88))):
        add_box(model, 'Deployed_Support_Leg_' + str(i + 1), (0.045, 0.045, 0.34), (x, y, 0.17), 0.006, OAK)
    finish_source(model)

    model = new_source('dining-chair', 'Upholstered Dining Chair', 1)
    add_box(model, 'Oak_Seat_Rail', (0.45, 0.45, 0.04), (0, -0.015, 0.38), 0.012, OAK)
    obj, deform, half, radius = add_box(model, 'SeatCushion_01', (0.48, 0.48, 0.08),
            (0, -0.015, 0.44), 0.034, FABRIC, crown_axis=2, crown=0.006)
    add_piping(model, 'SeatPiping_01', half, radius, deform)
    obj, deform, half, radius = add_box(model, 'BackCushion_01', (0.455, 0.105, 0.42),
            (0, 0.235, 0.735), 0.043, FABRIC, crown_axis=1, crown=0.009, rotation=math.radians(-5))
    add_piping(model, 'BackPiping_01', half, radius, deform, True)
    for side, x in (('Left', -0.195), ('Right', 0.195)):
        add_box(model, 'Front_Oak_Leg_' + side, (0.042, 0.042, 0.36), (x, -0.195, 0.18), 0.006, OAK)
        add_box(model, 'Rear_Oak_Post_' + side, (0.04, 0.04, 0.87), (x, 0.265, 0.435), 0.0055, OAK)
    finish_source(model)

    model = new_source('ottoman', 'Upholstered Ottoman', 1)
    add_box(model, 'Upholstered_Base', (0.61, 0.61, 0.24), (0, 0, 0.21), 0.06, FRAME)
    obj, deform, half, radius = add_box(model, 'SeatCushion_01', (0.63, 0.63, 0.10),
            (0, 0, 0.38), 0.045, FABRIC, crown_axis=2, crown=0.008)
    add_piping(model, 'SeatPiping_01', half, radius, deform)
    for i, (x, y) in enumerate(((-0.22, -0.22), (0.22, -0.22), (-0.22, 0.22), (0.22, 0.22))):
        add_box(model, 'OakFoot_' + str(i + 1), (0.055, 0.055, 0.09), (x, y, 0.045), 0.007, OAK)
    finish_source(model)

    for slug, label, width in (('mattress-single', 'Single Mattress', 0.90),
                               ('mattress-double', 'Double Mattress', 1.60)):
        model = new_source(slug, label)
        add_box(model, 'Upholstered_Mattress_Core', (width, 2.0, 0.20),
                (0, 0, 0.10), 0.055, FRAME)
        obj, deform, half, radius = add_box(model, 'Soft_Mattress_Top_Panel',
                (width - 0.012, 1.988, 0.045), (0, 0, 0.2225), 0.020,
                FABRIC, crown_axis=2, crown=0.004)
        add_piping(model, 'Top_Perimeter_Welting', half, radius, deform)
        finish_source(model)

    model = new_source('upholstered-headboard', 'Upholstered Headboard')
    add_box(model, 'Upholstered_Backing', (1.70, 0.065, 1.18), (0, 0.055, 0.59), 0.028, FRAME)
    for i, x in enumerate((-0.55, 0, 0.55)):
        obj, deform, half, radius = add_box(model, 'Padded_Panel_' + str(i + 1),
            (0.536, 0.095, 1.08), (x, -0.025, 0.62), 0.042, FABRIC,
            crown_axis=1, crown=0.01)
        add_piping(model, 'Panel_Welting_' + str(i + 1), half, radius, deform, True)
    finish_source(model)
    print('Six additional editable furniture sources constructed in Blender.')
