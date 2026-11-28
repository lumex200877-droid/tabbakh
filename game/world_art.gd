extends RefCounted
## All models are original compositions of engine primitives; no external game assets.
const Data := preload("res://game/world_data.gd")


static func material(color: Color) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.95
	return mat


static func mesh(parent: Node3D, shape: Mesh, at: Vector3, color: Color) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	instance.mesh = shape
	instance.material_override = material(color)
	instance.position = at
	parent.add_child(instance)
	return instance


static func box(parent: Node3D, at: Vector3, size: Vector3, color: Color) -> MeshInstance3D:
	var shape := BoxMesh.new()
	shape.size = size
	return mesh(parent, shape, at, color)


static func cylinder(
	parent: Node3D,
	at: Vector3,
	bottom: float,
	top: float,
	height: float,
	color: Color,
	segments := 10
) -> MeshInstance3D:
	var shape := CylinderMesh.new()
	shape.bottom_radius = bottom
	shape.top_radius = top
	shape.height = height
	shape.radial_segments = segments
	shape.rings = 1
	return mesh(parent, shape, at, color)


static func ball(parent: Node3D, at: Vector3, radius: float, color: Color) -> MeshInstance3D:
	var shape := SphereMesh.new()
	shape.radius = radius
	shape.height = radius * 2
	shape.radial_segments = 10
	shape.rings = 5
	return mesh(parent, shape, at, color)


static func tree(parent: Node3D, at: Vector2, index: int) -> Node3D:
	var node := Node3D.new()
	parent.add_child(node)
	node.position = Vector3(at.x, 0, at.y)
	cylinder(node, Vector3(0, 1.3, 0), 0.24, 0.16, 2.6, Data.PALETTE.bark)
	var leaf := Data.PALETTE.leaf as Color
	for i in 6:
		var angle := i * TAU / 6 + index * 0.4
		var blade := box(
			node,
			Vector3(sin(angle) * 0.65, 2.6, cos(angle) * 0.65),
			Vector3(0.65, 0.17, 1.7),
			leaf.lightened(0.07 * (i % 3))
		)
		blade.rotation = Vector3(0.2, angle, 0.0)
	ball(node, Vector3(0, 2.7, 0), 0.45, leaf.lightened(0.12))
	return node


static func rock(parent: Node3D, at: Vector2, index: int) -> Node3D:
	var node := Node3D.new()
	parent.add_child(node)
	node.position = Vector3(at.x, 0.0, at.y)
	var shape := SphereMesh.new()
	shape.radius = 0.75
	shape.height = 1.1
	shape.radial_segments = 5
	shape.rings = 2
	var stone := mesh(node, shape, Vector3(0, 0.35, 0), Data.PALETTE.rock)
	stone.rotation.y = index * 0.9
	box(node, Vector3(0.4, 0.18, 0.3), Vector3(0.55, 0.36, 0.5), Data.PALETTE.rock.darkened(0.1))
	return node


static func building(
	parent: Node3D, kind: String, cell: Vector2i, turn: int, ghost := false, valid := true
) -> Node3D:
	var node := Node3D.new()
	parent.add_child(node)
	node.position = Data.cell_position(cell)
	node.rotation.y = turn * PI / 2
	var wood: Color = Data.PALETTE.bark
	var light: Color = Data.PALETTE.cream
	if ghost:
		wood = Color("8fcca0") if valid else Color("ce7661")
		light = wood
	if kind == "floor":
		for i in 4:
			box(node, Vector3(i * 0.46 - 0.69, 0.08, 0), Vector3(0.43, 0.16, 1.85), wood)
	elif kind == "wall":
		box(node, Vector3(0, 0.95, 0), Vector3(1.85, 1.9, 0.22), light)
		for x in [-0.85, 0.85]:
			box(node, Vector3(x, 1, 0), Vector3(0.14, 2.0, 0.3), wood)
		box(node, Vector3(0, 1.9, 0), Vector3(1.9, 0.15, 0.3), wood)
	else:
		for x in [-0.8, 0.8]:
			box(node, Vector3(x, 0.5, 0), Vector3(0.14, 1, 0.14), wood)
		for y in [0.32, 0.7]:
			box(node, Vector3(0, y, 0), Vector3(1.85, 0.15, 0.12), light)
	return node


