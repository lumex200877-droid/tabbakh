extends CanvasLayer
signal requested(action: String)
signal menu_changed(open: bool)

const Data := preload("res://game/world_data.gd")
const Stick := preload("res://game/virtual_stick.gd")

var stick: Stick
var root: Control
var resource_labels: Dictionary = {}
var task_label: Label
var target_label: Label
var toast_label: Label
var save_label: Label
var action_button: Button
var build_panel: PanelContainer
var build_label: Label
var overlay: ColorRect
var menu_content: VBoxContainer
var menu_title: Label
var inventory_label: Label
var menu_kind := ""
var toast_time := 0.0
var current_inventory: Dictionary = {}


func _ready() -> void:
	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var theme := Theme.new()
	theme.default_font = load("res://assets/fonts/NotoSansArabic.ttf")
	theme.default_font_size = 19
	root.theme = theme
	add_child(root)
	_build_hud()


func _style(color: Color, radius := 20, border := false) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(radius)
	style.content_margin_left = 20
	style.content_margin_right = 20
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	if border:
		style.set_border_width_all(2)
		style.border_color = Data.PALETTE.gold
	return style


func _panel(parent: Node, rect: Rect2, color: Color) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.position = rect.position
	panel.size = rect.size
	panel.add_theme_stylebox_override("panel", _style(color))
	parent.add_child(panel)
	return panel


func _label(parent: Node, text: String, font_size := 20, color := Color("203f39")) -> Label:
	var label := Label.new()
	label.text = text
	label.text_direction = Control.TEXT_DIRECTION_AUTO
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	parent.add_child(label)
	return label


func _button(parent: Node, text: String, action: String, primary := false) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(100, 64)
	button.mouse_filter = Control.MOUSE_FILTER_STOP
	var color: Color = Data.PALETTE.green if primary else Data.PALETTE.cream
	var ink: Color = Data.PALETTE.cream if primary else Data.PALETTE.ink
	button.add_theme_stylebox_override("normal", _style(color, 16))
	button.add_theme_stylebox_override("hover", _style(color.lightened(0.08), 16))
	button.add_theme_stylebox_override("pressed", _style(color.darkened(0.12), 16))
	var focus := _style(Color(0, 0, 0, 0), 16, true)
	focus.border_color = Data.PALETTE.gold if primary else Data.PALETTE.green
	button.add_theme_stylebox_override("focus", focus)
	button.add_theme_color_override("font_color", ink)
	button.add_theme_color_override("font_hover_color", ink)
	button.add_theme_color_override("font_pressed_color", ink)
	button.pressed.connect(func() -> void: requested.emit(action))
	parent.add_child(button)
	return button


