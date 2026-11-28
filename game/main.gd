extends Node3D
## Original offline vertical slice. No accounts, telemetry, network, or paid assets.
const Data := preload("res://game/world_data.gd")
const State := preload("res://game/island_state.gd")
const Saves := preload("res://game/save_store.gd")
const Art := preload("res://game/world_art.gd")
const HUD := preload("res://game/hud.gd")

var state := State.new()
var save_path := Saves.DEFAULT_PATH
var hud: HUD
var player: CharacterBody3D
var avatar: Node3D
var camera: Camera3D
var resources_root: Node3D
var buildings_root: Node3D
var crops_root: Node3D
var resource_nodes: Dictionary = {}
var ghost: Node3D
var build_mode := false
var build_index := 0
var build_rotation := 0
var build_cell := Vector2i.ZERO
var build_valid := false
var last_ghost_key := ""
var nearest_id := ""
var nearest_plot := Vector2i(100, 100)
var menu_open := false
var save_blocked := false
var suspended := false
var camera_finger := -1
var mouse_camera := false
var autosave_timer := 0.0
var hud_timer := 0.0
var crop_timer := 0.0
var facing := Vector3(0, 0, -1)
var action_cooldown := 0.0


func _ready() -> void:
	_setup_inputs()
	Art.environment(self)
	_make_ground()
	_make_player()
	camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 18.0
	camera.far = 180
	camera.current = true
	add_child(camera)
	resources_root = Node3D.new()
	buildings_root = Node3D.new()
	crops_root = Node3D.new()
	add_child(resources_root)
	add_child(buildings_root)
	add_child(crops_root)
	var result := Saves.load_into(state, save_path)
	save_blocked = result.exists and not result.ok
	player.position = Vector3(state.player_position.x, 0.05, state.player_position.y)
	_rebuild_resources()
	_rebuild_buildings()
	_rebuild_crops()
	hud = HUD.new()
	add_child(hud)
	hud.requested.connect(_on_action)
	hud.menu_changed.connect(_on_menu_changed)
	_update_camera(1.0)
	_refresh_hud()
	if save_blocked:
		hud.show_menu("menu")
		hud.toast("تعذر قراءة الحفظ. لم نستبدله؛ اختر عالمًا جديدًا للبدء.")
	elif result.recovered:
		hud.toast("تم استرجاع النسخة الاحتياطية من تقدمك")
	else:
		hud.toast("أهلًا بواحتك! اقترب من شجرة لجمع الخشب")
	get_tree().auto_accept_quit = false


func _setup_inputs() -> void:
	var mapping := {
		"move_left": [KEY_A, KEY_LEFT],
		"move_right": [KEY_D, KEY_RIGHT],
		"move_up": [KEY_W, KEY_UP],
		"move_down": [KEY_S, KEY_DOWN],
		"orbit_left": [KEY_Q],
		"orbit_right": [KEY_R]
	}
	for action in mapping:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		for code in mapping[action]:
			var event := InputEventKey.new()
			event.physical_keycode = code
			InputMap.action_add_event(action, event)


func _make_ground() -> void:
	var body := StaticBody3D.new()
	var collider := CollisionShape3D.new()
	var shape := CylinderShape3D.new()
	shape.radius = 19
	shape.height = 0.5
	collider.shape = shape
	collider.position.y = -0.25
	body.add_child(collider)
	add_child(body)


func _make_player() -> void:
	player = CharacterBody3D.new()
	player.floor_snap_length = 0.4
	var collider := CollisionShape3D.new()
	var shape := CapsuleShape3D.new()
	shape.radius = 0.27
	shape.height = 1.45
	collider.shape = shape
	collider.position.y = 0.73
	player.add_child(collider)
	add_child(player)
	avatar = Art.player(player)


func _blocker(parent: Node3D, size: Vector3, at: Vector3) -> void:
	var body := StaticBody3D.new()
	var collider := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collider.shape = shape
	collider.position = at
	body.add_child(collider)
	parent.add_child(body)


func _clear_children(node: Node) -> void:
	for child in node.get_children():
		node.remove_child(child)
		child.queue_free()


