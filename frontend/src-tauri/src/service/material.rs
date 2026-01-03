use anyhow::{Result, bail};
use kiva_cut::Editor;
use std::fs;
use std::path::PathBuf;

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
/// The file is not copied, path in protocol.json points directly to the source file
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

    // Use the source path directly to get material ID
    let source_str = source_file.to_string_lossy().to_string();
    let material_id = editor.add_material(&source_str).await?;

    // Update the material path in protocol to use the source path directly
    let mut protocol = editor.save_to_protocol();

    // Update path in videos
    for video in &mut protocol.materials.videos {
        if video.id == material_id {
            video.src = source_str.clone();
            video.name = original_name.clone();
        }
    }

    // Update path in audios
    for audio in &mut protocol.materials.audios {
        if audio.id == material_id {
            audio.src = source_str.clone();
            audio.name = original_name.clone();
        }
    }

    // Update path in images
    for image in &mut protocol.materials.images {
        if image.id == material_id {
            image.src = source_str.clone();
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

    // Get full material metadata from protocol
    let mut dimension = None;
    let mut duration = None;
    let mut fps = None;
    let mut codec = None;
    let mut bitrate = None;
    let mut sample_rate = None;
    let mut channels = None;
    let mut format = None;

    if material_type == "video" {
        if let Some(video) = protocol
            .materials
            .videos
            .iter()
            .find(|v| v.id == material_id)
        {
            dimension = Some(crate::models::Dimension {
                width: video.dimension.width,
                height: video.dimension.height,
            });
            duration = video.duration;
            fps = video.fps;
            codec = video.codec.clone();
            bitrate = video.bitrate;
        }
    } else if material_type == "audio" {
        if let Some(audio) = protocol
            .materials
            .audios
            .iter()
            .find(|a| a.id == material_id)
        {
            duration = audio.duration;
            codec = audio.codec.clone();
            bitrate = audio.bitrate;
            sample_rate = audio.sample_rate;
            channels = audio.channels;
        }
    } else if material_type == "image" {
        if let Some(image) = protocol
            .materials
            .images
            .iter()
            .find(|i| i.id == material_id)
        {
            dimension = Some(crate::models::Dimension {
                width: image.dimension.width,
                height: image.dimension.height,
            });
            format = image.format.clone();
        }
    }

    Ok(Resource {
        id: material_id,
        name: original_name,
        src: source_str,
        resource_type: "media".to_string(),
        material_type,
        dimension,
        duration,
        fps,
        codec,
        bitrate,
        sample_rate,
        channels,
        format,
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
            dimension: Some(crate::models::Dimension {
                width: video.dimension.width,
                height: video.dimension.height,
            }),
            duration: video.duration,
            fps: video.fps,
            codec: video.codec.clone(),
            bitrate: video.bitrate,
            sample_rate: None,
            channels: None,
            format: None,
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
            dimension: None,
            duration: audio.duration,
            fps: None,
            codec: audio.codec.clone(),
            bitrate: audio.bitrate,
            sample_rate: audio.sample_rate,
            channels: audio.channels,
            format: None,
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
            dimension: Some(crate::models::Dimension {
                width: image.dimension.width,
                height: image.dimension.height,
            }),
            duration: None,
            fps: None,
            codec: None,
            bitrate: None,
            sample_rate: None,
            channels: None,
            format: image.format.clone(),
        });
    }

    Ok(materials)
}

/// Remove a material from the protocol
/// Removes the entry from protocol.json but does not delete the physical file
pub fn remove_material(project_path: &str, material_id: &str) -> Result<()> {
    let protocol_file = get_protocol_file(project_path)?;
    let mut editor = Editor::new();
    editor.load_from_file(&protocol_file)?;

    let material = editor.query_material(material_id)?;
    let material_src = material.src().to_string();
    let material_id_str = material.id().to_string();
    println!(
        "remove material {} from protocol: {}",
        material_id_str, material_src
    );

    // Delete from protocol
    editor.delete_material(material_id)?;
    editor.save_to_file(&protocol_file)?;

    // Note: We do not delete the physical file since it's the source file
    // and may be used elsewhere. The file will remain in its original location.

    Ok(())
}
