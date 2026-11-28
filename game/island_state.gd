extends RefCounted
## Pure gameplay state. No rendering, network, OS time, or file IO.
const Data := preload("res://game/world_data.gd")
const VERSION := 1

var inventory: Dictionary = {"wood": 0, "stone": 0, "plank": 0, "seed": 5, "crop": 0}
var gathered: Dictionary = {}
var buildings: Array = []
var crops: Dictionary = {}
var player_position := Vector2.ZERO
var camera_yaw := 0.0
var play_seconds := 0.0
var last_error := ""


func can_afford(cost: Dictionary) -> bool:
	for item in cost:
		if not inventory.has(item) or inventory[item] < cost[item]:
			return false
	return true


func gather(id: String) -> bool:
	if id not in Data.resource_ids() or gathered.get(id, 0) >= 3:
		return false
	var item := "wood" if id.begins_with("tree_") else "stone"
	if inventory[item] >= Data.STACK_LIMIT:
		return false
	inventory[item] += 1
	gathered[id] = gathered.get(id, 0) + 1
	return true


func craft_plank() -> bool:
	if not can_afford({"wood": 2}) or inventory.plank >= Data.STACK_LIMIT:
		return false
	inventory.wood -= 2
	inventory.plank += 1
	return true


func can_build(kind: String, cell: Vector2i) -> bool:
	if not Data.COSTS.has(kind) or not Data.is_buildable(cell):
		return false
	if buildings.size() >= Data.BUILD_LIMIT or not can_afford(Data.COSTS[kind]):
		return false
	for building in buildings:
		if int(building.x) == cell.x and int(building.z) == cell.y:
			return false
	return true


func build(kind: String, cell: Vector2i, rotation: int) -> bool:
	if not can_build(kind, cell):
		return false
	for item in Data.COSTS[kind]:
		inventory[item] -= Data.COSTS[kind][item]
	buildings.append({"kind": kind, "x": cell.x, "z": cell.y, "rotation": posmod(rotation, 4)})
	return true


func plant(cell: Vector2i) -> bool:
	var key := Data.cell_key(cell)
	if cell not in Data.PLOTS or crops.has(key) or inventory.seed < 1:
		return false
	inventory.seed -= 1
	crops[key] = {"watered": false, "remaining": Data.GROW_SECONDS}
	return true


func water(cell: Vector2i) -> bool:
	var key := Data.cell_key(cell)
	if not crops.has(key) or crops[key].watered:
		return false
	crops[key].watered = true
	return true


func harvest(cell: Vector2i) -> bool:
	var key := Data.cell_key(cell)
	if not crops.has(key) or not crops[key].watered or crops[key].remaining > 0:
		return false
	if inventory.crop > Data.STACK_LIMIT - 2 or inventory.seed > Data.STACK_LIMIT - 2:
		return false
	inventory.crop += 2
	inventory.seed += 2
	crops.erase(key)
	return true


func tick(delta: float) -> void:
	if not is_finite(delta) or delta <= 0:
		return
	play_seconds += delta
	for crop in crops.values():
		if crop.watered:
			crop.remaining = maxf(0, crop.remaining - delta)


func snapshot() -> Dictionary:
	return {
		"version": VERSION,
		"inventory": inventory.duplicate(true),
		"gathered": gathered.duplicate(true),
		"buildings": buildings.duplicate(true),
		"crops": crops.duplicate(true),
		"position": [player_position.x, player_position.y],
		"camera_yaw": camera_yaw,
		"play_seconds": play_seconds,
	}


func restore(value: Variant) -> bool:
	# Validate every field before mutating live state. Untrusted local files can be edited.
	last_error = _validate(value)
	if not last_error.is_empty():
		return false
	inventory = value.inventory.duplicate(true)
	for item in Data.ITEMS:
		inventory[item] = int(inventory[item])
	gathered = value.gathered.duplicate(true)
	buildings = value.buildings.duplicate(true)
	crops = value.crops.duplicate(true)
	player_position = Vector2(value.position[0], value.position[1])
	camera_yaw = float(value.camera_yaw)
	play_seconds = float(value.play_seconds)
	return true


static func _number(value: Variant, low: float, high: float, whole := false) -> bool:
	if typeof(value) not in [TYPE_INT, TYPE_FLOAT]:
		return false
	var n := float(value)
	return is_finite(n) and n >= low and n <= high and (not whole or floor(n) == n)


static func _validate(value: Variant) -> String:
	if not value is Dictionary or value.get("version") != VERSION:
		return "Unsupported or missing save version"
	for key in ["inventory", "gathered", "crops"]:
		if not value.get(key) is Dictionary:
			return "Invalid " + key
	if value.inventory.size() != Data.ITEMS.size():
		return "Invalid inventory keys"
	for item in Data.ITEMS:
		if not _number(value.inventory.get(item), 0, Data.STACK_LIMIT, true):
			return "Invalid item amount"
	for id in value.gathered:
		if id not in Data.resource_ids() or not _number(value.gathered[id], 0, 3, true):
			return "Invalid resource state"
	if not value.get("buildings") is Array or value.buildings.size() > Data.BUILD_LIMIT:
		return "Invalid building count"
	var occupied := {}
	for building in value.buildings:
		if not building is Dictionary or not Data.COSTS.has(building.get("kind")):
			return "Invalid building kind"
		if not _number(building.get("x"), -8, 8, true):
			return "Invalid building x"
		if not _number(building.get("z"), -8, 8, true):
			return "Invalid building z"
		if not _number(building.get("rotation"), 0, 3, true):
			return "Invalid rotation"
		var cell := Vector2i(int(building.x), int(building.z))
		var key := Data.cell_key(cell)
		if not Data.is_buildable(cell) or occupied.has(key):
			return "Overlapping or reserved building cell"
		occupied[key] = true
	for key in value.crops:
		var valid_keys: Array[String] = []
		for cell in Data.PLOTS:
			valid_keys.append(Data.cell_key(cell))
		if key not in valid_keys:
			return "Unknown plot"
		var crop: Variant = value.crops[key]
		if not crop is Dictionary or typeof(crop.get("watered")) != TYPE_BOOL:
			return "Invalid crop"
		if not _number(crop.get("remaining"), 0, Data.GROW_SECONDS):
			return "Invalid growth time"
		if not crop.watered and crop.remaining != Data.GROW_SECONDS:
			return "Unwatered crop cannot have grown"
	if not value.get("position") is Array or value.position.size() != 2:
		return "Invalid position"
	for n in value.position:
		if not _number(n, -Data.WORLD_RADIUS, Data.WORLD_RADIUS):
			return "Invalid coordinate"
	if Vector2(value.position[0], value.position[1]).length() > Data.WORLD_RADIUS:
		return "Position outside island"
	if not _number(value.get("camera_yaw"), -PI, PI):
		return "Invalid camera yaw"
	if not _number(value.get("play_seconds"), 0, 315360000):
		return "Invalid play time"
	return ""
