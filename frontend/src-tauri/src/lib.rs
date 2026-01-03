mod commands;
mod models;
mod service;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::project::create_project,
            commands::project::open_project_dir,
            commands::project::delete_project,
            commands::project::list_projects_history,
            commands::project::get_project_by_id,
            commands::project::get_default_projects_dir,
            commands::material::import_material,
            commands::material::list_materials,
            commands::material::delete_material,
            commands::editor::get_protocol,
            commands::editor::save_protocol,
            commands::editor::export_video,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