func _rebuild_resources() -> void:
	_clear_children(resources_root)
	resource_nodes.clear()
	for id in Data.resource_ids():
		if state.gathered.get(id, 0) >= 3:
			continue
		var index := int(id.split("_")[1])
		var point := Data.resource_position(id)
		var node: Node3D
		if id.begins_with("tree"):
			node = Art.tree(resources_root, point, index)
			_blocker(node, Vector3(0.6, 2.5, 0.6), Vector3(0, 1.25, 0))
		else:
			node = Art.rock(resources_root, point, index)
			_blocker(node, Vector3(1.2, 0.8, 1.2), Vector3(0, 0.4, 0))
		resource_nodes[id] = node


func _rebuild_buildings() -> void:
	_clear_children(buildings_root)
	for building in state.buildings:
		var node := Art.building(
			buildings_root,
			building.kind,
			Vector2i(int(building.x), int(building.z)),
			int(building.rotation)
		)
		if building.kind != "floor":
			var h := 1.9 if building.kind == "wall" else 1.0
			_blocker(node, Vector3(1.85, h, 0.25), Vector3(0, h / 2, 0))


func _rebuild_crops() -> void:
	_clear_children(crops_root)
	for cell in Data.PLOTS:
		var key := Data.cell_key(cell)
		if state.crops.has(key):
			var growth := 1.0 - float(state.crops[key].remaining) / Data.GROW_SECONDS
			Art.crop(crops_root, cell, growth)


func _physics_process(delta: float) -> void:
	if not is_instance_valid(hud):
		return
	if menu_open or suspended or save_blocked:
		player.velocity = Vector3.ZERO
		return
	state.tick(delta)
	action_cooldown = maxf(0, action_cooldown - delta)
	var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	if hud.stick.value.length() > 0.1:
		input = hud.stick.value
	var motion := Vector3(input.x, 0, input.y).rotated(Vector3.UP, state.camera_yaw)
	player.velocity.x = motion.x * 4.2
	player.velocity.z = motion.z * 4.2
	if not player.is_on_floor():
		player.velocity.y -= 18.0 * delta
	else:
		player.velocity.y = -0.5
	player.move_and_slide()
	var flat := Vector2(player.position.x, player.position.z)
	if flat.length() > Data.WORLD_RADIUS:
		flat = flat.limit_length(Data.WORLD_RADIUS)
		player.position.x = flat.x
		player.position.z = flat.y
	if motion.length() > 0.05:
		facing = motion.normalized()
		avatar.rotation.y = lerp_angle(avatar.rotation.y, atan2(-facing.x, -facing.z), delta * 12)
		avatar.position.y = sin(state.play_seconds * 13) * 0.035
	else:
		avatar.position.y = 0
	state.player_position = flat
	state.camera_yaw = wrapf(
		state.camera_yaw + Input.get_axis("orbit_left", "orbit_right") * delta, -PI, PI
	)
	_update_camera(delta)
	_find_target()
	_update_ghost()
	autosave_timer += delta
	hud_timer += delta
	crop_timer += delta
	if autosave_timer >= 20:
		autosave_timer = 0
		_save(false)
	if hud_timer >= 0.15:
		hud_timer = 0
		_refresh_hud()
	if crop_timer >= 1:
		crop_timer = 0
		_rebuild_crops()


func _update_camera(delta: float) -> void:
	var focus := player.position + Vector3(0, 0.8, 0)
	var offset := Vector3(0, 15, 17).rotated(Vector3.UP, state.camera_yaw)
	camera.position = camera.position.lerp(focus + offset, minf(1, delta * 8))
	camera.look_at(focus)


func _find_target() -> void:
	nearest_id = ""
	nearest_plot = Vector2i(100, 100)
	var best := 2.65
	var p := Vector2(player.position.x, player.position.z)
	for id in resource_nodes:
		var distance := p.distance_to(Data.resource_position(id))
		if distance < best:
			best = distance
			nearest_id = id
	for cell in Data.PLOTS:
		var point := Vector2(cell.x * Data.GRID, cell.y * Data.GRID)
		var distance := p.distance_to(point)
		if distance < best:
			best = distance
			nearest_id = ""
			nearest_plot = cell


