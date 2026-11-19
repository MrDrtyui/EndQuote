#!/usr/bin/env python3
"""Validate the 12-model EndQuote mobile library using decoded GLB geometry.

Run: python3 tools/verify_library.py [public/models] [--manifest public/models/manifest.json]
The approved two-seater is intentionally preserved byte-for-byte and is exempt
from the new material, mesh-group, and triangle limits. No source asset changes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import zlib

from verify_glbs import AssetError, GLB, IDENTITY, bounds, close, multiply, node_matrix, require, transform


ASSETS = {
    "armchair": 1,
    "sofa-2-seater": 2,
    "sofa-3-seater": 3,
    "sofa-4-seater": 4,
    "sofa-l-shaped": 3,
    "sofa-u-shaped": 5,
    "sofa-bed": None,
    "dining-chair": 1,
    "ottoman": None,
    "mattress-single": None,
    "mattress-double": None,
    "upholstered-headboard": None,
}
PRESERVED_ID = "sofa-2-seater"
PRESERVED_SHA256 = "178fb12be5cd6ed4d7c2431a9c4f3eb713dedbc9133db9d911c96bca9e38717f"
COMPRESSED_EXTENSIONS = {"KHR_draco_mesh_compression", "EXT_meshopt_compression"}


def metadata_value(metadata, names):
    if not isinstance(metadata, dict):
        return None
    for name in names:
        if name in metadata:
            return metadata[name]
    for subkey in ("semantics", "classification", "metadata"):
        value = metadata_value(metadata.get(subkey), names)
        if value is not None:
            return value
    return None


def manifest_records(path):
    if path is None:
        return {}
    content = json.loads(path.read_text())
    records = content if isinstance(content, list) else content.get("models", content.get("assets", []))
    require(isinstance(records, list), "Manifest must be an array or contain a models/assets array")
    result = {}
    for record in records:
        require(isinstance(record, dict), "Manifest contains a non-object record")
        asset_id = record.get("id") or Path(record.get("file", record.get("model", ""))).stem
        require(asset_id and asset_id not in result, "Missing or duplicate manifest asset ID")
        result[asset_id] = record
    require(set(result) == set(ASSETS), "Manifest must describe exactly the twelve expected model IDs")
    return result


def image_info(asset):
    result = []
    doc = asset.doc
    for image in doc.get("images", []):
        require("uri" not in image and "bufferView" in image, "Image is not embedded")
        index = image["bufferView"]
        require(0 <= index < len(doc.get("bufferViews", [])), "Image references invalid bufferView")
        view = doc["bufferViews"][index]
        start = view.get("byteOffset", 0)
        data = asset.binary[start:start + view["byteLength"]]
        info = {"name": image.get("name"), "mime_type": image.get("mimeType"), "bytes": len(data)}
        if image.get("mimeType") == "image/png":
            require(data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 33, "Invalid embedded PNG header")
            require(data[12:16] == b"IHDR", "PNG has no leading IHDR chunk")
            width, height = struct.unpack_from(">II", data, 16)
            require(width > 0 and height > 0, "PNG dimensions are zero")
            bit_depth, color_type, compression, filtering, interlace = struct.unpack_from("5B", data, 24)
            require(bit_depth == 8 and color_type in (2, 6), "Expected RGB/RGBA 8-bit normal PNG")
            require(compression == 0 and filtering == 0 and interlace == 0, "Unsupported PNG coding mode")
            cursor = 8
            compressed = bytearray()
            finished = False
            while cursor < len(data):
                require(cursor + 12 <= len(data), "Truncated PNG chunk")
                length = struct.unpack_from(">I", data, cursor)[0]
                kind = data[cursor + 4:cursor + 8]
                require(cursor + 12 + length <= len(data), "PNG chunk exceeds image bytes")
                payload = data[cursor + 8:cursor + 8 + length]
                crc = struct.unpack_from(">I", data, cursor + 8 + length)[0]
                require(zlib.crc32(kind + payload) & 0xFFFFFFFF == crc, "Embedded PNG has an invalid chunk CRC")
                if kind == b"IDAT":
                    compressed.extend(payload)
                cursor += 12 + length
                if kind == b"IEND":
                    require(length == 0 and cursor == len(data), "Invalid PNG terminator/trailing bytes")
                    finished = True
                    break
            require(finished and compressed, "PNG lacks image data or terminator")
            scanlines = zlib.decompress(compressed)
            row_bytes = width * (3 if color_type == 2 else 4)
            require(len(scanlines) == height * (row_bytes + 1), "PNG decoded scanline length mismatch")
            require(all(scanlines[row * (row_bytes + 1)] <= 4 for row in range(height)), "Invalid PNG filter byte")
            info.update(width=width, height=height, bit_depth=bit_depth, color_type=color_type,
                        encoding_check="PNG chunk CRCs and zlib scanline data valid")
        result.append(info)
    for texture in doc.get("textures", []):
        require("source" in texture and 0 <= texture["source"] < len(result), "Texture references missing embedded image")
        if "sampler" in texture:
            require(0 <= texture["sampler"] < len(doc.get("samplers", [])), "Texture references missing sampler")
    return result


def inspect(asset, asset_id, record, approved_source):
    doc = asset.doc
    preserved = asset_id == PRESERVED_ID
    warnings = []
    if preserved:
        source_sha = hashlib.sha256(approved_source.read_bytes()).hexdigest()
        require(source_sha == PRESERVED_SHA256, "Approved original two-seater changed since preservation was pinned")
        require(asset.sha256 == source_sha, "Public two-seater differs from the approved original GLB")
        warnings.append("Preservation exception: approved two-seater retains 10,908 triangles, 4 materials and 16 mesh nodes.")
    require(asset.size <= 500_000, "File exceeds hard 500 kB mobile budget")
    if asset.size > 300_000:
        warnings.append("File exceeds preferred 300 kB budget.")
    require(not doc.get("cameras") and not doc.get("animations") and not doc.get("skins"),
            "Export contains cameras, animations or skins")
    extensions = set(doc.get("extensionsUsed", [])) | set(doc.get("extensionsRequired", []))
    require(not (extensions & COMPRESSED_EXTENSIONS), "Asset requires compression decoding")
    require("KHR_lights_punctual" not in extensions and "KHR_lights_punctual" not in doc.get("extensions", {}),
            "Export includes lights")
    buffers = doc.get("buffers", [])
    require(len(buffers) == 1 and "uri" not in buffers[0], "Expected one embedded binary buffer")
    require(buffers[0]["byteLength"] <= len(asset.binary) <= buffers[0]["byteLength"] + 3,
            "Embedded buffer length differs from BIN payload")
    for view in doc.get("bufferViews", []):
        require(view.get("buffer", 0) == 0, "BufferView references an external buffer")
        require(0 <= view.get("byteOffset", 0) and 0 < view["byteLength"], "Invalid bufferView range")
        require(view.get("byteOffset", 0) + view["byteLength"] <= buffers[0]["byteLength"], "BufferView exceeds BIN buffer")
        require(not (set(view.get("extensions", {})) & COMPRESSED_EXTENSIONS), "Compressed bufferView")
    for accessor_index in range(len(doc.get("accessors", []))):
        asset.accessor(accessor_index)
    images = image_info(asset)

    materials = doc.get("materials", [])
    require(1 <= len(materials) <= (4 if preserved else 3), "Material count exceeds mobile budget")
    for material in materials:
        require(material.get("name"), "Unnamed material")
        require("pbrMetallicRoughness" in material, "Missing metallic-roughness PBR material")
        pbr = material["pbrMetallicRoughness"]
        require(0 <= pbr.get("metallicFactor", 1) <= 1 and 0 <= pbr.get("roughnessFactor", 1) <= 1,
                "PBR factors are outside zero to one")
        color = pbr.get("baseColorFactor", [1, 1, 1, 1])
        require(len(color) == 4 and all(0 <= x <= 1 for x in color), "Invalid PBR base color")
        require(material.get("alphaMode", "OPAQUE") == "OPAQUE", "Unexpected transparent upholstery")

    nodes = doc.get("nodes", [])
    meshes = doc.get("meshes", [])
    scenes = doc.get("scenes", [])
    require(len(scenes) == 1, "Expected one exported scene")
    roots = scenes[doc.get("scene", 0)].get("nodes", [])
    require(len(roots) == 1 and 0 <= roots[0] < len(nodes), "Expected one named model root")
    root = nodes[roots[0]]
    require(root.get("name") and close(node_matrix(root), IDENTITY), "Root is not named and at identity/floor origin")
    for node in nodes:
        require(node.get("name"), "Unnamed exported object")
        require("camera" not in node and "KHR_lights_punctual" not in node.get("extensions", {}), "Camera/light node")
        matrix = node_matrix(node)
        require(all(math.isfinite(x) for x in matrix), "Non-finite object transform")
        require(close(matrix[:12], IDENTITY[:12]) and abs(matrix[15] - 1) < 1e-6,
                "Unapplied rotation/scale: " + node["name"])

    seen = set()
    points_world = []
    triangle_count = 0
    mesh_count = 0
    primitive_count = 0
    vertex_count = 0
    tangent_vertices = 0
    max_normal_tangent_dot = 0.0
    material_groups = []
    uv_meshes = 0
    color_meshes = 0
    vertex_color_ranges = []

    def visit(index, parent, ancestors):
        nonlocal triangle_count, mesh_count, primitive_count, vertex_count, tangent_vertices
        nonlocal max_normal_tangent_dot, uv_meshes, color_meshes
        require(0 <= index < len(nodes), "Invalid node reference")
        require(index not in ancestors and index not in seen, "Cyclic hierarchy or multiple parents")
        seen.add(index)
        node = nodes[index]
        matrix = multiply(parent, node_matrix(node))
        if "mesh" in node:
            require(0 <= node["mesh"] < len(meshes), "Invalid mesh reference")
            mesh_count += 1
            group_materials = set()
            mesh_has_uv = False
            mesh_has_color = False
            for primitive in meshes[node["mesh"]].get("primitives", []):
                primitive_count += 1
                require(primitive.get("mode", 4) == 4, "Non-triangle geometry")
                require(not (set(primitive.get("extensions", {})) & COMPRESSED_EXTENSIONS), "Compressed mesh primitive")
                require(not primitive.get("targets"), "Unexpected furniture morph targets")
                attributes = primitive.get("attributes", {})
                require("POSITION" in attributes and "NORMAL" in attributes, "Missing positions or normals")
                for semantic in ("POSITION", "NORMAL"):
                    a = doc["accessors"][attributes[semantic]]
                    require(a["type"] == "VEC3" and a["componentType"] == 5126, semantic + " is not float VEC3")
                positions = asset.accessor(attributes["POSITION"])
                normals = asset.accessor(attributes["NORMAL"])
                vertex_count += len(positions)
                for semantic, accessor_index in attributes.items():
                    require(len(asset.accessor(accessor_index)) == len(positions), "Attribute count mismatch: " + semantic)
                require(all(abs(sum(x * x for x in n) - 1) < 0.002 for n in normals), "Normals are not unit length")
                lo, hi = bounds(positions)
                pa = doc["accessors"][attributes["POSITION"]]
                require("min" in pa and "max" in pa and close(lo, pa["min"], 2e-5) and close(hi, pa["max"], 2e-5),
                        "Decoded POSITION bounds differ from accessor min/max")
                if "TANGENT" in attributes:
                    a = doc["accessors"][attributes["TANGENT"]]
                    require(a["type"] == "VEC4" and a["componentType"] == 5126, "Tangent is not float VEC4")
                    for tangent, normal in zip(asset.accessor(attributes["TANGENT"]), normals):
                        tangent_vertices += 1
                        dot = abs(sum(tangent[j] * normal[j] for j in range(3)))
                        max_normal_tangent_dot = max(max_normal_tangent_dot, dot)
                        require(dot < 0.002 and abs(sum(x * x for x in tangent[:3]) - 1) < 0.002,
                                "Nonorthonormal tangent: " + node["name"])
                        require(abs(abs(tangent[3]) - 1) < 1e-6, "Invalid tangent handedness")
                for semantic, accessor_index in attributes.items():
                    if semantic.startswith("TEXCOORD_"):
                        a = doc["accessors"][accessor_index]
                        require(a["type"] == "VEC2", "UV accessor is not VEC2")
                        require(a["componentType"] == 5126 or
                                (a["componentType"] in (5121, 5123) and a.get("normalized")),
                                "UV accessor is not float or normalized unsigned integer")
                        mesh_has_uv = True
                    if semantic.startswith("COLOR_"):
                        a = doc["accessors"][accessor_index]
                        require(a["type"] in ("VEC3", "VEC4"), "Vertex color is not VEC3/VEC4")
                        require(a["componentType"] == 5126 or
                                (a["componentType"] in (5121, 5123) and a.get("normalized")),
                                "Vertex color is not float or normalized unsigned integer")
                        if a["componentType"] == 5126:
                            require(all(0 <= value <= 1 for color in asset.accessor(accessor_index) for value in color),
                                    "Float vertex colors are outside zero to one")
                        rows = asset.accessor(accessor_index)
                        divisor = 255 if a["componentType"] == 5121 else 65535 if a["componentType"] == 5123 else 1
                        vertex_color_ranges.append({
                            "node": node["name"], "semantic": semantic, "component_type": a["componentType"],
                            "min": [min(row[channel] for row in rows) / divisor for channel in range(len(rows[0]))],
                            "max": [max(row[channel] for row in rows) / divisor for channel in range(len(rows[0]))],
                        })
                        mesh_has_color = True
                mat_index = primitive.get("material")
                require(isinstance(mat_index, int) and 0 <= mat_index < len(materials), "Missing material assignment")
                group_materials.add(mat_index)
                material = materials[mat_index]
                if "COLOR_0" in attributes and not preserved:
                    require(close(material["pbrMetallicRoughness"].get("baseColorFactor", [1, 1, 1, 1]), [1, 1, 1, 1]),
                            "Vertex-tinted upholstery material has an extra base-color multiplier")
                if "normalTexture" in material:
                    texture = material["normalTexture"]
                    require("TANGENT" in attributes, "Normal mapped material lacks explicit tangents")
                    require(f"TEXCOORD_{texture.get('texCoord', 0)}" in attributes, "Normal map references missing UVs")
                    require(0 <= texture["index"] < len(doc.get("textures", [])), "Normal map references missing texture")
                if "indices" in primitive:
                    ia = doc["accessors"][primitive["indices"]]
                    require(ia["type"] == "SCALAR" and ia["componentType"] in (5121, 5123, 5125), "Invalid index accessor")
                    indices = [row[0] for row in asset.accessor(primitive["indices"])]
                else:
                    indices = list(range(len(positions)))
                require(len(indices) % 3 == 0 and all(0 <= i < len(positions) for i in indices), "Invalid triangle index range")
                for start in range(0, len(indices), 3):
                    a, b, c = (positions[i] for i in indices[start:start + 3])
                    u = [b[j] - a[j] for j in range(3)]
                    v = [c[j] - a[j] for j in range(3)]
                    cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
                    require(sum(x * x for x in cross) > 1e-20, "Degenerate triangle: " + node["name"])
                triangle_count += len(indices) // 3
                points_world.extend(transform(matrix, p) for p in positions)
            material_groups.append(sorted(group_materials))
            uv_meshes += int(mesh_has_uv)
            color_meshes += int(mesh_has_color)
        for child in node.get("children", []):
            visit(child, matrix, ancestors | {index})

    visit(roots[0], IDENTITY, set())
    require(len(seen) == len(nodes), "Unreferenced nodes outside model hierarchy")
    require(points_world and triangle_count > 0, "No exported furniture geometry")
    if not preserved:
        require(triangle_count <= 10_000, "Asset exceeds hard 10,000 triangle budget")
        require(1 <= mesh_count <= 3, "Asset exceeds three mesh groups")
        require(all(len(group) == 1 for group in material_groups), "Mesh group contains multiple materials/draw calls")
        require(len({group[0] for group in material_groups}) == mesh_count, "Material is split across multiple mesh groups")
        if triangle_count > 5_000:
            warnings.append("Asset exceeds preferred 2,000–5,000 triangle target but meets 10,000 hard cap.")
    lower, upper = bounds(points_world)
    require(abs(lower[1]) <= 0.002, "Model does not contact Y=0 floor")
    require(abs((lower[0] + upper[0]) / 2) <= 0.002 and abs((lower[2] + upper[2]) / 2) <= 0.002,
            "Horizontal bounding-box center differs from root origin")
    dimensions = {"width": upper[0] - lower[0], "depth": upper[2] - lower[2], "height": upper[1] - lower[1]}
    require(all(0.05 < value < 6.5 for value in dimensions.values()), "Implausible furniture size in meters")
    seat_names = ("seat_count", "seatCount", "seats")
    root_seats = metadata_value(root.get("extras", {}), seat_names)
    manifest_seats = metadata_value(record, seat_names)
    seats = root_seats if root_seats is not None else manifest_seats
    if ASSETS[asset_id] is not None:
        require(seats == ASSETS[asset_id], f"Expected {ASSETS[asset_id]} semantic seats, found {seats}")
    elif asset_id == "sofa-bed":
        require(isinstance(seats, int) and 1 <= seats <= 4, "Sofa-bed lacks a valid semantic seat count")
    if root_seats is not None and manifest_seats is not None:
        require(root_seats == manifest_seats, "Root/manifest seat counts disagree")
    if record:
        for key, actual in (("triangle_count", triangle_count), ("file_size_bytes", asset.size),
                            ("material_count", len(materials)), ("draw_calls", primitive_count)):
            if key in record:
                require(record[key] == actual, "Manifest disagrees with decoded asset: " + key)
        if "dimensions" in record:
            require(all(abs(record["dimensions"][key] - value) <= 0.002 for key, value in dimensions.items()),
                    "Manifest dimensions differ from decoded geometry")
        if "sha256" in record:
            require(record["sha256"] == asset.sha256, "Manifest SHA differs from actual bytes")
    return {
        "id": asset_id, "file": asset.path.name, "status": "pass", "bytes": asset.size,
        "sha256": asset.sha256, "triangles": triangle_count, "vertices_after_gltf_splits": vertex_count,
        "mesh_nodes": mesh_count, "draw_calls": primitive_count, "material_count": len(materials),
        "materials": [m["name"] for m in materials], "dimensions_meters": dimensions,
        "material_pbr_factors": [{"name": m["name"],
                                  "base_color": m["pbrMetallicRoughness"].get("baseColorFactor", [1, 1, 1, 1]),
                                  "metallic": m["pbrMetallicRoughness"].get("metallicFactor", 1),
                                  "roughness": m["pbrMetallicRoughness"].get("roughnessFactor", 1)} for m in materials],
        "bounds_y_up_meters": {"min": lower, "max": upper}, "root": root["name"],
        "seat_count": seats, "uv_meshes": uv_meshes, "vertex_color_meshes": color_meshes,
        "vertex_color_ranges": vertex_color_ranges,
        "tangent_vertices_checked": tangent_vertices, "max_abs_normal_tangent_dot": max_normal_tangent_dot,
        "images": images, "extensions_used": sorted(extensions), "preservation_exception": preserved,
        "warnings": warnings,
    }


def main():
    collection = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", nargs="?", type=Path, default=collection / "public" / "models")
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--approved-source", type=Path, default=collection / f"{PRESERVED_ID}.glb")
    parser.add_argument("--output", type=Path, default=collection / "library-verification.json")
    args = parser.parse_args()
    manifest_path = args.manifest
    if manifest_path is None:
        manifest_path = next((p for p in (args.directory / "manifest.json", args.directory.parent / "manifest.json") if p.exists()), None)
    records = manifest_records(manifest_path)
    results = []
    for asset_id in ASSETS:
        try:
            result = inspect(GLB(args.directory / f"{asset_id}.glb"), asset_id, records.get(asset_id, {}), args.approved_source)
        except (AssetError, OSError, ValueError, KeyError, IndexError, TypeError, struct.error, zlib.error) as exc:
            result = {"id": asset_id, "file": f"{asset_id}.glb", "status": "fail", "error": str(exc)}
        results.append(result)
        print(f"{result['status'].upper()}: {asset_id}: " +
              (f"{result['triangles']:,} triangles / {result['bytes']:,} bytes / {result['material_count']} materials / {result['draw_calls']} draws"
               if result["status"] == "pass" else result["error"]))
    report = {
        "status": "pass" if all(r["status"] == "pass" for r in results) else "fail",
        "validator": "EndQuote mobile-library binary/geometry acceptance checker v1",
        "directory": str(args.directory.resolve()), "manifest": str(manifest_path.resolve()) if manifest_path else None,
        "approved_two_seater_sha256": PRESERVED_SHA256,
        "checks": ["GLB binary/accessor ranges, finite geometry, triangle indices and nondegenerate faces",
                   "unit normals, UV accessors, unit orthogonal tangents and valid handedness",
                   "valid vertex colors and white PBR base multiplier on vertex-tinted upholstery",
                   "embedded PNG CRCs, 8-bit RGB/RGBA coding, zlib data and scanline lengths",
                   "one identity root, applied rotations/scales, Y-up floor-centered meter bounds",
                   "named PBR materials and embedded images; no external resources, cameras, lights or animation",
                   "no Draco/meshopt compression; mobile triangle, file, material and draw-call budgets",
                   "semantic seat-count metadata and manifest consistency; byte-identical approved two-seater"],
        "limitations": ["Focused acceptance checks are not the complete Khronos glTF conformance suite.",
                        "Metadata checks do not establish silhouette quality or absence of part intersections.",
                        "PNG encoding is structurally decoded; browser texture upload and GPU rendering are separate checks.",
                        "Target-phone rendering performance requires testing in EndQuote's application."],
        "assets": results,
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print("Report:", args.output)
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
