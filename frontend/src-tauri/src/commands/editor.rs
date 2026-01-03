use kiva_cut::{Editor, ExportType};
use tauri::AppHandle;

use crate::service::{
    material::{get_protocol_content, save_protocol_content},
    paths::get_project_dir,
};

#[tauri::command]
pub async fn get_protocol(app: AppHandle, project_id: &str) -> Result<String, String> {
    let project_dir = get_project_dir(&app, project_id)?;
    let project_dir_str = project_dir
        .to_str()
        .ok_or_else(|| "Invalid path encoding".to_string())?;
    let content = get_protocol_content(project_dir_str).map_err(|e| e.to_string())?;
    Ok(content)
}

#[tauri::command]
pub async fn save_protocol(
    app: AppHandle,
    project_id: &str,
    proto_content: &str,
) -> Result<(), String> {
    let project_dir = get_project_dir(&app, project_id)?;
    let project_dir_str = project_dir
        .to_str()
        .ok_or_else(|| "Invalid path encoding".to_string())?;
    save_protocol_content(project_dir_str, proto_content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn export_video(
    app: AppHandle,
    project_id: &str,
    output_path: Option<String>,
    export_type: Option<String>,
) -> Result<String, String> {
    // Get project directory
    let project_dir = get_project_dir(&app, project_id)?;
    let project_dir_str = project_dir
        .to_str()
        .ok_or_else(|| "Invalid path encoding".to_string())?;

    // Load protocol
    let protocol_content = get_protocol_content(project_dir_str).map_err(|e| e.to_string())?;

    // Create editor and load protocol
    let mut editor = Editor::default();
    editor
        .load_from_json(&protocol_content)
        .map_err(|e| e.to_string())?;

    // Determine export type
    let exp_type = match export_type.as_deref() {
        Some("audio") => ExportType::Audio,
        _ => ExportType::Video,
    };

    // Determine output path
    let output_file = if let Some(path) = output_path {
        path
    } else {
        // Default output in project directory
        let extension = match exp_type {
            ExportType::Video => "mp4",
            ExportType::Audio => "mp3",
        };
        let output_path = project_dir.join(format!("export.{}", extension));
        output_path
            .to_str()
            .ok_or_else(|| "Invalid output path".to_string())?
            .to_string()
    };

    // Export
    editor
        .simple_export(&output_file, exp_type)
        .await
        .map_err(|e| e.to_string())?;

    Ok(output_file)
}
