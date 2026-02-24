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

#[tauri::command]
pub async fn install_pack(
    _pack_id: String,
    _version: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    // Phase 3: Download and install pack from registry
    Err("Pack installation from remote registry not yet implemented. Copy pack directory to the packs/ folder.".into())
}