func _build_hud() -> void:
	var brand := _panel(root, Rect2(24, 22, 278, 108), Data.PALETTE.cream)
	var brand_column := VBoxContainer.new()
	brand.add_child(brand_column)
	_label(brand_column, "واحة صغيرة", 30)
	_label(brand_column, "POCKET OASIS  /  نموذج 01", 13, Data.PALETTE.muted)
	var resources := _panel(root, Rect2(322, 22, 630, 76), Data.PALETTE.cream)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 22)
	resources.add_child(row)
	for item in Data.ITEMS:
		resource_labels[item] = _label(row, "%s  0" % Data.LABELS[item], 18)
	var menu_button := _button(root, "القائمة  ≡", "menu")
	menu_button.set_anchors_and_offsets_preset(
		Control.PRESET_TOP_RIGHT, Control.PRESET_MODE_KEEP_SIZE
	)
	menu_button.position = Vector2(-200, 22)
	menu_button.size = Vector2(176, 76)
	var tasks := _panel(root, Rect2(0, 0, 286, 154), Data.PALETTE.green)
	tasks.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT, Control.PRESET_MODE_KEEP_SIZE)
	tasks.position = Vector2(-310, 120)
	var tasks_column := VBoxContainer.new()
	tasks.add_child(tasks_column)
	_label(tasks_column, "خطوتك الأولى", 23, Data.PALETTE.cream)
	task_label = _label(tasks_column, "", 17, Data.PALETTE.cream)
	stick = Stick.new()
	root.add_child(stick)
	stick.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT, Control.PRESET_MODE_KEEP_SIZE)
	stick.position = Vector2(26, -232)
	stick.size = Vector2(210, 210)
	var movement_hint := _label(root, "اسحب للحركة", 16, Data.PALETTE.ink)
	movement_hint.set_anchors_and_offsets_preset(
		Control.PRESET_BOTTOM_LEFT, Control.PRESET_MODE_KEEP_SIZE
	)
	movement_hint.position = Vector2(75, -40)
	var actions := VBoxContainer.new()
	root.add_child(actions)
	actions.set_anchors_and_offsets_preset(
		Control.PRESET_BOTTOM_RIGHT, Control.PRESET_MODE_KEEP_SIZE
	)
	actions.position = Vector2(-310, -258)
	actions.add_theme_constant_override("separation", 10)
	action_button = _button(actions, "تفاعل  [E]", "interact", true)
	var tool_row := HBoxContainer.new()
	actions.add_child(tool_row)
	_button(tool_row, "بناء [B]", "build_mode")
	_button(tool_row, "صنع [C]", "craft_menu")
	var tool_row_two := HBoxContainer.new()
	actions.add_child(tool_row_two)
	_button(tool_row_two, "حقيبة [I]", "inventory")
	_button(tool_row_two, "حفظ", "save")
	var target_panel := _panel(root, Rect2(0, 0, 440, 66), Data.PALETTE.cream)
	target_panel.set_anchors_and_offsets_preset(
		Control.PRESET_CENTER_BOTTOM, Control.PRESET_MODE_KEEP_SIZE
	)
	target_panel.position = Vector2(-220, -94)
	target_label = _label(target_panel, "", 19)
	target_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	save_label = _label(root, "فردي • دون إنترنت", 14, Data.PALETTE.ink)
	save_label.set_anchors_and_offsets_preset(
		Control.PRESET_CENTER_BOTTOM, Control.PRESET_MODE_KEEP_SIZE
	)
	save_label.position = Vector2(-150, -25)
	build_panel = _panel(root, Rect2(0, 0, 410, 184), Data.PALETTE.cream)
	build_panel.set_anchors_and_offsets_preset(
		Control.PRESET_CENTER_BOTTOM, Control.PRESET_MODE_KEEP_SIZE
	)
	build_panel.position = Vector2(-205, -296)
	var build_column := VBoxContainer.new()
	build_panel.add_child(build_column)
	build_label = _label(build_column, "", 18)
	var build_row := HBoxContainer.new()
	build_column.add_child(build_row)
	_button(build_row, "القطعة [Tab]", "cycle_build")
	_button(build_row, "لف [T]", "rotate_build")
	_button(build_row, "إلغاء", "build_mode")
	build_panel.hide()
	toast_label = _label(root, "", 20, Data.PALETTE.cream)
	toast_label.set_anchors_and_offsets_preset(
		Control.PRESET_CENTER_TOP, Control.PRESET_MODE_KEEP_SIZE
	)
	toast_label.position = Vector2(-300, 118)
	toast_label.size.x = 600
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.add_theme_stylebox_override("normal", _style(Data.PALETTE.green))
	toast_label.hide()
	_build_overlay()


func _build_overlay() -> void:
	overlay = ColorRect.new()
	overlay.color = Color(0.06, 0.15, 0.13, 0.7)
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(overlay)
	var panel := _panel(overlay, Rect2(0, 0, 710, 620), Data.PALETTE.cream)
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER, Control.PRESET_MODE_KEEP_SIZE)
	panel.position = Vector2(-355, -310)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	panel.add_child(column)
	menu_title = _label(column, "", 29)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)
	menu_content = VBoxContainer.new()
	menu_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	menu_content.add_theme_constant_override("separation", 12)
	scroll.add_child(menu_content)
	_button(column, "رجوع للواحة", "close_menu", true)
	overlay.hide()