func _update_ghost() -> void:
	if not build_mode:
		if is_instance_valid(ghost):
			ghost.queue_free()
			ghost = null
		last_ghost_key = ""
		return
	var point := player.position + facing * 3.0
	build_cell = Vector2i(roundi(point.x / Data.GRID), roundi(point.z / Data.GRID))
	var kind: String = Data.COSTS.keys()[build_index]
	build_valid = state.can_build(kind, build_cell)
	# Placement must stay outside the player's capsule even for a rotated wall.
	var snapped := Vector2(build_cell.x * Data.GRID, build_cell.y * Data.GRID)
	if snapped.distance_to(state.player_position) < 1.6:
		build_valid = false
	var key := "%s:%s:%d:%s" % [kind, build_cell, build_rotation, build_valid]
	if key != last_ghost_key:
		if is_instance_valid(ghost):
			ghost.queue_free()
		ghost = Art.building(self, kind, build_cell, build_rotation, true, build_valid)
		last_ghost_key = key


func _refresh_hud() -> void:
	hud.refresh(state.inventory, state.buildings.size(), state.inventory.crop > 0)
	hud.build_panel.visible = build_mode and not menu_open
	if build_mode:
		var kind: String = Data.COSTS.keys()[build_index]
		var parts: PackedStringArray = []
		for item in Data.COSTS[kind]:
			parts.append("%s %d" % [Data.LABELS[item], Data.COSTS[kind][item]])
		hud.build_label.text = (
			"%s • %s\n%s"
			% [
				Data.BUILD_NAMES[kind],
				" + ".join(parts),
				"المكان متاح" if build_valid else "موارد ناقصة أو المكان محجوز"
			]
		)
		hud.target_label.text = "تحرك لتغيير المكان • الأخضر متاح"
		hud.action_button.text = "ضع القطعة [E]"
	elif not nearest_id.is_empty():
		var item := "wood" if nearest_id.begins_with("tree") else "stone"
		hud.target_label.text = (
			"اجمع %s • المتبقي %d" % [Data.LABELS[item], 3 - state.gathered.get(nearest_id, 0)]
		)
		hud.action_button.text = "جمع [E]"
	elif nearest_plot in Data.PLOTS:
		var crop: Dictionary = state.crops.get(Data.cell_key(nearest_plot), {})
		if crop.is_empty():
			hud.target_label.text = "حوض فارغ • يحتاج بذرة واحدة"
			hud.action_button.text = "ازرع [E]"
		elif not crop.watered:
			hud.target_label.text = "النبتة عطشانة • اروِها لتبدأ النمو"
			hud.action_button.text = "اسقِ [E]"
		elif crop.remaining > 0:
			hud.target_label.text = "تنمو بهدوء • %d ثانية" % ceili(crop.remaining)
			hud.action_button.text = "تنمو…"
		else:
			hud.target_label.text = "جاهز! محصولان وبذرتان عند الحصاد"
			hud.action_button.text = "احصد [E]"
	else:
		hud.target_label.text = "اقترب من شجرة أو صخرة أو حوض زرع"
		hud.action_button.text = "تفاعل [E]"


func _interact() -> void:
	if action_cooldown > 0:
		return
	action_cooldown = 0.25
	_find_target()
	if build_mode:
		_update_ghost()
		var kind: String = Data.COSTS.keys()[build_index]
		if build_valid and state.build(kind, build_cell, build_rotation):
			_rebuild_buildings()
			hud.toast("قطعة جديدة في واحتك!")
			_save(false)
		else:
			hud.toast("لا يمكن البناء هنا أو الموارد غير كافية")
	elif not nearest_id.is_empty():
		if state.gather(nearest_id):
			hud.toast("جمعت خشبة" if nearest_id.begins_with("tree") else "جمعت حجرًا")
			_rebuild_resources()
		else:
			hud.toast("الحقيبة ممتلئة أو المورد نفد")
	elif nearest_plot in Data.PLOTS:
		var key := Data.cell_key(nearest_plot)
		if not state.crops.has(key):
			hud.toast(
				"بذرة جديدة! اسقِها الآن" if state.plant(nearest_plot) else "لا توجد بذور كافية"
			)
		elif not state.crops[key].watered:
			state.water(nearest_plot)
			hud.toast("تم الري • الحصاد بعد 30 ثانية من اللعب")
		elif state.harvest(nearest_plot):
			hud.toast("حصاد جميل! +2 محصول و+2 بذور")
		else:
			hud.toast("انتظر النمو أو أفرغ مساحة بالحقيبة")
		_rebuild_crops()
		_save(false)
	else:
		hud.toast("اقترب أكثر من مورد أو حوض زراعة")
	_refresh_hud()


