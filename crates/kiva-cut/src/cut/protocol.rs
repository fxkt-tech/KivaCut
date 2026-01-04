//! Protocol definitions and conversion for cut protocol format

use crate::cut::{
    EditSession,
    material::{AudioMaterial, Dimension, ImageMaterial, Material, VideoMaterial},
    segment::{Position, Segment, SegmentType, TimeRange},
    stage::Stage,
    track::{Track, TrackType},
};
use crate::error::{CutError, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Cut protocol root structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CutProtocol {
    /// Stage configuration
    pub stage: StageConfig,
    /// Available materials
    pub materials: Materials,
    /// Timeline tracks
    pub tracks: Vec<ProtocolTrack>,
}

/// Stage configuration in protocol format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageConfig {
    /// Stage width in pixels
    pub width: i32,
    /// Stage height in pixels
    pub height: i32,
}

/// Materials container
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Materials {
    /// Video materials
    #[serde(default)]
    pub videos: Vec<VideoMaterialProto>,
    /// Image materials
    #[serde(default)]
    pub images: Vec<ImageMaterialProto>,
    /// Audio materials
    #[serde(default)]
    pub audios: Vec<AudioMaterialProto>,
}

/// Video material in protocol format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoMaterialProto {
    /// Unique identifier
    pub id: String,
    /// Material name
    pub name: String,
    /// Source file path
    pub src: String,
    /// Video dimensions
    pub dimension: DimensionProto,
    /// Duration in milliseconds (optional)
    pub duration: Option<u32>,
    /// Frame rate (optional)
    pub fps: Option<f32>,
    /// Video codec (optional)
    pub codec: Option<String>,
    /// Bitrate in kbps (optional)
    pub bitrate: Option<u32>,
}

/// Image material in protocol format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageMaterialProto {
    /// Unique identifier
    pub id: String,
    /// Material name
    pub name: String,
    /// Source file path
    pub src: String,
    /// Image dimensions
    pub dimension: DimensionProto,
    /// Image format (optional)
    pub format: Option<String>,
}

/// Audio material in protocol format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioMaterialProto {
    /// Unique identifier
    pub id: String,
    /// Material name
    pub name: String,
    /// Source file path
    pub src: String,
    /// Duration in milliseconds (optional)
    pub duration: Option<u32>,
    /// Sample rate in Hz (optional)
    pub sample_rate: Option<u32>,
    /// Number of channels (optional)
    pub channels: Option<u32>,
    /// Audio codec (optional)
    pub codec: Option<String>,
    /// Bitrate in kbps (optional)
    pub bitrate: Option<u32>,
}

/// Dimension in protocol format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DimensionProto {
    /// Width in pixels
    pub width: i32,
    /// Height in pixels
    pub height: i32,
}

/// Track in protocol format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtocolTrack {
    /// Track identifier
    pub id: String,
    /// Track type
    #[serde(rename = "type")]
    pub track_type: String,
    /// Track segments
    pub segments: Vec<ProtocolSegment>,
}

/// Segment in protocol format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtocolSegment {
    /// Segment identifier
    pub id: String,
    /// Segment type
    #[serde(rename = "type")]
    pub segment_type: String,
    /// Referenced material ID
    pub material_id: String,
    /// Target time range on timeline
    pub target_timerange: TimeRangeProto,
    /// Source time range in material
    pub source_timerange: TimeRangeProto,
    /// Scale/size configuration (optional)
    pub scale: Option<ScaleProto>,
    /// Position on stage (optional)
    pub position: Option<PositionProto>,
}

/// Time range in protocol format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeRangeProto {
    /// Start time in milliseconds
    pub start: u32,
    /// Duration in milliseconds
    pub duration: u32,
}

/// Scale in protocol format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScaleProto {
    /// Width in pixels
    pub width: i32,
    /// Height in pixels
    pub height: i32,
}

/// Position in protocol format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionProto {
    /// X coordinate in pixels
    pub x: i32,
    /// Y coordinate in pixels
    pub y: i32,
}

