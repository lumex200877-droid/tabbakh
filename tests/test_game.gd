extends SceneTree
## Run: godot --headless --path . --script tests/test_game.gd
## Uses isolated save paths; never touches the player's default save.
const State := preload("res://game/island_state.gd")
const Data := preload("res://game/world_data.gd")
const Saves := preload("res://game/save_store.gd")

var failures := 0
var checks := 0
var path := "user://oasis-test-%d.json" % Time.get_ticks_usec()


func _initialize() -> void:
	call_deferred("_run")


func _check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		push_error("FAIL: " + message)


func _run() -> void:
	_test_inventory()
	_test_building()
	_test_farming()
	_test_restore()
	_test_disk()
	_cleanup()
	print("Pocket Oasis: %d checks, %d failures" % [checks, failures])
	quit(1 if failures > 0 else 0)


func _test_inventory() -> void:
	var state := State.new()
	_check(state.inventory.seed == 5, "starter seeds")
	_check(not state.craft_plank(), "no free crafting")
	_check(not state.gather("tree_999"), "reject unknown resource")
	_check(state.gather("tree_0"), "first gather")
	_check(state.gather("tree_0"), "second gather")
	_check(state.craft_plank(), "craft with two wood")
	_check(state.inventory.wood == 0 and state.inventory.plank == 1, "exact crafting cost")
	_check(state.gather("tree_0"), "third gather")
	_check(not state.gather("tree_0"), "resource exhaustion")
	state.inventory.wood = Data.STACK_LIMIT
	_check(not state.gather("tree_1"), "full bag blocks resource consumption")
	_check(not state.gathered.has("tree_1"), "full bag preserves resource")
	state.inventory.plank = Data.STACK_LIMIT
	_check(not state.craft_plank(), "full result stack blocks crafting")
	_check(state.inventory.wood == Data.STACK_LIMIT, "failed craft costs nothing")


func _test_building() -> void:
	var state := State.new()
	var cell := Vector2i(3, 1)
	_check(Data.is_buildable(cell), "test cell is valid")
	_check(not state.build("floor", cell, 0), "cannot build without materials")
	state.inventory.plank = 10
	state.inventory.stone = 10
	var before := state.inventory.duplicate()
	_check(not state.build("unknown", cell, 0), "unknown recipe rejected")
	_check(not state.build("floor", Data.PLOTS[0], 0), "farm plots reserved")
	_check(not state.build("floor", Vector2i.ZERO, 0), "spawn reserved")
	_check(not state.build("floor", Vector2i(99, 99), 0), "world boundary")
	_check(state.inventory == before, "failed builds do not charge")
	_check(state.build("floor", cell, 5), "valid build")
	_check(state.buildings[0].rotation == 1, "rotation normalized")
	_check(state.inventory.plank == 8 and state.inventory.stone == 9, "exact build charge")
	_check(not state.build("wall", cell, 0), "cannot overlap cells across building kinds")
	_check(state.inventory.plank == 8, "double submit does not charge")


func _test_farming() -> void:
	var state := State.new()
	var cell: Vector2i = Data.PLOTS[0]
	var key := Data.cell_key(cell)
	_check(not state.plant(Vector2i(0, 0)), "cannot plant outside plots")
	_check(state.plant(cell), "plant seed")
	_check(state.inventory.seed == 4, "seed charged once")
	_check(not state.plant(cell), "no double planting")
	state.tick(40)
	_check(state.crops[key].remaining == Data.GROW_SECONDS, "unwatered plants do not grow")
	_check(not state.harvest(cell), "cannot harvest unwatered crop")
	_check(state.water(cell), "water crop")
	_check(not state.water(cell), "water idempotency")
	state.tick(29)
	_check(not state.harvest(cell), "cannot harvest early")
	state.tick(-100)
	state.tick(NAN)
	_check(state.crops[key].remaining == 1, "invalid deltas ignored")
	state.tick(1)
	state.inventory.crop = Data.STACK_LIMIT
	_check(not state.harvest(cell), "full bag preserves ripe crop")
	_check(state.crops.has(key), "ripe crop retained")
	state.inventory.crop = 0
	_check(state.harvest(cell), "harvest ripe crop")
	_check(state.inventory.crop == 2 and state.inventory.seed == 6, "harvest returns seeds")
	_check(not state.harvest(cell), "no double harvest")


