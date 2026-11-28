extends RefCounted
## Atomic replacement with a previous-good backup and validation on both paths.
const State := preload("res://game/island_state.gd")
const DEFAULT_PATH := "user://island-save.json"
const MAX_BYTES := 262144


static func _read(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		return null
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null or file.get_length() > MAX_BYTES:
		return null
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	file.close()
	var probe := State.new()
	return parsed if probe.restore(parsed) else null


static func load_into(state: State, path := DEFAULT_PATH) -> Dictionary:
	var primary: Variant = _read(path)
	if primary != null and state.restore(primary):
		return {"ok": true, "recovered": false, "exists": true}
	var backup: Variant = _read(path + ".bak")
	if backup != null and state.restore(backup):
		return {"ok": true, "recovered": true, "exists": true}
	return {
		"ok": false,
		"recovered": false,
		"exists": FileAccess.file_exists(path) or FileAccess.file_exists(path + ".bak")
	}


static func save(state: State, path := DEFAULT_PATH) -> Error:
	var snapshot: Dictionary = state.snapshot()
	var probe := State.new()
	if not probe.restore(snapshot):
		return ERR_INVALID_DATA
	var file := FileAccess.open(path + ".tmp", FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_string(JSON.stringify(snapshot))
	file.flush()
	var write_error := file.get_error()
	file.close()
	if write_error != OK:
		return write_error
	if _read(path + ".tmp") == null:
		return ERR_FILE_CORRUPT
	var absolute := ProjectSettings.globalize_path(path)
	# A corrupt primary must never replace a previously valid backup.
	if _read(path) != null:
		if FileAccess.file_exists(path + ".bak"):
			var remove_error := DirAccess.remove_absolute(absolute + ".bak")
			if remove_error != OK:
				return remove_error
		var backup_error := DirAccess.rename_absolute(absolute, absolute + ".bak")
		if backup_error != OK:
			return backup_error
	elif FileAccess.file_exists(path):
		# Preserve corrupt evidence for recovery instead of silently deleting it.
		if FileAccess.file_exists(path + ".corrupt"):
			var remove_error := DirAccess.remove_absolute(absolute + ".corrupt")
			if remove_error != OK:
				return remove_error
		var quarantine_error := DirAccess.rename_absolute(absolute, absolute + ".corrupt")
		if quarantine_error != OK:
			return quarantine_error
	return DirAccess.rename_absolute(absolute + ".tmp", absolute)