/// Export configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportConfig {
    /// Export type
    #[serde(rename = "type")]
    pub export_type: ExportType,
    /// Output file path
    pub output_file: String,
    /// Additional export options
    pub options: Option<HashMap<String, serde_json::Value>>,
}

/// Export type enumeration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportType {
    /// Export as video
    Video,
    /// Export as audio only
    Audio,
}

impl CutProtocol {
    /// Create a new empty protocol
    pub fn new(stage_width: i32, stage_height: i32) -> Self {
        Self {
            stage: StageConfig {
                width: stage_width,
                height: stage_height,
            },
            materials: Materials {
                videos: Vec::new(),
                images: Vec::new(),
                audios: Vec::new(),
            },
            tracks: Vec::new(),
        }
    }

    /// Convert from EditSession
    pub fn from_session(session: &EditSession) -> Self {
        let mut protocol = CutProtocol::new(session.stage.width, session.stage.height);

        // Convert materials
        for material in &session.materials {
            match material {
                Material::Video(video) => {
                    // Extract name from the last segment of the src path
                    let name = std::path::Path::new(&video.src)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(&video.src)
                        .to_string();

                    protocol.materials.videos.push(VideoMaterialProto {
                        id: video.id.clone(),
                        name,
                        src: video.src.clone(),
                        dimension: DimensionProto {
                            width: video.dimension.width,
                            height: video.dimension.height,
                        },
                        duration: video.duration,
                        fps: video.fps,
                        codec: video.codec.clone(),
                        bitrate: video.bitrate,
                    });
                }
                Material::Audio(audio) => {
                    // Extract name from the last segment of the src path
                    let name = std::path::Path::new(&audio.src)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(&audio.src)
                        .to_string();

                    protocol.materials.audios.push(AudioMaterialProto {
                        id: audio.id.clone(),
                        name,
                        src: audio.src.clone(),
                        duration: audio.duration,
                        sample_rate: audio.sample_rate,
                        channels: audio.channels,
                        codec: audio.codec.clone(),
                        bitrate: audio.bitrate,
                    });
                }
                Material::Image(image) => {
                    // Extract name from the last segment of the src path
                    let name = std::path::Path::new(&image.src)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(&image.src)
                        .to_string();

                    protocol.materials.images.push(ImageMaterialProto {
                        id: image.id.clone(),
                        name,
                        src: image.src.clone(),
                        dimension: DimensionProto {
                            width: image.dimension.width,
                            height: image.dimension.height,
                        },
                        format: image.format.clone(),
                    });
                }
            }
        }

        // Convert tracks
        for track in &session.tracks {
            let mut protocol_track = ProtocolTrack {
                id: track.id.clone(),
                track_type: track.track_type.to_string(),
                segments: Vec::new(),
            };

            // Convert segments
            for segment in &track.segments {
                // Get material dimensions for default scale if needed
                let material_dimension = session.materials.iter().find_map(|m| match m {
                    Material::Video(v) if v.id == segment.material_id => Some(v.dimension),
                    Material::Image(i) if i.id == segment.material_id => Some(i.dimension),
                    _ => None,
                });

                // Ensure scale is always present - use segment scale or material dimension
                let scale = if let Some(seg_scale) = segment.scale {
                    ScaleProto {
                        width: seg_scale.width,
                        height: seg_scale.height,
                    }
                } else if let Some(dim) = material_dimension {
                    ScaleProto {
                        width: dim.width,
                        height: dim.height,
                    }
                } else {
                    // Fallback to default dimensions if material not found
                    ScaleProto {
                        width: 1920,
                        height: 1080,
                    }
                };

                // Ensure position is always present - use segment position or default (0, 0)
                let position = segment
                    .position
                    .map(|p| PositionProto { x: p.x, y: p.y })
                    .unwrap_or(PositionProto { x: 0, y: 0 });

                let protocol_segment = ProtocolSegment {
                    id: segment.id.clone(),
                    segment_type: segment.segment_type.to_string(),
                    material_id: segment.material_id.clone(),
                    target_timerange: TimeRangeProto {
                        start: segment.target_timerange.start,
                        duration: segment.target_timerange.duration,
                    },
                    source_timerange: TimeRangeProto {
                        start: segment.source_timerange.start,
                        duration: segment.source_timerange.duration,
                    },
                    scale: Some(scale),
                    position: Some(position),
                };

                protocol_track.segments.push(protocol_segment);
            }

            protocol.tracks.push(protocol_track);
        }

        protocol
    }

