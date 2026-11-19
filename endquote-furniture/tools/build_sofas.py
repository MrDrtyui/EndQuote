"""EndQuote furniture construction helpers; execute inside Blender through MCP."""

import bpy
import bmesh
import json
import math
from pathlib import Path
from mathutils import Matrix, Vector

OUT = Path('/Users/ila/dev/projects/renameme/endquote-furniture')
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'previews').mkdir(exist_ok=True)
MODELS = {}


def enum_value(owner, prop, identifier):
    available = owner.bl_rna.properties[prop].enum_items
    assert identifier in {item.identifier for item in available}, (prop, identifier)
    return identifier


def material(name, color, roughness=0.87):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = 0
    if 'Specular IOR Level' in shader.inputs:
        shader.inputs['Specular IOR Level'].default_value = 0.28
    mat.diffuse_color = (*color, 1)
    return mat


def fabric_normal():
    """Small, seamless, reusable woven normal map; no procedural export dependency."""
    size = 128
    image = bpy.data.images.new('EQ_Weave_Normal_128', width=size, height=size)
    image.colorspace_settings.name = 'Non-Color'
    pixels = []
    for y in range(size):
        for x in range(size):
            a = 2 * math.pi * x / 8
            b = 2 * math.pi * y / 8
            nx = 0.11 * math.sin(a) * (0.75 + 0.25 * math.cos(b))
            ny = 0.11 * math.sin(b) * (0.75 - 0.25 * math.cos(a))
            nz = math.sqrt(1 - nx * nx - ny * ny)
            pixels.extend(((nx + 1) / 2, (ny + 1) / 2, (nz + 1) / 2, 1))
    image.pixels.foreach_set(pixels)
    image.pack()
    return image


FABRIC = material('EQ_Warm_Beige_Woven_Upholstery', (0.57, 0.50, 0.415))
FRAME = material('EQ_Warm_Beige_Upholstered_Frame', (0.505, 0.44, 0.365), 0.9)
SEAM = material('EQ_Tonal_Stitched_Welting', (0.44, 0.38, 0.315), 0.93)
OAK = material('EQ_Smoked_Oak_Feet', (0.052, 0.036, 0.024), 0.56)
NORMAL = fabric_normal()
for mat in (FABRIC, FRAME):
    nodes = mat.node_tree.nodes
    shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = NORMAL
    normal = nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = 0.23
    mat.node_tree.links.new(tex.outputs['Color'], normal.inputs['Color'])
    mat.node_tree.links.new(normal.outputs['Normal'], shader.inputs['Normal'])