func _on_action(action: String) -> void:
	match action:
		"close_menu":
			hud.close_menu()
		"menu":
			hud.show_menu("menu")
		"reset_menu":
			hud.show_menu("reset")
		"reset":
			state = State.new()
			save_blocked = false
			build_mode = false
			player.position = Vector3(0, 0.05, 0)
			player.velocity = Vector3.ZERO
			facing = Vector3(0, 0, -1)
			_rebuild_resources()
			_rebuild_buildings()
			_rebuild_crops()
			hud.close_menu()
			_update_ghost()
			_save(true)
		"save":
			_save(true)
		"craft_menu":
			if not save_blocked:
				hud.show_menu("craft")
		"inventory":
			hud.show_menu("inventory")
		"craft_plank":
			if not save_blocked:
				if state.craft_plank():
					hud.toast("صنعت لوحًا • جاهز للبناء")
					_save(false)
				else:
					hud.toast("تحتاج خشبتين ومساحة للألواح")
		"build_mode":
			if not menu_open and not save_blocked:
				build_mode = not build_mode
				_update_ghost()
		"cycle_build":
			build_index = (build_index + 1) % Data.COSTS.size()
			_update_ghost()
		"rotate_build":
			build_rotation = (build_rotation + 1) % 4
			_update_ghost()
		"interact":
			if not menu_open and not save_blocked:
				_interact()
	_refresh_hud()


func _on_menu_changed(open: bool) -> void:
	menu_open = open
	camera_finger = -1
	mouse_camera = false
	_refresh_hud()


func _save(manual: bool) -> void:
	if save_blocked:
		if manual:
			hud.toast("الحفظ غير صالح؛ اختر عالمًا جديدًا بعد التأكيد")
		return
	state.player_position = Vector2(player.position.x, player.position.z)
	var error := Saves.save(state, save_path)
	if error == OK:
		hud.save_label.text = "تم الحفظ • فردي دون إنترنت"
		if manual:
			hud.toast("تم حفظ واحتك على هذا الجهاز")
	else:
		hud.save_label.text = "تعذر الحفظ • أعد المحاولة"
		hud.toast("فشل الحفظ؛ تحقق من مساحة التخزين")


func _input(event: InputEvent) -> void:
	# Release is handled even if the pointer finishes over a UI control.
	if event is InputEventScreenTouch and event.index == camera_finger and not event.pressed:
		camera_finger = -1
	if event is InputEventScreenDrag and event.index == camera_finger:
		if not menu_open:
			state.camera_yaw = wrapf(state.camera_yaw - event.relative.x * 0.006, -PI, PI)
	if (
		event is InputEventMouseButton
		and event.button_index == MOUSE_BUTTON_RIGHT
		and not event.pressed
	):
		mouse_camera = false
	if event is InputEventMouseMotion and mouse_camera and not menu_open:
		state.camera_yaw = wrapf(state.camera_yaw - event.relative.x * 0.006, -PI, PI)


func _unhandled_input(event: InputEvent) -> void:
	if menu_open:
		return
	if event is InputEventScreenTouch and event.pressed and camera_finger == -1:
		camera_finger = event.index
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT:
		mouse_camera = event.pressed


func _unhandled_key_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo:
		return
	if event.physical_keycode == KEY_ESCAPE:
		if menu_open:
			hud.close_menu()
		elif build_mode:
			_on_action("build_mode")
		else:
			hud.show_menu("menu")
		get_viewport().set_input_as_handled()
		return
	if menu_open:
		return
	var actions := {
		KEY_E: "interact",
		KEY_B: "build_mode",
		KEY_C: "craft_menu",
		KEY_I: "inventory",
		KEY_T: "rotate_build",
		KEY_TAB: "cycle_build"
	}
	if actions.has(event.physical_keycode):
		_on_action(actions[event.physical_keycode])
		get_viewport().set_input_as_handled()


func _notification(what: int) -> void:
	if not is_instance_valid(hud):
		return
	if what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		suspended = true
		hud.stick.reset()
		camera_finger = -1
		mouse_camera = false
		_save(false)
	elif what == NOTIFICATION_APPLICATION_RESUMED or what == NOTIFICATION_APPLICATION_FOCUS_IN:
		suspended = false
	elif what == NOTIFICATION_WM_GO_BACK_REQUEST:
		if menu_open:
			hud.close_menu()
		else:
			hud.show_menu("menu")
	elif what == NOTIFICATION_WM_CLOSE_REQUEST:
		_save(false)
		get_tree().quit()