    /// Convert to EditSession
    pub fn to_session(protocol: &CutProtocol) -> Result<EditSession> {
        let stage = Stage::new(protocol.stage.width, protocol.stage.height);
        let mut session = EditSession::new(stage);

        // Convert materials
        for video in &protocol.materials.videos {
            let material = Material::Video(VideoMaterial {
                id: video.id.clone(),
                src: video.src.clone(),
                dimension: Dimension {
                    width: video.dimension.width,
                    height: video.dimension.height,
                },
                duration: video.duration,
                fps: video.fps,
                codec: video.codec.clone(),
                bitrate: video.bitrate,
            });
            session.add_material(material);
        }

        for audio in &protocol.materials.audios {
            let material = Material::Audio(AudioMaterial {
                id: audio.id.clone(),
                src: audio.src.clone(),
                duration: audio.duration,
                sample_rate: audio.sample_rate,
                channels: audio.channels,
                codec: audio.codec.clone(),
                bitrate: audio.bitrate,
            });
            session.add_material(material);
        }

        for image in &protocol.materials.images {
            let material = Material::Image(ImageMaterial {
                id: image.id.clone(),
                src: image.src.clone(),
                dimension: Dimension {
                    width: image.dimension.width,
                    height: image.dimension.height,
                },
                format: image.format.clone(),
            });
            session.add_material(material);
        }

        // Convert tracks
        for protocol_track in &protocol.tracks {
            let track_type = match protocol_track.track_type.as_str() {
                "video" => TrackType::Video,
                "audio" => TrackType::Audio,
                "image" => TrackType::Image,
                "text" => TrackType::Text,
                "subtitle" => TrackType::Subtitle,
                _ => {
                    return Err(CutError::invalid_params(format!(
                        "Unknown track type: {}",
                        protocol_track.track_type
                    )));
                }
            };

            let mut track = Track::new(&protocol_track.id, track_type);

            // Convert segments
            for protocol_segment in &protocol_track.segments {
                let segment_type = match protocol_segment.segment_type.as_str() {
                    "video" => SegmentType::Video,
                    "audio" => SegmentType::Audio,
                    "image" => SegmentType::Image,
                    "text" => SegmentType::Text,
                    "subtitle" => SegmentType::Subtitle,
                    _ => {
                        return Err(CutError::invalid_params(format!(
                            "Unknown segment type: {}",
                            protocol_segment.segment_type
                        )));
                    }
                };

                let mut segment = Segment::new(
                    &protocol_segment.id,
                    segment_type,
                    &protocol_segment.material_id,
                    TimeRange {
                        start: protocol_segment.target_timerange.start,
                        duration: protocol_segment.target_timerange.duration,
                    },
                    TimeRange {
                        start: protocol_segment.source_timerange.start,
                        duration: protocol_segment.source_timerange.duration,
                    },
                );

                if let Some(scale) = &protocol_segment.scale {
                    segment.scale = Some(Dimension {
                        width: scale.width,
                        height: scale.height,
                    });
                }

                if let Some(position) = &protocol_segment.position {
                    segment.position = Some(Position {
                        x: position.x,
                        y: position.y,
                    });
                }

                track.add_segment(segment);
            }

            session.add_track(track);
        }

        Ok(session)
    }

    /// Load from JSON string
    pub fn from_json(json: &str) -> Result<Self> {
        serde_json::from_str(json).map_err(|e| CutError::Json(e))
    }

    /// Save to JSON string
    pub fn to_json(&self) -> Result<String> {
        serde_json::to_string_pretty(self).map_err(|e| CutError::Json(e))
    }

