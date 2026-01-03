use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectHistory {
    pub id: String,
    pub name: String,
    pub path: String,
    pub create_time: String,
    pub last_modified: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Resource {
    pub id: String,
    pub name: String,
    pub src: String,
    pub resource_type: String,
    pub material_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dimension: Option<Dimension>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fps: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codec: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_rate: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channels: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Dimension {
    pub width: i32,
    pub height: i32,
}
