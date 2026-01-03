use anyhow::{Result, bail};
use kiva_cut::Editor;
use std::fs;
use std::path::{Path, PathBuf};

use crate::models::Resource;

/// get protocol.json filepath in project
pub fn get_protocol_file(project_path: &str) -> Result<PathBuf> {
    let protocol_path = PathBuf::from(project_path).join("protocol.json");
    if !protocol_path.exists() {
        bail!("合成协议不存在: {}", protocol_path.display());
    }
    Ok(protocol_path)
}

/// get protocol.json content in project
pub fn get_protocol_content(project_path: &str) -> Result<String> {
    let protocol_file = get_protocol_file(project_path)?;
    let mut editor = Editor::new();
    editor.load_from_file(&protocol_file)?;
    let json_content = editor.save_to_json()?;
    Ok(json_content)
}

/// get protocol.json content in project
pub fn save_protocol_content(project_path: &str, proto_content: &str) -> Result<()> {
    let protocol_file = get_protocol_file(project_path)?;
    let mut editor = Editor::new();
    editor.load_from_file(&protocol_file)?;
    editor.load_from_json(proto_content)?;
    let json_content = editor.save_to_json()?;
    fs::write(&protocol_file, json_content)?;
    Ok(())
}

/// --

/// Import a material file to project
/// The file is copied to the materials directory and named by material ID
pub async fn import_material_from_source(
    project_path: &str,
    source_path: &str,
) -> Result<Resource> {
    let protocol_file = get_protocol_file(project_path)?;
    let mut editor = Editor::new();
    editor.load_from_file(&protocol_file)?;

    let source_file = PathBuf::from(source_path);

    // Validate that the source file exists
    if !source_file.exists() {
        bail!("源文件不存在: {}", source_path);
    }

    // Get the original file name
    let original_name = source_file
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Get file extension
    let extension = source_file
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    // Use the source path temporarily to get material ID
    let source_str = source_file.to_string_lossy().to_string();
    let material_id = editor.add_material(&source_str).await?;

    // Create materials directory if it doesn't exist
    let materials_dir = PathBuf::from(project_path).join("materials");
    fs::create_dir_all(&materials_dir)?;

    // Create new file path with material ID as filename
    let new_filename = if extension.is_empty() {
        material_id.clone()
    } else {
        format!("{}.{}", material_id, extension)
    };
    let dest_path = materials_dir.join(&new_filename);

    // Copy the file to materials directory
    fs::copy(&source_file, &dest_path)?;

    // Update the material path in protocol to use the new path
    let new_path_str = dest_path.to_string_lossy().to_string();

    // Reload protocol and update the material path
    let mut protocol = editor.save_to_protocol();

    // Update path in videos
    for video in &mut protocol.materials.videos {
        if video.id == material_id {
            video.src = new_path_str.clone();
            video.name = original_name.clone();
        }
    }

    // Update path in audios
    for audio in &mut protocol.materials.audios {
        if audio.id == material_id {
            audio.src = new_path_str.clone();
            audio.name = original_name.clone();
        }
    }

    // Update path in images
    for image in &mut protocol.materials.images {
        if image.id == material_id {
            image.src = new_path_str.clone();
            image.name = original_name.clone();
        }
    }

    // Save updated protocol
    editor.load_from_protocol(&protocol)?;
    editor.save_to_file(&protocol_file)?;

    // Get the material info from protocol to determine material type
    let protocol = editor.save_to_protocol();

    // Find the material type in protocol by ID
    let mut material_type = String::from("video");

    // Search in videos
    if protocol
        .materials
        .videos
        .iter()
        .any(|v| v.id == material_id)
    {
        material_type = "video".to_string();
    }
    // Search in audios
    else if protocol
        .materials
        .audios
        .iter()
        .any(|a| a.id == material_id)
    {
        material_type = "audio".to_string();
    }
    // Search in images
    else if protocol
        .materials
        .images
        .iter()
        .any(|i| i.id == material_id)
    {
        material_type = "image".to_string();
    }

    Ok(Resource {
        id: material_id,
        name: original_name,
        src: new_path_str,
        resource_type: "media".to_string(),
        material_type,
    })
}

/// List all materials
pub fn list_all_materials(project_path: &str) -> Result<Vec<Resource>> {
    let protocol_file = get_protocol_file(project_path)?;
    let mut editor = Editor::new();
    editor.load_from_file(&protocol_file)?;

    let protocol = editor.save_to_protocol();
    let mut materials = Vec::new();

    // Get video materials from protocol
    for video in &protocol.materials.videos {
        materials.push(Resource {
            id: video.id.clone(),
            name: video.name.clone(),
            src: video.src.clone(),
            resource_type: "media".to_string(),
            material_type: "video".to_string(),
        });
    }

    // Get audio materials from protocol
    for audio in &protocol.materials.audios {
        materials.push(Resource {
            id: audio.id.clone(),
            name: audio.name.clone(),
            src: audio.src.clone(),
            resource_type: "media".to_string(),
            material_type: "audio".to_string(),
        });
    }

    // Get image materials from protocol
    for image in &protocol.materials.images {
        materials.push(Resource {
            id: image.id.clone(),
            name: image.name.clone(),
            src: image.src.clone(),
            resource_type: "media".to_string(),
            material_type: "image".to_string(),
        });
    }

    Ok(materials)
}

/// Remove a material from the protocol
/// Removes the entry from protocol.json and deletes the file from materials directory
pub fn remove_material(project_path: &str, material_id: &str) -> Result<()> {
    let protocol_file = get_protocol_file(project_path)?;
    let mut editor = Editor::new();
    editor.load_from_file(&protocol_file)?;

    let material = editor.query_material(material_id)?;
    let material_src = material.src().to_string();
    let material_id_str = material.id().to_string();
    println!(
        "remove material {} from protocol: {}",
        material_id_str,
        material_src
    );

    // Delete from protocol
    editor.delete_material(material_id)?;
    editor.save_to_file(&protocol_file)?;

    // Delete the physical file if it's in the materials directory
    let material_path = Path::new(&material_src);
    if material_path.exists() {
        let materials_dir = PathBuf::from(project_path).join("materials");
        if material_path.starts_with(&materials_dir) {
            fs::remove_file(material_path)?;
            println!("Deleted material file: {}", material_src);
        }
    }

    Ok(())
}
