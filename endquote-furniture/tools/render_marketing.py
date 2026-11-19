"""Render the landing page's editorial plates from the read-only catalogue GLBs.

blender -b -P tools/render_marketing.py
Requires cwebp on PATH. All styling and lights exist only in this temporary scene.
"""
import math
from pathlib import Path
import subprocess
import tempfile

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
STUDIES = [
    ("sofa-2-seater", (0.31, 0.51, 0.057)),
    ("armchair", (0.63, 0.235, 0.092)),
    ("sofa-l-shaped", (0.39, 0.45, 0.56)),
]


def surface(name, color, roughness=0.8):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    return material, shader


def math_node(tree, operation, a, b=0):
    node = tree.nodes.new("ShaderNodeMath")
    node.operation = operation
    for i, value in enumerate((a, b)):
        if isinstance(value, (int, float)):
            node.inputs[i].default_value = value
        else:
            tree.links.new(value, node.inputs[i])
    return node.outputs[0]


def tint(tree, signal, low, high):
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*low, 1)
    ramp.color_ramp.elements[1].color = (*high, 1)
    tree.links.new(signal, ramp.inputs["Fac"])
    return ramp.outputs[0]


def textile(color):
    material, shader = surface("Studio / finely ribbed textile", color)
    tree = material.node_tree
    xyz = tree.nodes.new("ShaderNodeNewGeometry").outputs["Position"]
    direction = tree.nodes.new("ShaderNodeVectorMath")
    direction.operation = "DOT_PRODUCT"
    direction.inputs[1].default_value = (1, 0.24, 0.065)
    tree.links.new(xyz, direction.inputs[0])
    phase = math_node(tree, "MULTIPLY", direction.outputs["Value"], 330)
    ridge = math_node(tree, "ABSOLUTE", math_node(tree, "SINE", phase))
    fibers = tree.nodes.new("ShaderNodeTexNoise")
    fibers.inputs["Scale"].default_value = 650
    fibers.inputs["Detail"].default_value = 2
    tree.links.new(xyz, fibers.inputs["Vector"])
    signal = math_node(tree, "MULTIPLY", ridge, fibers.outputs["Fac"])
    tree.links.new(tint(tree, signal, tuple(x * .55 for x in color),
                        tuple(x * 1.25 for x in color)), shader.inputs["Base Color"])
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = .56
    bump.inputs["Distance"].default_value = .0026
    tree.links.new(signal, bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    shader.inputs["Specular IOR Level"].default_value = .29
    shader.inputs["Sheen Weight"].default_value = .13
    shader.inputs["Sheen Roughness"].default_value = .67
    return material


def floor_surface(spacing):
    material, shader = surface("Studio / ruled graphite", (.02, .022, .020))
    tree = material.node_tree
    xyz = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(tree.nodes.new("ShaderNodeNewGeometry").outputs["Position"], xyz.inputs[0])
    lines = []
    for axis in ("X", "Y"):
        cycle = math_node(tree, "MULTIPLY", xyz.outputs[axis], math.pi / spacing)
        distance = math_node(tree, "ABSOLUTE", math_node(tree, "SINE", cycle))
        lines.append(math_node(tree, "LESS_THAN", distance, .012))
    grid = math_node(tree, "MAXIMUM", *lines)
    shader.inputs["Specular IOR Level"].default_value = .16
    tree.links.new(tint(tree, grid, (.012, .013, .0125), (.032, .035, .030)),
                   shader.inputs["Base Color"])
    return material


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def light(location, energy, size, color, target, scale):
    bpy.ops.object.light_add(type="AREA", location=Vector(location) * scale)
    obj = bpy.context.object
    obj.data.energy = energy * scale ** 2
    obj.data.shape = "DISK"
    obj.data.size = size * scale
    obj.data.color = color
    point_at(obj, target)


def orbit_arc(rx, ry, start, end, thickness, material):
    curve = bpy.data.curves.new("Engraved orbit", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = thickness
    curve.bevel_resolution = 2
    points = curve.splines.new("POLY").points
    points.add(179)
    for i, point in enumerate(points):
        t = math.radians(start + (end - start) * i / (len(points) - 1))
        point.co = (rx * math.cos(t), ry * math.sin(t), .001, 1)
    obj = bpy.data.objects.new("Ground / orbit", curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(material)


def render(model_id, color, tmp):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / "public/models" / f"{model_id}.glb"))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    corners = [obj.matrix_world @ Vector(v) for obj in meshes for v in obj.bound_box]
    width, depth, height = [max(p[i] for p in corners) - min(p[i] for p in corners) for i in range(3)]
    cloth = textile(color)
    frame = textile(tuple(x * .78 for x in color))
    seam, _ = surface("Tonal welting", tuple(x * .7 for x in color))
    feet, _ = surface("Smoked ash", (.047, .033, .022), .46)
    for obj in meshes:
        for slot in obj.material_slots:
            name = slot.material.name.lower()
            slot.material = (feet if "oak" in name else seam if "welt" in name
                             else frame if "frame" in name else cloth)

    scale = max(width / 1.816, .78)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.001))
    bpy.context.object.data.materials.append(floor_surface(.245 * scale))
    engraved, _ = surface("Ground / silver", (.14, .15, .135))
    acid, sh = surface("Ground / index mark", (.63, .85, .27))
    sh.inputs["Emission Color"].default_value = (.50, .70, .19, 1)
    sh.inputs["Emission Strength"].default_value = .4
    orbit_arc(width * .666, depth * .93, -56, 295, .00155 * scale, engraved)
    orbit_arc(width * .666, depth * .93, -66, -55, .0028 * scale, acid)
    aim = (0, 0, height * .48)
    scene = bpy.context.scene
    scene.world = bpy.data.worlds.new("Graphite studio")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (.28, .31, .30, 1)
    background.inputs["Strength"].default_value = .18
    light((-2.35, -1.9, 3.0), 300, 2.4, (1, .981, .90), aim, scale)
    light((2.8, -.3, 2.1), 68, 1.85, (.84, .91, 1), aim, scale)
    light((-.4, 2.0, 2.9), 180, 1.9, (.99, 1, .92), aim, scale)
    bpy.ops.object.camera_add(location=Vector(aim) + Vector((2.35, -4.85, 2.1)) * scale)
    camera = bpy.context.object
    point_at(camera, aim)
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max(width * 1.55, height * 2.66, depth * 1.98)
    if model_id == "sofa-l-shaped":
        camera.data.ortho_scale *= 1.06
    scene.camera = camera
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1440, 792
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(tmp / f"{model_id}.png")
    bpy.ops.render.render(write_still=True)
    output = ROOT / "public/marketing" / f"study-{model_id}.webp"
    subprocess.run(["cwebp", "-quiet", "-q", "91", "-m", "6",
                    scene.render.filepath, "-o", str(output)], check=True)
    print(f"Created {output.name} ({output.stat().st_size:,} bytes)", flush=True)


with tempfile.TemporaryDirectory(prefix="endquote-studio-") as directory:
    for asset, tint_color in STUDIES:
        render(asset, tint_color, Path(directory))
