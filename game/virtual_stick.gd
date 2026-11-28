extends Control
## Independent touch ID lets movement and interaction work simultaneously.
const RADIUS := 68.0

var value := Vector2.ZERO
var finger := -1
var mouse_down := false


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(210, 210)


func reset() -> void:
	finger = -1
	mouse_down = false
	value = Vector2.ZERO
	queue_redraw()


func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch and event.pressed and finger == -1:
		finger = event.index
		_update_value(event.position)
		accept_event()
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		mouse_down = event.pressed
		if mouse_down:
			_update_value(event.position)
		else:
			reset()
		accept_event()


func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch and event.index == finger and not event.pressed:
		reset()
	elif event is InputEventScreenDrag and event.index == finger:
		_update_value(get_global_transform_with_canvas().affine_inverse() * event.position)
	elif event is InputEventMouseMotion and mouse_down:
		_update_value(get_global_transform_with_canvas().affine_inverse() * event.position)
	elif event is InputEventMouseButton and not event.pressed and mouse_down:
		reset()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		reset()


func _update_value(point: Vector2) -> void:
	value = ((point - size * 0.5) / RADIUS).limit_length()
	if value.length() < 0.12:
		value = Vector2.ZERO
	queue_redraw()


func _draw() -> void:
	var center := size * 0.5
	draw_circle(center, 85, Color(0.12, 0.25, 0.22, 0.12))
	draw_arc(center, 85, 0, TAU, 60, Color(1, 0.98, 0.92, 0.7), 3, true)
	draw_circle(center, 56, Color(1, 0.98, 0.92, 0.26))
	draw_circle(center + value * RADIUS, 32, Color("fff9e9"))
	draw_circle(center + value * RADIUS, 23, Color("dcebcf"))
