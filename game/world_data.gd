extends RefCounted
## Original hand-authored world; coordinates are not taken from a reference game.

const GRID := 2.0
const WORLD_RADIUS := 17.0
const GROW_SECONDS := 30.0
const STACK_LIMIT := 999
const BUILD_LIMIT := 80
const ITEMS := ["wood", "stone", "plank", "seed", "crop"]
const LABELS := {"wood": "خشب", "stone": "حجر", "plank": "ألواح", "seed": "بذور", "crop": "محصول"}
const COSTS := {
	"floor": {"plank": 2, "stone": 1},
	"wall": {"plank": 2, "stone": 2},
	"fence": {"plank": 1, "wood": 1},
}
const BUILD_NAMES := {"floor": "أرضية", "wall": "حائط", "fence": "سياج"}
const PLOTS := [Vector2i(1, 2), Vector2i(2, 2), Vector2i(1, 3), Vector2i(2, 3)]
const TREES := [
	Vector2(-7, -5),
	Vector2(-10, -2),
	Vector2(-12, 3),
	Vector2(-9, 8),
	Vector2(-5, 11),
	Vector2(1, 12),
	Vector2(9, 9),
	Vector2(12, 4),
	Vector2(11, -4),
	Vector2(7, -10),
	Vector2(0, -12),
	Vector2(-6, -11),
]
const ROCKS := [
	Vector2(-5, 1),
	Vector2(-7, 4),
	Vector2(5, -4),
	Vector2(9, -7),
	Vector2(7, 8),
	Vector2(-2, 10),
	Vector2(-10, -6),
	Vector2(2, -9)
]
const PALETTE := {
	"ink": Color("203f39"),
	"muted": Color("526d63"),
	"cream": Color("fff9e9"),
	"panel": Color("f4efdd"),
	"green": Color("215d4a"),
	"mint": Color("dcebcf"),
	"gold": Color("edb45b"),
	"danger": Color("953f37"),
	"water": Color("67b5b5"),
	"sand": Color("e0c78f"),
	"grass": Color("9fb87a"),
	"bark": Color("956a42"),
	"leaf": Color("548766"),
	"rock": Color("9ea79c"),
	"soil": Color("73533d"),
	"terracotta": Color("bc714d"),
}


static func resource_position(id: String) -> Vector2:
	var parts := id.split("_")
	var index := int(parts[1])
	return TREES[index] if parts[0] == "tree" else ROCKS[index]


static func resource_ids() -> Array[String]:
	var ids: Array[String] = []
	for i in TREES.size():
		ids.append("tree_%d" % i)
	for i in ROCKS.size():
		ids.append("rock_%d" % i)
	return ids


static func cell_key(cell: Vector2i) -> String:
	return "%d,%d" % [cell.x, cell.y]


static func cell_position(cell: Vector2i) -> Vector3:
	return Vector3(cell.x * GRID, 0, cell.y * GRID)


static func is_buildable(cell: Vector2i) -> bool:
	var point := Vector2(cell.x * GRID, cell.y * GRID)
	if point.length() > 14.0 or cell in PLOTS:
		return false
	# Keep the central spawn clear and resource sites accessible, even after depletion.
	if point.length() < 2.7:
		return false
	for p in TREES + ROCKS:
		if point.distance_to(p) < 2.1:
			return false
	return true
