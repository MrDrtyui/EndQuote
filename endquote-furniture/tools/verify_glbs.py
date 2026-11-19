#!/usr/bin/env python3
"""Independently inspect EndQuote GLB 2.0 geometry without third-party modules.

Usage: python3 tools/verify_glbs.py [directory] [--spec expectations.json]
Writes verification.json. This is a focused asset acceptance checker, not a
replacement for the complete Khronos glTF conformance validator or visual QA.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import sys


DEFAULTS = {
    "armchair.glb": {"seats": 1, "backs": 1, "shape": "straight"},
    "sofa-2-seater.glb": {"seats": 2, "backs": 2, "shape": "straight"},
    "sofa-3-seater.glb": {"seats": 3, "backs": 3, "shape": "straight"},
    "sofa-4-seater.glb": {"seats": 4, "backs": 4, "shape": "straight"},
    "sofa-l-shaped.glb": {"seats": 3, "backs": 3, "shape": "L"},
    "sofa-u-shaped.glb": {"seats": 5, "backs": 5, "shape": "U"},
}
COMPONENTS = {
    5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
    5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4),
}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4,
          "MAT2": 4, "MAT3": 9, "MAT4": 16}
IDENTITY = (1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)


class AssetError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise AssetError(message)


def close(a, b, tolerance=1e-6):
    return len(a) == len(b) and all(abs(x - y) <= tolerance for x, y in zip(a, b))


def multiply(a, b):
    return tuple(sum(a[k * 4 + row] * b[col * 4 + k] for k in range(4))
                 for col in range(4) for row in range(4))


def transform(matrix, point):
    return tuple(sum(matrix[col * 4 + row] * point[col] for col in range(3))
                 + matrix[12 + row] for row in range(3))


def node_matrix(node):
    if "matrix" in node:
        matrix = tuple(node["matrix"])
        require(len(matrix) == 16, "Node matrix must contain 16 numbers")
        require(not any(key in node for key in ("translation", "rotation", "scale")),
                "Node combines matrix and TRS transforms")
        return matrix
    x, y, z, w = node.get("rotation", (0, 0, 0, 1))
    sx, sy, sz = node.get("scale", (1, 1, 1))
    tx, ty, tz = node.get("translation", (0, 0, 0))
    return ((1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx,
            2 * (x * z - y * w) * sx, 0,
            2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy,
            2 * (y * z + x * w) * sy, 0,
            2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz,
            (1 - 2 * (x * x + y * y)) * sz, 0,
            tx, ty, tz, 1)


def bounds(points):
    return ([min(point[axis] for point in points) for axis in range(3)],
            [max(point[axis] for point in points) for axis in range(3)])


def named_part(name, role):
    name = re.sub(r"[^a-z0-9]", "", name.lower())
    return ("seatcushion" in name if role == "seat" else "backcushion" in name)


class GLB:
    def __init__(self, path):
        self.path = path
        raw = path.read_bytes()
        self.size = len(raw)
        self.sha256 = hashlib.sha256(raw).hexdigest()
        require(len(raw) >= 20, "GLB is shorter than its header and first chunk")
        magic, version, length = struct.unpack_from("<4sII", raw)
        require(magic == b"glTF" and version == 2, "Expected GLB 2.0 magic/version")
        require(length == len(raw), "GLB declared length differs from actual size")
        require(len(raw) % 4 == 0, "GLB length is not aligned to four bytes")
        chunks = []
        offset = 12
        while offset < len(raw):
            require(offset + 8 <= len(raw), "Truncated GLB chunk header")
            size, kind = struct.unpack_from("<II", raw, offset)
            offset += 8
            require(size % 4 == 0, "GLB chunk length is not aligned to four bytes")
            require(offset + size <= len(raw), "GLB chunk extends beyond file")
            chunks.append((kind, raw[offset:offset + size]))
            offset += size
        require(chunks[0][0] == 0x4E4F534A, "First GLB chunk is not JSON")
        require(len(chunks) <= 2, "Unexpected extra chunks in furniture GLB")
        self.doc = json.loads(chunks[0][1].decode("utf-8"))
        self.binary = b""
        if len(chunks) == 2:
            require(chunks[1][0] == 0x004E4942, "Second GLB chunk is not BIN")
            self.binary = chunks[1][1]
        require(self.doc.get("asset", {}).get("version") == "2.0", "Invalid glTF asset version")
        self.cache = {}

    def accessor(self, index):
        if index in self.cache:
            return self.cache[index]
        accessors = self.doc.get("accessors", [])
        require(isinstance(index, int) and 0 <= index < len(accessors), "Invalid accessor reference")
        accessor = accessors[index]
        require("sparse" not in accessor, "Sparse accessors require a full glTF validator")
        require("bufferView" in accessor, "Accessor has no buffer view")
        require(accessor.get("componentType") in COMPONENTS, "Unknown accessor component type")
        require(accessor.get("type") in WIDTHS, "Unknown accessor shape")
        views = self.doc.get("bufferViews", [])
        view_index = accessor["bufferView"]
        require(0 <= view_index < len(views), "Invalid bufferView reference")
        view = views[view_index]
        require(view.get("buffer", 0) == 0, "BufferView references a non-GLB buffer")
        fmt, component_size = COMPONENTS[accessor["componentType"]]
        width = WIDTHS[accessor["type"]]
        count = accessor["count"]
        require(isinstance(count, int) and count > 0, "Empty or invalid accessor")
        element_size = component_size * width
        stride = view.get("byteStride", element_size)
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        require(stride >= element_size, "Accessor stride is smaller than element size")
        require(start % component_size == 0, "Accessor is not component-aligned")
        require(stride % component_size == 0, "Stride is not component-aligned")
        end = start + (count - 1) * stride + element_size
        require(start >= view.get("byteOffset", 0), "Negative accessor offset")
        require(end <= view.get("byteOffset", 0) + view["byteLength"], "Accessor exceeds its bufferView")
        require(end <= len(self.binary), "Accessor exceeds GLB BIN payload")
        rows = [struct.unpack_from("<" + fmt * width, self.binary, start + i * stride)
                for i in range(count)]
        require(all(math.isfinite(value) for row in rows for value in row), "Accessor has NaN or infinite values")
        self.cache[index] = rows
        return rows

    def inspect(self, expected):
        doc = self.doc
        checks = []
        warnings = []
        require(self.size < 2_000_000, "GLB exceeds preferred 2 MB payload budget")
        require(not doc.get("cameras"), "GLB contains cameras")
        require(not doc.get("animations"), "GLB contains animations")
        require(not doc.get("skins"), "Furniture GLB contains skinning")
        require("KHR_lights_punctual" not in doc.get("extensions", {}), "GLB contains lights")
        require("KHR_lights_punctual" not in doc.get("extensionsUsed", []), "GLB declares light extension")
        buffers = doc.get("buffers", [])
        require(len(buffers) == 1 and "uri" not in buffers[0], "Expected exactly one embedded GLB buffer")
        require(buffers[0]["byteLength"] <= len(self.binary) <= buffers[0]["byteLength"] + 3,
                "GLB buffer byteLength does not match BIN chunk")
        for image in doc.get("images", []):
            require("uri" not in image, "GLB contains an external or data URI image")
            require("bufferView" in image, "Image is not embedded in a bufferView")
        for view in doc.get("bufferViews", []):
            require(view.get("buffer", 0) == 0, "BufferView uses unknown buffer")
            require(0 <= view.get("byteOffset", 0) <= len(self.binary), "BufferView starts outside BIN")
            require(view.get("byteOffset", 0) + view["byteLength"] <= buffers[0]["byteLength"],
                    "BufferView extends beyond declared buffer")
        for index in range(len(doc.get("accessors", []))):
            self.accessor(index)
        checks.extend(["GLB 2 header/chunk/buffer/accessor ranges", "self-contained payload under 2 MB",
                       "no cameras, lights, skins, or animations", "finite accessor values"])

        materials = doc.get("materials", [])
        require(materials, "No PBR materials found")
        for material in materials:
            require(material.get("name"), "Unnamed material")
            require("pbrMetallicRoughness" in material, "Material has no metallic-roughness PBR definition")
            pbr = material["pbrMetallicRoughness"]
            require(0 <= pbr.get("metallicFactor", 1) <= 1, "Invalid metallic factor")
            require(0 <= pbr.get("roughnessFactor", 1) <= 1, "Invalid roughness factor")
            color = pbr.get("baseColorFactor", [1, 1, 1, 1])
            require(len(color) == 4 and all(0 <= channel <= 1 for channel in color), "Invalid base color")
            require(material.get("alphaMode", "OPAQUE") == "OPAQUE", "Unexpected transparent furniture material")
        checks.append("named opaque metallic-roughness PBR materials")

        nodes = doc.get("nodes", [])
        meshes = doc.get("meshes", [])
        scenes = doc.get("scenes", [])
        require(len(scenes) == 1, "Expected exactly one exported scene")
        roots = scenes[doc.get("scene", 0)].get("nodes", [])
        require(len(roots) == 1, "Expected one floor-centered model root")
        require(0 <= roots[0] < len(nodes), "Invalid root node index")
        root = nodes[roots[0]]
        require(root.get("name"), "Model root has no name")
        require(close(node_matrix(root), IDENTITY), "Model root is not at zero with applied rotation/scale")
        require(not any("camera" in node for node in nodes), "Node references a camera")
        for node in nodes:
            require(node.get("name"), "Unnamed object node")
            matrix = node_matrix(node)
            require(all(math.isfinite(value) for value in matrix), "Node transform is not finite")
            require(close(matrix[:12], IDENTITY[:12]), "Unapplied object rotation/scale: " + node["name"])
            require(abs(matrix[15] - 1) < 1e-6, "Invalid affine transform")
        seen = set()
        all_points = []
        part_bounds = {}
        total_triangles = 0
        vertices = 0
        primitive_count = 0
        mesh_node_count = 0
        tiny_triangles = 0
        tangent_vertices = 0
        max_tangent_normal_dot = 0.0
        max_tangent_squared_length_error = 0.0
        normal_mapped_primitives = 0

        def visit(index, parent_matrix, ancestors):
            nonlocal total_triangles, vertices, primitive_count, mesh_node_count, tiny_triangles
            nonlocal tangent_vertices, max_tangent_normal_dot, max_tangent_squared_length_error, normal_mapped_primitives
            require(0 <= index < len(nodes), "Invalid child node index")
            require(index not in ancestors, "Node hierarchy contains a cycle")
            require(index not in seen, "Node has multiple parents")
            seen.add(index)
            node = nodes[index]
            world = multiply(parent_matrix, node_matrix(node))
            node_points = []
            if "mesh" in node:
                require(0 <= node["mesh"] < len(meshes), "Invalid mesh reference")
                mesh_node_count += 1
                mesh = meshes[node["mesh"]]
                for primitive in mesh.get("primitives", []):
                    primitive_count += 1
                    require(primitive.get("mode", 4) == 4, "Non-triangle mesh primitive")
                    attributes = primitive.get("attributes", {})
                    require("POSITION" in attributes and "NORMAL" in attributes,
                            "Primitive lacks positions or normals")
                    pos_accessor = doc["accessors"][attributes["POSITION"]]
                    normal_accessor = doc["accessors"][attributes["NORMAL"]]
                    require(pos_accessor["type"] == "VEC3" and pos_accessor["componentType"] == 5126,
                            "POSITION must be float VEC3")
                    require(normal_accessor["type"] == "VEC3" and normal_accessor["componentType"] == 5126,
                            "NORMAL must be float VEC3")
                    positions = self.accessor(attributes["POSITION"])
                    normals = self.accessor(attributes["NORMAL"])
                    require(len(normals) == len(positions), "Normal and position counts differ")
                    require(all(abs(sum(value * value for value in normal) - 1) < 0.02 for normal in normals),
                            "Normals are not approximately unit length")
                    if "TANGENT" in attributes:
                        tangent_accessor = doc["accessors"][attributes["TANGENT"]]
                        require(tangent_accessor["type"] == "VEC4" and tangent_accessor["componentType"] == 5126,
                                "TANGENT must be float VEC4")
                        tangents = self.accessor(attributes["TANGENT"])
                        require(len(tangents) == len(positions), "Tangent and position counts differ")
                        for tangent, normal in zip(tangents, normals):
                            tangent_vertices += 1
                            length_error = abs(sum(value * value for value in tangent[:3]) - 1)
                            normal_dot = abs(sum(tangent[axis] * normal[axis] for axis in range(3)))
                            max_tangent_normal_dot = max(max_tangent_normal_dot, normal_dot)
                            max_tangent_squared_length_error = max(max_tangent_squared_length_error, length_error)
                            require(length_error < 0.002, "Tangent is not unit length: " + node["name"])
                            require(abs(abs(tangent[3]) - 1) < 1e-6, "Tangent handedness is not +1 or -1")
                            require(normal_dot < 0.002,
                                    f"Tangent is not orthogonal to normal (abs dot={normal_dot:.6f}): " + node["name"])
                    lo, hi = bounds(positions)
                    require("min" in pos_accessor and "max" in pos_accessor, "POSITION accessor lacks min/max")
                    require(close(lo, pos_accessor["min"], 2e-5) and close(hi, pos_accessor["max"], 2e-5),
                            "POSITION accessor min/max differ from decoded geometry")
                    material_index = primitive.get("material")
                    require(isinstance(material_index, int) and 0 <= material_index < len(materials),
                            "Primitive lacks a valid material")
                    material = materials[material_index]
                    if "normalTexture" in material:
                        normal_mapped_primitives += 1
                        require("TANGENT" in attributes, "Normal-mapped primitive has no explicit tangents")
                        texcoord = material["normalTexture"].get("texCoord", 0)
                        require(f"TEXCOORD_{texcoord}" in attributes, "Normal map references missing UV coordinates")
                        texture_index = material["normalTexture"]["index"]
                        require(0 <= texture_index < len(doc.get("textures", [])), "Normal map references missing texture")
                    for semantic, accessor_index in attributes.items():
                        require(len(self.accessor(accessor_index)) == len(positions),
                                "Vertex attribute count mismatch: " + semantic)
                    if "indices" in primitive:
                        idx_accessor = doc["accessors"][primitive["indices"]]
                        require(idx_accessor["type"] == "SCALAR" and idx_accessor["componentType"] in (5121, 5123, 5125),
                                "Invalid index accessor type")
                        indices = [row[0] for row in self.accessor(primitive["indices"])]
                    else:
                        indices = list(range(len(positions)))
                    require(len(indices) % 3 == 0, "Triangle index count is not a multiple of three")
                    require(all(0 <= value < len(positions) for value in indices), "Triangle index outside vertex array")
                    for start in range(0, len(indices), 3):
                        a, b, c = (positions[value] for value in indices[start:start + 3])
                        u = [b[j] - a[j] for j in range(3)]
                        v = [c[j] - a[j] for j in range(3)]
                        cross = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2],
                                 u[0] * v[1] - u[1] * v[0])
                        if sum(value * value for value in cross) < 1e-20:
                            tiny_triangles += 1
                    total_triangles += len(indices) // 3
                    vertices += len(positions)
                    node_points.extend(transform(world, point) for point in positions)
                if node_points:
                    part_bounds[node["name"]] = bounds(node_points)
                    all_points.extend(node_points)
            for child in node.get("children", []):
                visit(child, world, ancestors | {index})

        visit(roots[0], IDENTITY, set())
        require(len(seen) == len(nodes), "Export contains unreferenced nodes")
        require(all_points and total_triangles > 0, "GLB has no visible mesh geometry")
        require(tiny_triangles == 0, f"Mesh has {tiny_triangles} degenerate triangles")
        lower, upper = bounds(all_points)
        dimensions = [upper[axis] - lower[axis] for axis in range(3)]
        require(abs(lower[1]) <= 0.002, f"Model does not rest on Y=0: {lower[1]:.6f} m")
        require(abs((lower[0] + upper[0]) / 2) <= 0.002, "X bounding-box center is not zero")
        require(abs((lower[2] + upper[2]) / 2) <= 0.002, "Z bounding-box center is not zero")
        require(0.6 < dimensions[1] < 1.4, "Furniture height is implausible in meters")
        require(0.5 < dimensions[0] < 6 and 0.5 < dimensions[2] < 5, "Furniture width/depth is implausible in meters")
        checks.extend(["one named identity root and applied rotations/scales", "valid hierarchy and material references",
                       "decoded finite positions and unit normals", "valid triangle indices and nondegenerate faces",
                       "meter-scale bounds, Y-up, floor contact and centered origin"])
        if tangent_vertices:
            checks.append("unit orthogonal tangents with valid handedness and normal-map UV references")
        seat_names = [name for name in part_bounds if named_part(name, "seat")]
        back_names = [name for name in part_bounds if named_part(name, "back")]
        require(seat_names and back_names, "Descriptive SeatCushion/BackCushion nodes not found")
        for role, actual in (("seats", len(seat_names)), ("backs", len(back_names))):
            if expected.get(role) is not None:
                require(actual == expected[role], f"Expected {expected[role]} {role}, found {actual}")
        checks.append("descriptive cushion nodes and specified category seat counts")
        if expected.get("shape") in ("L", "U"):
            seat_depths = [hi[2] - lo[2] for name, (lo, hi) in part_bounds.items() if name in seat_names]
            require(dimensions[2] > 1.45, "Sectional footprint is not deep enough for a chaise/return")
            if max(seat_depths) < 1.0:
                warnings.append("Sectional returns use multiple short cushions; silhouette must be checked visually.")
        if doc.get("images"):
            warnings.append("Embedded textures are present; browser texture memory is not measured here.")
        checks.append("no disconnected export hierarchy or unreferenced scene nodes")
        return {
            "file": self.path.name,
            "status": "pass",
            "bytes": self.size,
            "sha256": self.sha256,
            "triangles": total_triangles,
            "vertices_after_gltf_attribute_splits": vertices,
            "mesh_nodes": mesh_node_count,
            "primitives": primitive_count,
            "materials": [material["name"] for material in materials],
            "textures": len(doc.get("textures", [])),
            "tangent_vertices_checked": tangent_vertices,
            "max_abs_tangent_normal_dot": max_tangent_normal_dot,
            "max_tangent_squared_length_error": max_tangent_squared_length_error,
            "normal_mapped_primitives": normal_mapped_primitives,
            "root": root["name"],
            "bounds_y_up_meters": {"min": lower, "max": upper},
            "dimensions_width_height_depth_meters": dimensions,
            "seat_cushions": seat_names,
            "back_cushions": back_names,
            "checks": checks,
            "warnings": warnings,
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", nargs="?", type=Path,
                        default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--spec", type=Path, help="JSON mapping filenames to seat/back count and shape overrides")
    args = parser.parse_args()
    specs = {name: dict(spec) for name, spec in DEFAULTS.items()}
    if args.spec:
        for name, overrides in json.loads(args.spec.read_text()).items():
            specs.setdefault(name, {}).update(overrides)
    results = []
    for filename, expected in specs.items():
        try:
            result = GLB(args.directory / filename).inspect(expected)
        except (AssetError, OSError, ValueError, KeyError, IndexError, TypeError, struct.error) as error:
            result = {"file": filename, "status": "fail", "error": str(error)}
        results.append(result)
        print(f"{result['status'].upper()}: {filename}: " +
              (f"{result['triangles']:,} triangles, {result['bytes']:,} bytes" if result["status"] == "pass"
               else result["error"]))
    report = {
        "status": "pass" if all(result["status"] == "pass" for result in results) else "fail",
        "validator": "EndQuote independent GLB binary/geometry acceptance checker v1",
        "limitations": [
            "This focused checker is not the complete Khronos glTF conformance validator.",
            "Cushion names/counts and footprint checks do not prove visual classification; inspect the Blender previews.",
            "A valid scene hierarchy does not prove absence of geometric intersections or floating components.",
            "Browser rendering performance and device-dependent shading require target-app QA.",
        ],
        "assets": results,
    }
    destination = args.directory / "verification.json"
    destination.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Report: {destination}")
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