func show_menu(kind: String) -> void:
	menu_kind = kind
	for child in menu_content.get_children():
		menu_content.remove_child(child)
		child.queue_free()
	inventory_label = null
	menu_title.text = (
		{
			"menu": "لحظة هدوء",
			"inventory": "حقيبتك",
			"craft": "طاولة التصنيع",
			"reset": "نبدأ من جديد؟"
		}
		. get(kind, "واحة صغيرة")
	)
	if kind in ["inventory", "craft"]:
		inventory_label = _label(menu_content, "", 22)
		_refresh_inventory_text()
	if kind == "craft":
		_label(menu_content, "لوح واحد = قطعتان من الخشب", 21)
		_button(menu_content, "اصنع لوحًا خشبيًا", "craft_plank", true)
		_label(menu_content, "أرضية: لوحان + حجر\nحائط: لوحان + حجران\nسياج: لوح + خشبة", 20)
	elif kind == "inventory":
		_label(
			menu_content,
			"ابدأ بخمس بذور. الحصاد يعيد بذورًا جديدة.\nالموارد محدودة؛ كل شجرة أو صخرة تعطي 3 وحدات.",
			18
		)
	elif kind == "reset":
		_label(menu_content, "سيُستبدل تقدمك الحالي بعالم جديد.\nلا يوجد تراجع من داخل اللعبة.", 21)
		_button(menu_content, "تأكيد بدء عالم جديد", "reset", true)
	else:
		var help := _label(
			menu_content,
			(
				"استكشف • اجمع • اصنع • ابنِ • ازرع\n\n"
				+ "اقترب من شجرة أو صخرة واضغط تفاعل.\n"
				+ "الزراعة في الأحواض الأربعة: بذر ثم ري ثم حصاد.\n"
				+ "ينمو الزرع خلال 30 ثانية من اللعب بعد الري.\n\n"
				+ "الكمبيوتر: WASD أو الأسهم للحركة.\n"
				+ "Q / R لتدوير الكاميرا، E للتفاعل.\n"
				+ "الموبايل: العصا للحركة؛ اسحب في المساحة الفارغة للكاميرا.\n\n"
				+ "الحفظ تلقائي كل 20 ثانية وعند إخفاء التطبيق.\n"
				+ "القائمة توقف الحركة والنمو. لا اتصال أو مشتريات."
			),
			18
		)
		help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_button(menu_content, "احفظ التقدم الآن", "save")
		_button(menu_content, "عالم جديد…", "reset_menu")
	overlay.show()
	stick.reset()
	menu_changed.emit(true)


func close_menu() -> void:
	overlay.hide()
	menu_kind = ""
	menu_changed.emit(false)


func _refresh_inventory_text() -> void:
	if not is_instance_valid(inventory_label):
		return
	var parts: PackedStringArray = []
	for item in Data.ITEMS:
		parts.append("%s: %d" % [Data.LABELS[item], current_inventory.get(item, 0)])
	inventory_label.text = "\n".join(parts)


func refresh(inventory: Dictionary, buildings: int, harvested: bool) -> void:
	current_inventory = inventory
	for item in Data.ITEMS:
		resource_labels[item].text = "%s  %d" % [Data.LABELS[item], inventory[item]]
	task_label.text = (
		"%s اجمع واصنع ألواحًا\n%s ابنِ أول قطعة\n%s ازرع واحصد"
		% [
			"✓" if inventory.plank > 0 or buildings > 0 else "○",
			"✓" if buildings > 0 else "○",
			"✓" if harvested else "○"
		]
	)
	_refresh_inventory_text()


func toast(message: String) -> void:
	toast_label.text = message
	toast_label.show()
	toast_time = 4.0


func _process(delta: float) -> void:
	if toast_time > 0:
		toast_time -= delta
		if toast_time <= 0:
			toast_label.hide()
