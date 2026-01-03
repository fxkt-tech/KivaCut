//! FFprobe module for extracting media information

use crate::error::{CutError, Result};
use crate::options::FFprobeOptions;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use tokio::process::Command;

/// FFprobe command builder and executor
#[derive(Debug)]
pub struct FFprobe {
    options: FFprobeOptions,
    input_file: Option<String>,
}

/// Media information container
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaInfo {
    pub format: Option<FormatInfo>,
    pub streams: Vec<StreamInfo>,
}

/// Format information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormatInfo {
    pub filename: Option<String>,
    pub nb_streams: Option<i32>,
    pub nb_programs: Option<i32>,
    pub format_name: Option<String>,
    pub format_long_name: Option<String>,
    pub start_time: Option<String>,
    pub duration: Option<String>,
    pub size: Option<String>,
    pub bit_rate: Option<String>,
    pub probe_score: Option<i32>,
    pub tags: Option<HashMap<String, String>>,
}

/// Stream information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamInfo {
    pub index: i32,
    pub codec_name: Option<String>,
    pub codec_long_name: Option<String>,
    pub profile: Option<String>,
    pub codec_type: Option<String>,
    pub codec_tag_string: Option<String>,
    pub codec_tag: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub coded_width: Option<i32>,
    pub coded_height: Option<i32>,
    pub closed_captions: Option<i32>,
    pub film_grain: Option<i32>,
    pub has_b_frames: Option<i32>,
    pub sample_aspect_ratio: Option<String>,
    pub display_aspect_ratio: Option<String>,
    pub pix_fmt: Option<String>,
    pub level: Option<i32>,
    pub color_range: Option<String>,
    pub color_space: Option<String>,
    pub color_transfer: Option<String>,
    pub color_primaries: Option<String>,
    pub chroma_location: Option<String>,
    pub field_order: Option<String>,
    pub refs: Option<i32>,
    pub is_avc: Option<String>,
    pub nal_length_size: Option<String>,
    pub r_frame_rate: Option<String>,
    pub avg_frame_rate: Option<String>,
    pub time_base: Option<String>,
    pub start_pts: Option<i64>,
    pub start_time: Option<String>,
    pub duration_ts: Option<i64>,
    pub duration: Option<String>,
    pub bit_rate: Option<String>,
    pub bits_per_raw_sample: Option<String>,
    pub nb_frames: Option<String>,
    pub nb_read_frames: Option<String>,
    pub nb_read_packets: Option<String>,
    pub tags: Option<HashMap<String, String>>,
    // Audio-specific fields
    pub sample_fmt: Option<String>,
    pub sample_rate: Option<String>,
    pub channels: Option<i32>,
    pub channel_layout: Option<String>,
    pub bits_per_sample: Option<i32>,
    pub initial_padding: Option<i32>,
}

/// Loudnorm analysis parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoudnormParams {
    pub input_i: Option<f32>,
    pub input_tp: Option<f32>,
    pub input_lra: Option<f32>,
    pub input_thresh: Option<f32>,
    pub output_i: Option<f32>,
    pub output_tp: Option<f32>,
    pub output_lra: Option<f32>,
    pub output_thresh: Option<f32>,
    pub normalization_type: Option<String>,
    pub target_offset: Option<f32>,
}

impl FFprobe {
    /// Create a new FFprobe instance
    pub fn new() -> Self {
        Self {
            options: FFprobeOptions::new(),
            input_file: None,
        }
    }

    /// Set custom options
    pub fn set_options(mut self, options: FFprobeOptions) -> Self {
        self.options = options;
        self
    }

    /// Set the input file
    pub fn input<S: Into<String>>(mut self, file: S) -> Self {
        self.input_file = Some(file.into());
        self
    }