def make_object(name, verts, faces, mat, collection, root, uv_axes=None):
    mesh = bpy.data.meshes.new(name + '_Mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = root
    obj.data.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    layer = mesh.uv_layers.new(name='FabricUV')
    for polygon in mesh.polygons:
        axis = uv_axes[polygon.index] if uv_axes else max(range(3), key=lambda a: abs(polygon.normal[a]))
        axes = ((1, 2), (0, 2), (0, 1))[axis]
        for li in polygon.loop_indices:
            p = mesh.vertices[mesh.loops[li].vertex_index].co
            layer.data[li].uv = (p[axes[0]] / 0.064, p[axes[1]] / 0.064)
    return obj


def rounded_box(name, dims, center, radius, mat, collection, root,
                crown_axis=None, crown=0, taper=0, ramp=0, rotation=0):
    half = [d / 2 for d in dims]
    radius = min(radius, min(half) * 0.92)
    core = [h - radius for h in half]

    def samples(axis):
        h, c = half[axis], core[axis]
        interior = 4 if dims[axis] > 0.24 else 1
        values = [-h + radius * k / 3 for k in range(4)]
        values += [-c + (2 * c) * k / interior for k in range(1, interior)]
        values += [c + radius * k / 3 for k in range(4)]
        return values

    rotation_matrix = Matrix.Rotation(rotation, 4, 'X')

    def deform(v):
        p = Vector(v)
        if crown_axis is not None:
            other = [a for a in range(3) if a != crown_axis]
            falloff = math.prod(max(0, math.cos(math.pi * p[a] / dims[a])) ** 1.5 for a in other)
            sign = 1 if p[crown_axis] > 0 else -1
            if crown_axis != 2 or sign > 0:
                p[crown_axis] += sign * crown * falloff * abs(p[crown_axis] / half[crown_axis]) ** 2
        if taper:
            p.x *= 1 - taper * (p.z / half[2] + 1) / 2
        if ramp:
            front = max(0, min(1, (half[1] - p.y) / dims[1]))
            p.z -= ramp * front ** 1.5 * (p.z / half[2] + 1) / 2
        return rotation_matrix @ p + Vector(center)

    verts, faces, uv_axes = [], [], []
    seen = {}
    for axis in range(3):
        u, v = (axis + 1) % 3, (axis + 2) % 3
        us, vs = samples(u), samples(v)
        for sign in (-1, 1):
            grid = {}
            for i, pu in enumerate(us):
                for j, pv in enumerate(vs):
                    p = Vector((0, 0, 0))
                    p[axis], p[u], p[v] = sign * half[axis], pu, pv
                    c = Vector([max(-core[a], min(core[a], p[a])) for a in range(3)])
                    p = c + (p - c).normalized() * radius
                    key = tuple(round(value, 9) for value in p)
                    if key not in seen:
                        seen[key] = len(verts)
                        verts.append(tuple(deform(p)))
                    grid[i, j] = seen[key]
            for i in range(len(us) - 1):
                for j in range(len(vs) - 1):
                    face = [grid[i, j], grid[i + 1, j], grid[i + 1, j + 1], grid[i, j + 1]]
                    faces.append(face if sign == 1 else face[::-1])
                    uv_axes.append(axis)
    obj = make_object(name, verts, faces, mat, collection, root, uv_axes)
    obj['component'] = 'cushion' if 'Cushion' in name else 'structure'
    return obj, deform, half, radius


def rectangle_path(hx, hy, radius):
    points = []
    for cx, cy, start in ((hx - radius, hy - radius, 0),
                          (-hx + radius, hy - radius, 90),
                          (-hx + radius, -hy + radius, 180),
                          (hx - radius, -hy + radius, 270)):
        for step in range(8):
            angle = math.radians(start + step * 90 / 7)
            points.append(Vector((cx + radius * math.cos(angle), cy + radius * math.sin(angle))))
    return points


def piping(name, half, radius, deform, is_back, collection, root):
    hx, hy, hz = half
    if is_back:
        inset = 0.025
        section_r = math.sqrt(max(0, radius * radius - (radius - inset) ** 2))
        path2 = rectangle_path(hx - radius + section_r, hz - radius + section_r, section_r)
        points = [deform((p.x, -hy + inset, p.y)) for p in path2]
    else:
        path2 = rectangle_path(hx, hy, radius)
        points = [deform((p.x, p.y, 0)) for p in path2]
    verts, faces = [], []
    count = len(points)
    plane_normal = (points[1] - points[0]).cross(points[count // 2] - points[0]).normalized()
    for i, point in enumerate(points):
        tangent = (points[(i + 1) % count] - points[(i - 1) % count]).normalized()
        side = tangent.cross(plane_normal).normalized()
        for j in range(6):
            angle = 2 * math.pi * j / 6
            verts.append(tuple(point + 0.00125 * (math.cos(angle) * side + math.sin(angle) * plane_normal)))
    for i in range(count):
        for j in range(6):
            faces.append((i * 6 + j, ((i + 1) % count) * 6 + j,
                          ((i + 1) % count) * 6 + (j + 1) % 6, i * 6 + (j + 1) % 6))
    obj = make_object(name, verts, faces, SEAM, collection, root)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    obj['component'] = 'seam'
    return obj


def extruded_base(name, outline, collection, root):
    count = len(outline)
    verts = [(x, y, z) for z in (0.115, 0.29) for x, y in outline]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    obj = make_object(name, verts, faces, FRAME, collection, root)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('Tailored_Frame_Rounding', 'BEVEL')
    mod.width = 0.032
    mod.segments = 4
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mod = obj.modifiers.new('Frame_Weighted_Normals', 'WEIGHTED_NORMAL')
    mod.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    if any(len(p.vertices) > 4 for p in obj.data.polygons):
        mod = obj.modifiers.new('Concave_Panel_Export_Triangulation', 'TRIANGULATE')
        mod.min_vertices = 5
        if hasattr(mod, 'keep_custom_normals'):
            mod.keep_custom_normals = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # Fresh projection avoids zero-area UVs inherited by bevel corner strips.
    layer = obj.data.uv_layers.active
    for polygon in obj.data.polygons:
        axis = max(range(3), key=lambda a: abs(polygon.normal[a]))
        axes = ((1, 2), (0, 2), (0, 1))[axis]
        for li in polygon.loop_indices:
            p = obj.data.vertices[obj.data.loops[li].vertex_index].co
            layer.data[li].uv = (p[axes[0]] / 0.064, p[axes[1]] / 0.064)
    return obj


def studio_collection():
    collection = bpy.data.collections.get('EQ_Studio_Excluded_From_GLTF')
    if collection:
        return collection
    collection = bpy.data.collections.new('EQ_Studio_Excluded_From_GLTF')
    mat = material('EQ_Studio_Backdrop', (0.79, 0.775, 0.74), 0.95)
    mesh = bpy.data.meshes.new('EQ_Studio_Floor_Mesh')
    mesh.from_pydata([(-100, -100, -0.002), (100, -100, -0.002), (100, 100, -0.002), (-100, 100, -0.002)], [], [(0, 1, 2, 3)])
    floor = bpy.data.objects.new('EQ_Studio_Floor_NOT_FOR_EXPORT', mesh)
    floor.data.materials.append(mat)
    collection.objects.link(floor)
    for name, position, energy, size in (
        ('Key', (-3.5, -4, 5), 500, 4.0),
        ('Fill', (4, -1.5, 3.0), 240, 3.2),
        ('Rim', (0.5, 3.5, 4.5), 600, 3.0),
    ):
        data = bpy.data.lights.new('EQ_Studio_' + name, 'AREA')
        data.energy, data.size = energy, size
        obj = bpy.data.objects.new(data.name, data)
        collection.objects.link(obj)
        obj.location = position
        obj.rotation_euler = (Vector((0, 0, 0.4)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    return collection


def set_camera(scene, model):
    if not scene.camera:
        data = bpy.data.cameras.new('EQ_' + model['slug'] + '_PreviewCamera')
        scene.camera = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(scene.camera)
    camera = scene.camera
    camera.data.type = enum_value(camera.data, 'type', 'ORTHO')
    width, depth, height = model['dimensions']
    target = Vector((0, 0, 0.44))
    direction = Vector((1.25, -2.1, 1.48)).normalized()
    camera.location = target + direction * 8
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()
    inverse = camera.matrix_world.inverted()
    projected = [inverse @ v.co for obj in model['collection'].objects
                 if obj.type == 'MESH' for v in obj.data.vertices]
    xlo, xhi = min(p.x for p in projected), max(p.x for p in projected)
    ylo, yhi = min(p.y for p in projected), max(p.y for p in projected)
    right = camera.matrix_world.to_3x3().col[0]
    up = camera.matrix_world.to_3x3().col[1]
    camera.location += right * ((xlo + xhi) / 2) + up * ((ylo + yhi) / 2)
    aspect = scene.render.resolution_x / scene.render.resolution_y
    camera.data.ortho_scale = max(xhi - xlo, (yhi - ylo) * aspect) * 1.16


def build_model(slug, label, seats, seat_width, chaise='none', extension=1.84):
    assert slug not in MODELS
    scene = bpy.data.scenes.new('EndQuote | ' + label)
    scene.unit_settings.system = enum_value(scene.unit_settings, 'system', 'METRIC')
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = bpy.context.scene.render.engine
    scene.render.resolution_x, scene.render.resolution_y = 1200, 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = enum_value(scene.render.image_settings, 'file_format', 'PNG')
    scene.world = bpy.data.worlds.new('EQ_' + slug + '_StudioWorld')
    scene.world.use_nodes = True
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (0.72, 0.72, 0.72, 1)
    bg.inputs['Strength'].default_value = 0.35
    scene.collection.children.link(studio_collection())
    collection = bpy.data.collections.new('EQ_Model_' + slug)
    scene.collection.children.link(collection)
    bpy.context.window.scene = scene
    root = bpy.data.objects.new('EQ_' + slug, None)
    collection.objects.link(root)
    root['category'], root['seat_count'] = slug, seats
    root['units'], root['front_axis'] = 'meters', '-Y in Blender, +Z in glTF'
    gap, arm_width = 0.016, 0.18
    inside = seats * seat_width + (seats - 1) * gap
    width = inside + arm_width * 2 + 0.012
    xmin, xmax = -width / 2, width / 2
    wing = seat_width + arm_width + 0.006
    front_tip = 0.48 - extension
    if chaise == 'right':
        outline = [(xmin, -0.48), (xmax - wing, -0.48), (xmax - wing, front_tip),
                   (xmax, front_tip), (xmax, 0.48), (xmin, 0.48)]
    elif chaise == 'both':
        outline = [(xmin, front_tip), (xmin + wing, front_tip), (xmin + wing, -0.48),
                   (xmax - wing, -0.48), (xmax - wing, front_tip), (xmax, front_tip),
                   (xmax, 0.48), (xmin, 0.48)]
    else:
        outline = [(xmin, -0.48), (xmax, -0.48), (xmax, 0.48), (xmin, 0.48)]
    extruded_base('EQ_' + slug + '_Continuous_Upholstered_Base', outline, collection, root)
    rounded_box('EQ_' + slug + '_Rear_Support', (inside - 0.02, 0.055, 0.415),
                (0, 0.432, 0.496), 0.025, FRAME, collection, root,
                rotation=math.radians(-8))
    for side, x in (('Left', xmin + arm_width / 2), ('Right', xmax - arm_width / 2)):
        is_long = chaise == 'both' or (chaise == 'right' and side == 'Right')
        arm_front = front_tip + 0.008 if is_long else -0.465
        arm_depth = 0.465 - arm_front
        rounded_box('EQ_' + slug + '_Armrest_' + side, (arm_width, arm_depth, 0.425),
                    (x, (arm_front + 0.465) / 2, 0.5025), 0.062, FABRIC,
                    collection, root, crown_axis=0, crown=0.004, ramp=0.145 if is_long else 0.055)
    for i in range(seats):
        x = -inside / 2 + seat_width / 2 + i * (seat_width + gap)
        is_long = (chaise == 'right' and i == seats - 1) or (chaise == 'both' and i in (0, seats - 1))
        front = front_tip + 0.045 if is_long else -0.435
        depth = 0.235 - front
        center = (x, (front + 0.235) / 2, 0.38)
        obj, deform, half, radius = rounded_box(
            'EQ_' + slug + '_SeatCushion_' + str(i + 1).zfill(2),
            (seat_width, depth, 0.18), center, 0.064, FABRIC, collection, root,
            crown_axis=2, crown=0.012)
        obj['seat_index'], obj['chaise'] = i + 1, is_long
        piping('EQ_' + slug + '_SeatPiping_' + str(i + 1).zfill(2), half, radius, deform, False, collection, root)
        obj, deform, half, radius = rounded_box(
            'EQ_' + slug + '_BackCushion_' + str(i + 1).zfill(2),
            (seat_width - 0.003, 0.19, 0.485), (x, 0.311, 0.672), 0.07,
            FABRIC, collection, root, crown_axis=1, crown=0.021, taper=0.025,
            rotation=math.radians(-8))
        piping('EQ_' + slug + '_BackPiping_' + str(i + 1).zfill(2), half, radius, deform, True, collection, root)
    feet = [(xmin + 0.12, -0.34), (xmax - 0.12, -0.34),
            (xmin + 0.12, 0.34), (xmax - 0.12, 0.34)]
    if seats >= 3:
        feet += [(0, -0.33), (0, 0.33)]
    if chaise in ('right', 'both'):
        feet += [(xmax - 0.12, front_tip + 0.13), (xmax - wing + 0.1, front_tip + 0.13)]
    if chaise == 'both':
        feet += [(xmin + 0.12, front_tip + 0.13), (xmin + wing - 0.1, front_tip + 0.13)]
    for i, (x, y) in enumerate(feet):
        obj, *_ = rounded_box('EQ_' + slug + '_OakFoot_' + str(i + 1).zfill(2),
                             (0.072, 0.072, 0.115), (x, y, 0.0575), 0.008,
                             OAK, collection, root)
        for vertex in obj.data.vertices:
            factor = 0.82 + 0.18 * vertex.co.z / 0.115
            vertex.co.x = x + (vertex.co.x - x) * factor
            vertex.co.y = y + (vertex.co.y - y) * factor
    objects = [o for o in collection.objects if o.type == 'MESH']
    bounds = [Vector(v.co) for obj in objects for v in obj.data.vertices]
    lo = Vector([min(p[a] for p in bounds) for a in range(3)])
    hi = Vector([max(p[a] for p in bounds) for a in range(3)])
    shift = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    for obj in objects:
        for vertex in obj.data.vertices:
            vertex.co += shift
        obj.data.update()
    model = dict(slug=slug, label=label, scene=scene, collection=collection, root=root,
                 seats=seats, chaise=chaise, dimensions=tuple(hi - lo), shift=tuple(shift))
    MODELS[slug] = model
    set_camera(scene, model)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.context.view_layer.update()
    print(json.dumps({'created': slug, 'seats': seats, 'mesh_objects': len(objects),
                      'dimensions_m': model['dimensions'],
                      'triangles': sum(len(o.data.loop_triangles) for o in objects)}))
    return model


def inspect_model(slug):
    model = MODELS[slug]
    report = {'model': slug, 'seats': model['seats'], 'dimensions_m': model['dimensions'],
              'objects': [], 'triangles': 0, 'polygons': 0, 'errors': []}
    for obj in model['collection'].objects:
        if obj.type != 'MESH':
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        bm = bmesh.new()
        bm.from_mesh(mesh)
        nonmanifold = sum(not e.is_manifold for e in bm.edges)
        loose = sum(not v.link_edges for v in bm.verts)
        volume = bm.calc_volume(signed=True)
        bm.free()
        if nonmanifold or loose or volume <= 0:
            report['errors'].append({'object': obj.name, 'nonmanifold': nonmanifold, 'loose': loose, 'volume': volume})
        report['objects'].append({'name': obj.name, 'polygons': len(mesh.polygons),
                                  'triangles': len(mesh.loop_triangles), 'volume_m3': volume})
        report['triangles'] += len(mesh.loop_triangles)
        report['polygons'] += len(mesh.polygons)
    (OUT / (slug + '-geometry.json')).write_text(json.dumps(report, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k != 'objects'}, indent=2))
    return report


def preview(slug, suffix=''):
    model = MODELS[slug]
    scene = model['scene']
    bpy.context.window.scene = scene
    scene.render.filepath = str(OUT / 'previews' / (slug + suffix + '.png'))
    bpy.ops.render.render(write_still=True)
    print('Preview saved: ' + scene.render.filepath)


def export_model(slug):
    model = MODELS[slug]
    bpy.context.window.scene = model['scene']
    bpy.ops.object.select_all(action='DESELECT')
    meshes = [o for o in model['collection'].objects if o.type == 'MESH']
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    model['root'].select_set(True)
    bpy.context.view_layer.objects.active = model['root']
    path = OUT / (slug + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format='GLB', use_selection=True,
        use_active_scene=True, export_yup=True, export_apply=True,
        export_normals=True, export_texcoords=True, export_tangents=True,
        export_animations=False, export_cameras=False, export_lights=False,
        export_extras=True, export_draco_mesh_compression_enable=False)
    print(json.dumps({'exported': str(path), 'bytes': path.stat().st_size}))
    return path