static func crop(parent: Node3D, cell: Vector2i, growth: float) -> Node3D:
	var node := Node3D.new()
	parent.add_child(node)
	node.position = Data.cell_position(cell)
	for i in 4:
		var x := -0.35 if i % 2 == 0 else 0.35
		var z := -0.35 if i < 2 else 0.35
		var h := 0.16 + growth * 0.65
		cylinder(node, Vector3(x, h / 2, z), 0.045, 0.03, h, Data.PALETTE.leaf, 5)
		var leaves := ball(
			node, Vector3(x, h * 0.7, z), 0.13 + growth * 0.08, Data.PALETTE.leaf.lightened(0.12)
		)
		leaves.scale.y = 0.45
		if growth >= 1:
			ball(node, Vector3(x, h, z), 0.15, Data.PALETTE.gold)
	return node


static func player(parent: Node3D) -> Node3D:
	var node := Node3D.new()
	parent.add_child(node)
	# Feet point toward -Z. Silhouette is original and intentionally low-poly.
	for x in [-0.14, 0.14]:
		box(node, Vector3(x, 0.2, 0), Vector3(0.18, 0.4, 0.23), Data.PALETTE.green)
	box(node, Vector3(0, 0.62, 0), Vector3(0.55, 0.55, 0.35), Data.PALETTE.cream)
	box(node, Vector3(0, 0.64, 0.25), Vector3(0.35, 0.4, 0.22), Data.PALETTE.terracotta)
	ball(node, Vector3(0, 1.12, 0), 0.27, Color("d7a37b"))
	cylinder(node, Vector3(0, 1.35, 0), 0.4, 0.4, 0.08, Data.PALETTE.gold)
	cylinder(node, Vector3(0, 1.45, 0), 0.24, 0.21, 0.2, Data.PALETTE.gold)
	return node


static func environment(root: Node3D) -> void:
	var world := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("b6d7d9")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("e1ede0")
	env.ambient_light_energy = 0.65
	world.environment = env
	root.add_child(world)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52, -35, 0)
	sun.light_color = Color("ffedcc")
	sun.light_energy = 1.2
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 50
	root.add_child(sun)
	var ocean := PlaneMesh.new()
	ocean.size = Vector2(240, 240)
	mesh(root, ocean, Vector3(0, -0.55, 0), Data.PALETTE.water)
	cylinder(root, Vector3(0, -0.4, 0), 20.4, 19.2, 0.7, Data.PALETTE.sand, 48)
	cylinder(root, Vector3(0, -0.07, 0), 17.8, 17.7, 0.13, Data.PALETTE.grass, 48)
	# Quiet stepping-stone trail leads to the farming patch.
	for i in 6:
		cylinder(
			root,
			Vector3(sin(i * 0.4) * 0.5, 0.015, i * 1.3 - 4),
			0.5,
			0.5,
			0.03,
			Data.PALETTE.sand,
			7
		)
	for cell in Data.PLOTS:
		box(
			root,
			Data.cell_position(cell) + Vector3(0, 0.02, 0),
			Vector3(1.8, 0.05, 1.8),
			Data.PALETTE.soil
		)
		for i in 3:
			box(
				root,
				Data.cell_position(cell) + Vector3(0, 0.06, i * 0.5 - 0.5),
				Vector3(1.5, 0.06, 0.13),
				Data.PALETTE.soil.lightened(0.12)
			)
	# Distant silhouettes are decoration only, not unreachable gameplay promises.
	for p in [Vector3(-45, -0.5, -40), Vector3(40, -0.5, -55)]:
		cylinder(root, p, 9, 7, 1, Data.PALETTE.sand, 12)
		cylinder(root, p + Vector3(0, 1.3, 0), 6, 0.3, 3, Data.PALETTE.leaf, 7)