    /// Build command line arguments
    pub fn build_args(&self) -> Vec<String> {
        let mut args = Vec::new();

        // Add custom arguments first
        args.extend(self.options.custom_args.clone());

        // Add output format
        if self.options.json_format {
            args.push("-v".to_string());
            args.push("quiet".to_string());
            args.push("-print_format".to_string());
            args.push("json".to_string());
        }

        // Add show options
        if self.options.show_format {
            args.push("-show_format".to_string());
        }

        if self.options.show_streams {
            args.push("-show_streams".to_string());
        }

        // Add input file
        if let Some(ref input) = self.input_file {
            args.push(input.clone());
        }

        args
    }

    /// Execute FFprobe and get media information
    pub async fn run(&self) -> Result<MediaInfo> {
        let _input_file = self
            .input_file
            .as_ref()
            .ok_or_else(|| CutError::missing_param("input file"))?;

        let args = self.build_args();
        let mut cmd = Command::new(&self.options.binary_path);
        cmd.args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Set environment variables
        for (key, value) in &self.options.env_vars {
            cmd.env(key, value);
        }

        let output = cmd
            .output()
            .await
            .map_err(|e| CutError::ffprobe(format!("Failed to execute FFprobe: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(CutError::ffprobe(format!(
                "FFprobe command failed: {}",
                stderr
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);

        if self.options.json_format {
            serde_json::from_str(&stdout).map_err(|e| {
                CutError::ffprobe(format!("Failed to parse FFprobe JSON output: {}", e))
            })
        } else {
            // For non-JSON output, return minimal structure
            Ok(MediaInfo {
                format: None,
                streams: Vec::new(),
            })
        }
    }

    /// Get raw output as string
    pub async fn run_raw(&self) -> Result<String> {
        let args = self.build_args();
        let mut cmd = Command::new(&self.options.binary_path);
        cmd.args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Set environment variables
        for (key, value) in &self.options.env_vars {
            cmd.env(key, value);
        }

        let output = cmd
            .output()
            .await
            .map_err(|e| CutError::ffprobe(format!("Failed to execute FFprobe: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(CutError::ffprobe(format!(
                "FFprobe command failed: {}",
                stderr
            )));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}

impl Default for FFprobe {
    fn default() -> Self {
        Self::new()
    }
}

impl MediaInfo {
    /// Get the first video stream
    pub fn first_video_stream(&self) -> Option<&StreamInfo> {
        self.streams
            .iter()
            .find(|stream| stream.codec_type.as_deref() == Some("video"))
    }

    /// Get the first audio stream
    pub fn first_audio_stream(&self) -> Option<&StreamInfo> {
        self.streams
            .iter()
            .find(|stream| stream.codec_type.as_deref() == Some("audio"))
    }

    /// Get all video streams
    pub fn video_streams(&self) -> Vec<&StreamInfo> {
        self.streams
            .iter()
            .filter(|stream| stream.codec_type.as_deref() == Some("video"))
            .collect()
    }

    /// Get all audio streams
    pub fn audio_streams(&self) -> Vec<&StreamInfo> {
        self.streams
            .iter()
            .filter(|stream| stream.codec_type.as_deref() == Some("audio"))
            .collect()
    }

    /// Get duration as seconds
    pub fn duration_seconds(&self) -> Option<f64> {
        if let Some(ref format) = self.format {
            if let Some(ref duration) = format.duration {
                return duration.parse().ok();
            }
        }

        // Fallback to stream duration
        self.first_video_stream()
            .or_else(|| self.first_audio_stream())
            .and_then(|stream| stream.duration.as_ref())
            .and_then(|duration| duration.parse().ok())
    }

    /// Get total bitrate
    pub fn bitrate(&self) -> Option<i64> {
        self.format
            .as_ref()
            .and_then(|f| f.bit_rate.as_ref())
            .and_then(|br| br.parse().ok())
    }

    /// Check if media has video
    pub fn has_video(&self) -> bool {
        self.first_video_stream().is_some()
    }

    /// Check if media has audio
    pub fn has_audio(&self) -> bool {
        self.first_audio_stream().is_some()
    }

    /// Get video resolution as (width, height)
    pub fn video_resolution(&self) -> Option<(i32, i32)> {
        self.first_video_stream()
            .and_then(|stream| stream.width.zip(stream.height))
    }

    /// Get video frame rate
    pub fn video_framerate(&self) -> Option<String> {
        self.first_video_stream()
            .and_then(|stream| stream.r_frame_rate.clone())
    }

    /// Get audio sample rate
    pub fn audio_sample_rate(&self) -> Option<i32> {
        self.first_audio_stream()
            .and_then(|stream| stream.sample_rate.as_ref())
            .and_then(|sr| sr.parse().ok())
    }

    /// Get audio channels
    pub fn audio_channels(&self) -> Option<i32> {
        self.first_audio_stream().and_then(|stream| stream.channels)
    }

    /// Check if this is a video file (has video stream and either multiple frames or no frame count)
    pub fn is_video(&self) -> bool {
        if let Some(video_stream) = self.first_video_stream() {
            // If we have frame count, check if it's more than 1
            if let Some(frame_count) = video_stream.frame_count() {
                return frame_count > 1;
            }
            // If no frame count available, assume it's a video if it has video stream
            // and duration is more than a threshold (e.g., 0.1 seconds)
            if let Some(duration) = video_stream.duration_seconds() {
                return duration > 0.1;
            }
            // If we can't determine, default to true if has video stream
            true
        } else {
            false
        }
    }

    /// Check if this is an audio file (has audio but no video, or is audio-only)
    pub fn is_audio(&self) -> bool {
        self.has_audio() && !self.is_video()
    }

    /// Check if this is an image file (single frame or image format)
    pub fn is_image(&self) -> bool {
        // Check if codec name is a known image format
        if let Some(video_stream) = self.first_video_stream() {
            if let Some(ref codec_name) = video_stream.codec_name {
                let image_codecs = [
                    "png", "jpeg", "jpg", "bmp", "gif", "webp", "tiff", "tif", "svg", "apng",
                ];
                if image_codecs
                    .iter()
                    .any(|&codec| codec_name.eq_ignore_ascii_case(codec))
                {
                    return true;
                }
            }
        }

        // Check if format name contains common image formats
        if let Some(ref format) = self.format {
            if let Some(ref format_name) = format.format_name {
                let image_formats = [
                    "image2",
                    "png_pipe",
                    "jpeg_pipe",
                    "mjpeg",
                    "bmp_pipe",
                    "gif",
                    "webp_pipe",
                    "tiff_pipe",
                    "svg_pipe",
                ];
                if image_formats.iter().any(|&fmt| format_name.contains(fmt)) {
                    return true;
                }
            }
        }

        // Check if it's a video with exactly 1 frame
        if let Some(video_stream) = self.first_video_stream() {
            if let Some(frame_count) = video_stream.frame_count() {
                return frame_count == 1;
            }
            // Check if duration is very short (less than 0.1 seconds) which might indicate an image
            if let Some(duration) = video_stream.duration_seconds() {
                return duration <= 0.1 && !self.has_audio();
            }
        }

        false
    }
}

impl StreamInfo {
    /// Check if this is a video stream
    pub fn is_video(&self) -> bool {
        self.codec_type.as_deref() == Some("video")
    }

    /// Check if this is an audio stream
    pub fn is_audio(&self) -> bool {
        self.codec_type.as_deref() == Some("audio")
    }

    /// Get duration as seconds
    pub fn duration_seconds(&self) -> Option<f64> {
        self.duration.as_ref().and_then(|d| d.parse().ok())
    }

    /// Get bitrate as integer
    pub fn bitrate_int(&self) -> Option<i64> {
        self.bit_rate.as_ref().and_then(|br| br.parse().ok())
    }

    /// Get frame count
    pub fn frame_count(&self) -> Option<i64> {
        self.nb_frames.as_ref().and_then(|nf| nf.parse().ok())
    }

    /// Get aspect ratio as float
    pub fn aspect_ratio(&self) -> Option<f64> {
        if let (Some(width), Some(height)) = (self.width, self.height) {
            if height != 0 {
                return Some(width as f64 / height as f64);
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_media_info_methods() {
        let media_info = MediaInfo {
            format: Some(FormatInfo {
                duration: Some("120.5".to_string()),
                bit_rate: Some("1000000".to_string()),
                ..Default::default()
            }),
            streams: vec![
                StreamInfo {
                    index: 0,
                    codec_type: Some("video".to_string()),
                    width: Some(1920),
                    height: Some(1080),
                    r_frame_rate: Some("30/1".to_string()),
                    ..Default::default()
                },
                StreamInfo {
                    index: 1,
                    codec_type: Some("audio".to_string()),
                    sample_rate: Some("44100".to_string()),
                    channels: Some(2),
                    ..Default::default()
                },
            ],
        };

        assert_eq!(media_info.duration_seconds(), Some(120.5));
        assert_eq!(media_info.bitrate(), Some(1000000));
        assert!(media_info.has_video());
        assert!(media_info.has_audio());
        assert_eq!(media_info.video_resolution(), Some((1920, 1080)));
        assert_eq!(media_info.audio_sample_rate(), Some(44100));
        assert_eq!(media_info.audio_channels(), Some(2));
    }

    #[test]
    fn test_stream_info_methods() {
        let video_stream = StreamInfo {
            index: 0,
            codec_type: Some("video".to_string()),
            width: Some(1920),
            height: Some(1080),
            duration: Some("60.0".to_string()),
            bit_rate: Some("5000000".to_string()),
            nb_frames: Some("1800".to_string()),
            ..Default::default()
        };

        assert!(video_stream.is_video());
        assert!(!video_stream.is_audio());
        assert_eq!(video_stream.duration_seconds(), Some(60.0));
        assert_eq!(video_stream.bitrate_int(), Some(5000000));
        assert_eq!(video_stream.frame_count(), Some(1800));
        assert_eq!(video_stream.aspect_ratio(), Some(16.0 / 9.0));
    }
}

// Implement Default for structs that need it
impl Default for FormatInfo {
    fn default() -> Self {
        Self {
            filename: None,
            nb_streams: None,
            nb_programs: None,
            format_name: None,
            format_long_name: None,
            start_time: None,
            duration: None,
            size: None,
            bit_rate: None,
            probe_score: None,
            tags: None,
        }
    }
}

impl Default for StreamInfo {
    fn default() -> Self {
        Self {
            index: 0,
            codec_name: None,
            codec_long_name: None,
            profile: None,
            codec_type: None,
            codec_tag_string: None,
            codec_tag: None,
            width: None,
            height: None,
            coded_width: None,
            coded_height: None,
            closed_captions: None,
            film_grain: None,
            has_b_frames: None,
            sample_aspect_ratio: None,
            display_aspect_ratio: None,
            pix_fmt: None,
            level: None,
            color_range: None,
            color_space: None,
            color_transfer: None,
            color_primaries: None,
            chroma_location: None,
            field_order: None,
            refs: None,
            is_avc: None,
            nal_length_size: None,
            r_frame_rate: None,
            avg_frame_rate: None,
            time_base: None,
            start_pts: None,
            start_time: None,
            duration_ts: None,
            duration: None,
            bit_rate: None,
            bits_per_raw_sample: None,
            nb_frames: None,
            nb_read_frames: None,
            nb_read_packets: None,
            tags: None,
            sample_fmt: None,
            sample_rate: None,
            channels: None,
            channel_layout: None,
            bits_per_sample: None,
            initial_padding: None,
        }
    }
}
