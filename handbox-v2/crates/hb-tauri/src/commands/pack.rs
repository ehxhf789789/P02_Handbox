//! Pack management commands — list, install, and inspect packs.

use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_packs(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let packs_dir = state.data_dir.parent().unwrap_or(&state.data_dir).join("packs");

    // Also check the built-in packs directory
    let mut manifests = Vec::new();

    for dir in [packs_dir] {
        if !dir.exists() {
            continue;
        }
        let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let manifest_path = entry.path().join("manifest.json");
            if manifest_path.exists() {
                let content = std::fs::read_to_string(&manifest_path)
                    .map_err(|e| e.to_string())?;
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    manifests.push(val);
                }
            }
        }
    }

    Ok(manifests)
}

#[tauri::command]
pub async fn get_pack(
    pack_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let packs_dir = state.data_dir.parent().unwrap_or(&state.data_dir).join("packs");
    let manifest_path = packs_dir.join(&pack_id).join("manifest.json");

    if !manifest_path.exists() {
        return Err(format!("Pack not found: {pack_id}"));
    }

    let content = std::fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

/// Install a pack from a local directory path.
/// Copies the pack directory to the packs/ folder.
#[tauri::command]
pub async fn install_pack(
    source_path: String,
    _version: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let source = std::path::Path::new(&source_path);
    if !source.exists() {
        return Err(format!("Source path does not exist: {source_path}"));
    }

    // Validate that source has a manifest.json
    let manifest_path = source.join("manifest.json");
    if !manifest_path.exists() {
        return Err("Source directory does not contain a manifest.json".into());
    }

    // Read pack_id from manifest
    let manifest_content = std::fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
    let manifest: serde_json::Value =
        serde_json::from_str(&manifest_content).map_err(|e| format!("Invalid manifest: {e}"))?;
    let pack_id = manifest
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Manifest missing 'id' field")?;

    // Copy to packs directory
    let packs_dir = state.data_dir.parent().unwrap_or(&state.data_dir).join("packs");
    let target = packs_dir.join(pack_id);

    if target.exists() {
        std::fs::remove_dir_all(&target).map_err(|e| format!("Failed to remove existing pack: {e}"))?;
    }
    std::fs::create_dir_all(&target).map_err(|e| format!("Failed to create pack dir: {e}"))?;

    // Recursively copy files
    copy_dir_recursive(source, &target).map_err(|e| format!("Failed to copy pack: {e}"))?;

    tracing::info!("Installed pack '{pack_id}' from {source_path}");
    Ok(())
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}
