extends SceneTree
## Runtime smoke test for the real scene and UI; isolated from the user's save.
const Scene := preload("res://scenes/main.tscn")
const Game := preload("res://game/main.gd")
const Saves := preload("res://game/save_store.gd")

var failures := 0
var path := "user://oasis-scene-test-%d.json" % Time.get_ticks_usec()


func _initialize() -> void:
	call_deferred("_run")


func _check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)


func _run() -> void:
	var game: Game = Scene.instantiate()
	game.save_path = path
	root.add_child(game)
	await process_frame
	_check(game.resource_nodes.size() == 20, "all resource models instantiated")
	_check(game.hud.root != null, "HUD initialized")
	_check(game.hud.overlay.visible == false, "new game is not blocked")
	game.state.inventory.wood = 10
	game._on_action("craft_menu")
	_check(game.menu_open, "crafting opens modal")
	game._on_action("craft_plank")
	_check(game.state.inventory.wood == 8, "UI crafting charges wood")
	_check(game.state.inventory.plank == 1, "UI crafting creates plank")
	game._on_action("close_menu")
	_check(not game.menu_open, "closing resumes simulation")
	game._on_action("build_mode")
	_check(game.build_mode and game.ghost != null, "build preview instantiated")
	game._on_action("rotate_build")
	_check(game.build_rotation == 1, "rotation UI wired")
	game._on_action("cycle_build")
	_check(game.build_index == 1, "piece selection UI wired")
	game._on_action("build_mode")
	game._on_action("save")
	_check(Saves._read(path) != null, "UI saves valid state")
	game._on_action("reset_menu")
	_check(game.state.inventory.plank == 1, "reset requires confirmation")
	game._on_action("reset")
	_check(game.state.inventory.wood == 0, "confirmed reset creates clean world")
	_check(not game.menu_open and not game.build_mode, "reset clears interaction state")
	game.queue_free()
	await process_frame
	for suffix in ["", ".bak", ".tmp", ".corrupt"]:
		if FileAccess.file_exists(path + suffix):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path + suffix))
	print("Scene smoke test: %d failures" % failures)
	quit(1 if failures > 0 else 0)