    /// Validate the protocol
    pub fn validate(&self) -> Result<()> {
        // Validate stage
        if self.stage.width <= 0 || self.stage.height <= 0 {
            return Err(CutError::invalid_params(
                "Stage dimensions must be positive",
            ));
        }

        // Collect all material IDs for reference checking
        let mut material_ids = std::collections::HashSet::new();

        for video in &self.materials.videos {
            if video.id.is_empty() {
                return Err(CutError::invalid_params(
                    "Video material ID cannot be empty",
                ));
            }
            if !material_ids.insert(&video.id) {
                return Err(CutError::invalid_params(format!(
                    "Duplicate material ID: {}",
                    video.id
                )));
            }
        }

        for audio in &self.materials.audios {
            if audio.id.is_empty() {
                return Err(CutError::invalid_params(
                    "Audio material ID cannot be empty",
                ));
            }
            if !material_ids.insert(&audio.id) {
                return Err(CutError::invalid_params(format!(
                    "Duplicate material ID: {}",
                    audio.id
                )));
            }
        }

        for image in &self.materials.images {
            if image.id.is_empty() {
                return Err(CutError::invalid_params(
                    "Image material ID cannot be empty",
                ));
            }
            if !material_ids.insert(&image.id) {
                return Err(CutError::invalid_params(format!(
                    "Duplicate material ID: {}",
                    image.id
                )));
            }
        }

        // Validate tracks
        let mut track_ids = std::collections::HashSet::new();
        for track in &self.tracks {
            if track.id.is_empty() {
                return Err(CutError::invalid_params("Track ID cannot be empty"));
            }
            if !track_ids.insert(&track.id) {
                return Err(CutError::invalid_params(format!(
                    "Duplicate track ID: {}",
                    track.id
                )));
            }

            // Validate segments
            let mut segment_ids = std::collections::HashSet::new();
            for segment in &track.segments {
                if segment.id.is_empty() {
                    return Err(CutError::invalid_params("Segment ID cannot be empty"));
                }
                if !segment_ids.insert(&segment.id) {
                    return Err(CutError::invalid_params(format!(
                        "Duplicate segment ID: {}",
                        segment.id
                    )));
                }

                // Check if referenced material exists
                if !material_ids.contains(&segment.material_id) {
                    return Err(CutError::invalid_params(format!(
                        "Referenced material '{}' not found",
                        segment.material_id
                    )));
                }

                // Validate time ranges
                if segment.target_timerange.duration == 0 {
                    return Err(CutError::invalid_params("Target duration must be positive"));
                }
                if segment.source_timerange.duration == 0 {
                    return Err(CutError::invalid_params("Source duration must be positive"));
                }

                // Validate scale if present
                if let Some(scale) = &segment.scale {
                    if scale.width <= 0 || scale.height <= 0 {
                        return Err(CutError::invalid_params(
                            "Scale dimensions must be positive",
                        ));
                    }
                }
            }
        }

        Ok(())
    }

    /// Add a video material
    pub fn add_video_material(&mut self, material: VideoMaterialProto) {
        self.materials.videos.push(material);
    }

    /// Add an audio material
    pub fn add_audio_material(&mut self, material: AudioMaterialProto) {
        self.materials.audios.push(material);
    }

    /// Add an image material
    pub fn add_image_material(&mut self, material: ImageMaterialProto) {
        self.materials.images.push(material);
    }

    /// Add a track
    pub fn add_track(&mut self, track: ProtocolTrack) {
        self.tracks.push(track);
    }

    /// Get total duration
    pub fn total_duration(&self) -> u32 {
        self.tracks
            .iter()
            .flat_map(|track| &track.segments)
            .map(|segment| segment.target_timerange.start + segment.target_timerange.duration)
            .max()
            .unwrap_or(0)
    }
}

impl Default for CutProtocol {
    fn default() -> Self {
        Self::new(1920, 1080)
    }
}

impl Default for Materials {
    fn default() -> Self {
        Self {
            videos: Vec::new(),
            images: Vec::new(),
            audios: Vec::new(),
        }
    }
}