func _test_restore() -> void:
	var state := State.new()
	state.gather("rock_0")
	state.plant(Data.PLOTS[0])
	state.water(Data.PLOTS[0])
	state.tick(10)
	state.player_position = Vector2(2, -2)
	var saved: Variant = JSON.parse_string(JSON.stringify(state.snapshot()))
	var copy := State.new()
	_check(copy.restore(saved), "JSON numeric roundtrip")
	_check(copy.inventory.stone == 1, "inventory restored")
	_check(copy.crops[Data.cell_key(Data.PLOTS[0])].remaining == 20, "growth restored")
	_check(copy.player_position == Vector2(2, -2), "position restored")
	var snapshot := copy.snapshot()
	snapshot.inventory.wood = 99
	_check(copy.inventory.wood == 0, "snapshot is deep copied")
	var baseline := JSON.stringify(copy.snapshot())
	var invalid: Array = [null, [], {}, {"version": 999}]
	for value in invalid:
		_check(not copy.restore(value), "invalid root/version rejected")
	var bad: Dictionary = saved.duplicate(true)
	bad.inventory.seed = -1
	_check(not copy.restore(bad), "negative inventory rejected")
	bad = saved.duplicate(true)
	bad.inventory.wood = 0.5
	_check(not copy.restore(bad), "fractional inventory rejected")
	bad = saved.duplicate(true)
	bad.inventory.extra = 1
	_check(not copy.restore(bad), "unknown inventory item rejected")
	bad = saved.duplicate(true)
	bad.position = [17, 17]
	_check(not copy.restore(bad), "outside radius rejected")
	bad = saved.duplicate(true)
	bad.camera_yaw = INF
	_check(not copy.restore(bad), "non-finite yaw rejected")
	bad = saved.duplicate(true)
	bad.gathered["tree_99"] = 1
	_check(not copy.restore(bad), "unknown resource in save rejected")
	bad = saved.duplicate(true)
	bad.crops["99,99"] = {"watered": true, "remaining": 0}
	_check(not copy.restore(bad), "unknown crop plot rejected")
	bad = saved.duplicate(true)
	bad.buildings = [{"kind": "floor", "x": 3, "z": 1, "rotation": 0}]
	bad.buildings.append(bad.buildings[0].duplicate())
	_check(not copy.restore(bad), "overlapping saved buildings rejected")
	_check(JSON.stringify(copy.snapshot()) == baseline, "invalid loads leave live state untouched")
	_check(copy.restore(saved), "valid state still accepted after invalid input")
	saved.inventory.wood = 88
	_check(copy.inventory.wood == 0, "restore does not alias caller data")


func _test_disk() -> void:
	var state := State.new()
	_check(not Saves.load_into(state, path).exists, "new player has no save")
	_check(Saves.save(state, path) == OK, "initial atomic save")
	state.gather("tree_0")
	_check(Saves.save(state, path) == OK, "second save creates backup")
	var loaded := State.new()
	_check(Saves.load_into(loaded, path).ok, "primary loads")
	_check(loaded.inventory.wood == 1, "primary is newest")
	_write_raw(path, "{broken")
	var result := Saves.load_into(loaded, path)
	_check(result.ok and result.recovered, "corrupt primary recovers backup")
	_check(loaded.inventory.wood == 0, "backup is previous good version")
	_check(Saves.save(loaded, path) == OK, "can save recovered state")
	_check(FileAccess.file_exists(path + ".corrupt"), "corrupt evidence preserved")
	_check(Saves._read(path + ".bak") != null, "corrupt primary never poisons backup")
	_write_raw(path, "bad")
	_write_raw(path + ".bak", "bad")
	result = Saves.load_into(loaded, path)
	_check(result.exists and not result.ok, "both corrupt reported without reset")
	state.inventory.wood = -1
	_check(Saves.save(state, path) == ERR_INVALID_DATA, "invalid state never saved")
	var file := FileAccess.open(path, FileAccess.READ)
	_check(file.get_as_text() == "bad", "failed save does not overwrite disk")
	file.close()
	_check(not FileAccess.file_exists(path + ".tmp"), "no leftover temp from successful writes")


func _write_raw(file_path: String, text: String) -> void:
	var file := FileAccess.open(file_path, FileAccess.WRITE)
	file.store_string(text)
	file.close()


func _cleanup() -> void:
	for suffix in ["", ".bak", ".tmp", ".corrupt"]:
		if FileAccess.file_exists(path + suffix):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path + suffix))