impl std::fmt::Display for ExportType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExportType::Video => write!(f, "video"),
            ExportType::Audio => write!(f, "audio"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_protocol_creation() {
        let protocol = CutProtocol::new(1920, 1080);
        assert_eq!(protocol.stage.width, 1920);
        assert_eq!(protocol.stage.height, 1080);
        assert!(protocol.materials.videos.is_empty());
        assert!(protocol.tracks.is_empty());
    }

    #[test]
    fn test_json_serialization() {
        let protocol = CutProtocol::new(1280, 720);
        let json = protocol.to_json().unwrap();
        let deserialized = CutProtocol::from_json(&json).unwrap();

        assert_eq!(deserialized.stage.width, 1280);
        assert_eq!(deserialized.stage.height, 720);
    }

    #[test]
    fn test_validation() {
        let mut protocol = CutProtocol::new(1920, 1080);
        assert!(protocol.validate().is_ok());

        // Add a video material
        protocol.add_video_material(VideoMaterialProto {
            id: "video1".to_string(),
            name: "test.mp4".to_string(),
            src: "test.mp4".to_string(),
            dimension: DimensionProto {
                width: 1920,
                height: 1080,
            },
            duration: Some(30000),
            fps: Some(30.0),
            codec: Some("h264".to_string()),
            bitrate: Some(5000),
        });

        // Add a track with segment
        let track = ProtocolTrack {
            id: "track1".to_string(),
            track_type: "video".to_string(),
            segments: vec![ProtocolSegment {
                id: "segment1".to_string(),
                segment_type: "video".to_string(),
                material_id: "video1".to_string(),
                target_timerange: TimeRangeProto {
                    start: 0,
                    duration: 10000,
                },
                source_timerange: TimeRangeProto {
                    start: 0,
                    duration: 10000,
                },
                scale: Some(ScaleProto {
                    width: 1280,
                    height: 720,
                }),
                position: Some(PositionProto { x: 0, y: 0 }),
            }],
        };
        protocol.add_track(track);

        assert!(protocol.validate().is_ok());
        assert_eq!(protocol.total_duration(), 10000);
    }

    #[test]
    fn test_session_conversion() {
        let mut session = EditSession::new(Stage::new(1920, 1080));

        // Add materials
        let video_material = Material::Video(VideoMaterial::new("video1", "test.mp4", 1920, 1080));
        session.add_material(video_material);

        // Add track with segment
        let mut track = Track::video();
        let segment = Segment::video("video1", TimeRange::new(0, 10000), TimeRange::new(0, 10000))
            .scale(Dimension::new(1280, 720))
            .position(Position::new(0, 0));

        track.add_segment(segment);
        session.add_track(track);

        // Convert to protocol and back
        let protocol = CutProtocol::from_session(&session);
        let converted_session = CutProtocol::to_session(&protocol).unwrap();

        assert_eq!(converted_session.stage.width, 1920);
        assert_eq!(converted_session.materials.len(), 1);
        assert_eq!(converted_session.tracks.len(), 1);
    }

    #[test]
    fn test_invalid_protocol() {
        let mut protocol = CutProtocol::new(0, 1080); // Invalid width
        assert!(protocol.validate().is_err());

        protocol.stage.width = 1920;

        // Add duplicate material IDs
        protocol.add_video_material(VideoMaterialProto {
            id: "video1".to_string(),
            name: "test1.mp4".to_string(),
            src: "test1.mp4".to_string(),
            dimension: DimensionProto {
                width: 1920,
                height: 1080,
            },
            duration: None,
            fps: None,
            codec: None,
            bitrate: None,
        });

        protocol.add_video_material(VideoMaterialProto {
            id: "video1".to_string(), // Duplicate ID
            name: "test2.mp4".to_string(),
            src: "test2.mp4".to_string(),
            dimension: DimensionProto {
                width: 1920,
                height: 1080,
            },
            duration: None,
            fps: None,
            codec: None,
            bitrate: None,
        });

        assert!(protocol.validate().is_err());
    }
}
