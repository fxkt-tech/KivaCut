//! Main video editor implementation

use crate::cut::{
    EditSession,
    material::Material,
    protocol::{CutProtocol, ExportType},
    segment::Segment,
    stage::Stage,
    track::Track,
};
use crate::error::{CutError, Result};
use crate::ffmpeg::{
    FFmpeg,
    codec::{AudioCodec, VideoCodec},
    filter::Filter,
    input::Input,
    output::Output,
};
use crate::ffprobe::FFprobe;
use crate::{FFmpegOptions, FFprobeOptions};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::Path};

/// Main video editor for composition and export
#[derive(Debug)]
pub struct Editor {
    /// FFmpeg options
    ffmpeg_options: FFmpegOptions,
    /// FFprobe options
    ffprobe_options: FFprobeOptions,
    /// Current editing session
    session: EditSession,
}

/// Export options for video rendering
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    /// Output file path
    pub output_file: String,
    /// Export type
    pub export_type: ExportType,
    /// Video codec (for video exports)
    pub video_codec: Option<String>,
    /// Audio codec
    pub audio_codec: Option<String>,
    /// Video quality (CRF)
    pub quality: Option<i32>,
    /// Video bitrate
    pub video_bitrate: Option<i32>,
    /// Audio bitrate
    pub audio_bitrate: Option<i32>,
    /// Custom FFmpeg options
    pub custom_options: HashMap<String, String>,
}

impl Editor {
    /// Create a new editor with default options
    pub fn new() -> Self {
        Self {
            ffmpeg_options: FFmpegOptions::new(),
            ffprobe_options: FFprobeOptions::new(),
            session: EditSession::default(),
        }
    }

    /// Set stage configuration
    pub fn set_stage(mut self, stage: Stage) -> Self {
        self.session.stage = stage;
        self
    }

    /// Set ffmpeg options
    pub fn set_ffmpeg_options(mut self, options: FFmpegOptions) -> Self {
        self.ffmpeg_options = options;
        self
    }

    /// Set ffprobe options
    pub fn set_ffprobe_options(mut self, options: FFprobeOptions) -> Self {
        self.ffprobe_options = options;
        self
    }

    /// Load session from cut protocol
    pub fn load_from_protocol(&mut self, protocol: &CutProtocol) -> Result<()> {
        self.session = CutProtocol::to_session(protocol)?;
        Ok(())
    }

    /// Load session from JSON string
    pub fn load_from_json(&mut self, json: &str) -> Result<()> {
        let protocol = CutProtocol::from_json(json)?;
        self.load_from_protocol(&protocol)
    }

    pub fn load_from_file<P: AsRef<Path>>(&mut self, path: P) -> Result<()> {
        let source = path.as_ref();
        if !source.exists() {
            return Err(CutError::file_not_found("Source file does not exist"));
        }
        let content = std::fs::read_to_string(source)?;
        self.load_from_json(&content)
    }

    /// Save session to cut protocol
    pub fn save_to_protocol(&self) -> CutProtocol {
        self.session.to_protocol()
    }

    /// Save session to JSON string
    pub fn save_to_json(&self) -> Result<String> {
        let protocol = self.save_to_protocol();
        protocol.to_json()
    }

    /// Save session to file
    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        let content = self.save_to_json()?;
        std::fs::write(path, content)?;
        Ok(())
    }

    /// Get current editing session
    pub fn session(&self) -> &EditSession {
        &self.session
    }

    /// Get mutable editing session
    pub fn session_mut(&mut self) -> &mut EditSession {
        &mut self.session
    }

    /// ---

    pub async fn add_material(&mut self, src: &str) -> Result<String> {
        let media_info = FFprobe::new()
            .set_options(self.ffprobe_options.clone())
            .input(src)
            .run()
            .await?;

        let mut material = if media_info.is_video() {
            Material::video(src)
        } else if media_info.is_audio() {
            Material::audio(src)
        } else if media_info.is_image() {
            Material::image(src)
        } else {
            return Err(CutError::invalid_params("不支持的格式"));
        };

        // Fill material properties based on media_info (logic from fix_materials)
        match &mut material {
            Material::Video(video) => {
                // Find video stream
                if let Some(video_stream) = media_info
                    .streams
                    .iter()
                    .find(|s| s.codec_type.as_deref() == Some("video"))
                {
                    // Fill dimensions
                    if let (Some(width), Some(height)) = (video_stream.width, video_stream.height) {
                        video.dimension.width = width;
                        video.dimension.height = height;
                    }

                    // Fill frame rate
                    if let Some(r_frame_rate) = &video_stream.r_frame_rate {
                        if let Ok(fps) = Self::parse_fraction_to_float(r_frame_rate) {
                            video.fps = Some(fps);
                        }
                    }

                    // Fill codec
                    video.codec = video_stream.codec_name.clone();

                    // Fill bitrate
                    if let Some(bit_rate) = &video_stream.bit_rate {
                        if let Ok(bitrate) = bit_rate.parse::<u32>() {
                            video.bitrate = Some(bitrate / 1000); // Convert to kbps
                        }
                    }
                }

                // Fill duration
                if let Some(format) = &media_info.format {
                    if let Some(duration_str) = &format.duration {
                        if let Ok(duration_seconds) = duration_str.parse::<f32>() {
                            video.duration = Some((duration_seconds * 1000.0) as u32);
                        }
                    }
                }
            }

            Material::Audio(audio) => {
                // Find audio stream
                if let Some(audio_stream) = media_info
                    .streams
                    .iter()
                    .find(|s| s.codec_type.as_deref() == Some("audio"))
                {
                    // Fill sample rate
                    if let Some(sample_rate_str) = &audio_stream.sample_rate {
                        if let Ok(sample_rate) = sample_rate_str.parse::<u32>() {
                            audio.sample_rate = Some(sample_rate);
                        }
                    }

                    // Fill channels
                    if let Some(channels) = audio_stream.channels {
                        audio.channels = Some(channels as u32);
                    }

                    // Fill codec
                    audio.codec = audio_stream.codec_name.clone();

                    // Fill bitrate
                    if let Some(bit_rate) = &audio_stream.bit_rate {
                        if let Ok(bitrate) = bit_rate.parse::<u32>() {
                            audio.bitrate = Some(bitrate / 1000); // Convert to kbps
                        }
                    }
                }

                // Fill duration
                if let Some(format) = &media_info.format {
                    if let Some(duration_str) = &format.duration {
                        if let Ok(duration_seconds) = duration_str.parse::<f32>() {
                            audio.duration = Some((duration_seconds * 1000.0) as u32);
                        }
                    }
                }
            }

            Material::Image(image) => {
                // Find video stream (images are treated as video streams by ffprobe)
                if let Some(image_stream) = media_info
                    .streams
                    .iter()
                    .find(|s| s.codec_type.as_deref() == Some("video"))
                {
                    // Fill dimensions
                    if let (Some(width), Some(height)) = (image_stream.width, image_stream.height) {
                        image.dimension.width = width;
                        image.dimension.height = height;
                    }

                    // Fill format
                    image.format = image_stream.codec_name.clone();
                }
            }
        }

        let id = material.id().to_string();
        self.session.add_material(material);
        Ok(id)
    }

    /// Add track to the session
    pub fn add_track(&mut self, track: Track) -> String {
        let id = track.id().to_string();
        self.session.add_track(track);
        id
    }

    /// Create and add a video track
    pub fn add_video_track(&mut self) -> String {
        self.add_track(Track::video())
    }

    /// Create and add an audio track
    pub fn add_audio_track(&mut self) -> String {
        self.add_track(Track::audio())
    }

    /// Add segment to track
    pub fn add_segment_to_track(&mut self, track_id: &str, segment: Segment) -> Result<()> {
        if let Some(track) = self.session.get_track_mut(track_id) {
            track.add_segment(segment);
            Ok(())
        } else {
            Err(CutError::invalid_params(format!(
                "Track '{}' not found",
                track_id
            )))
        }
    }

    /// query materials
    pub fn list_materials(&self) -> &Vec<Material> {
        &self.session.materials
    }

    /// query material from materials
    pub fn query_material(&self, material_id: &str) -> Result<&Material> {
        self.session
            .materials
            .iter()
            .find(|m| m.id() == material_id)
            .ok_or_else(|| {
                CutError::invalid_params(format!("Material '{}' not found", material_id))
            })
    }

    /// delete material from materials
    pub fn delete_material(&mut self, material_id: &str) -> Result<()> {
        if let Some(index) = self
            .session
            .materials
            .iter()
            .position(|m| m.id() == material_id)
        {
            self.session.materials.remove(index);
            Ok(())
        } else {
            Err(CutError::invalid_params(format!(
                "Material '{}' not found",
                material_id
            )))
        }
    }

    /// Fix the current session
    pub async fn fix_materials(&mut self) -> Result<()> {
        for material in &mut self.session.materials {
            let media_info = FFprobe::new()
                .set_options(self.ffprobe_options.clone())
                .input(material.src())
                .run()
                .await?;

            // Fill missing fields based on material type
            match material {
                Material::Video(video) => {
                    // Find video stream
                    if let Some(video_stream) = media_info
                        .streams
                        .iter()
                        .find(|s| s.codec_type.as_deref() == Some("video"))
                    {
                        // Fill dimensions if missing
                        if video.dimension.width == 0 || video.dimension.height == 0 {
                            if let (Some(width), Some(height)) =
                                (video_stream.width, video_stream.height)
                            {
                                video.dimension.width = width;
                                video.dimension.height = height;
                            }
                        }

                        // Fill frame rate if missing
                        if video.fps.is_none() {
                            if let Some(r_frame_rate) = &video_stream.r_frame_rate {
                                if let Ok(fps) = Self::parse_fraction_to_float(r_frame_rate) {
                                    video.fps = Some(fps);
                                }
                            }
                        }

                        // Fill codec if missing
                        if video.codec.is_none() {
                            video.codec = video_stream.codec_name.clone();
                        }

                        // Fill bitrate if missing
                        if video.bitrate.is_none() {
                            if let Some(bit_rate) = &video_stream.bit_rate {
                                if let Ok(bitrate) = bit_rate.parse::<u32>() {
                                    video.bitrate = Some(bitrate / 1000); // Convert to kbps
                                }
                            }
                        }
                    }

                    // Fill duration if missing
                    if video.duration.is_none() {
                        if let Some(format) = &media_info.format {
                            if let Some(duration_str) = &format.duration {
                                if let Ok(duration_seconds) = duration_str.parse::<f32>() {
                                    video.duration = Some((duration_seconds * 1000.0) as u32);
                                }
                            }
                        }
                    }
                }

                Material::Audio(audio) => {
                    // Find audio stream
                    if let Some(audio_stream) = media_info
                        .streams
                        .iter()
                        .find(|s| s.codec_type.as_deref() == Some("audio"))
                    {
                        // Fill sample rate if missing
                        if audio.sample_rate.is_none() {
                            if let Some(sample_rate_str) = &audio_stream.sample_rate {
                                if let Ok(sample_rate) = sample_rate_str.parse::<u32>() {
                                    audio.sample_rate = Some(sample_rate);
                                }
                            }
                        }

                        // Fill channels if missing
                        if audio.channels.is_none() {
                            if let Some(channels) = audio_stream.channels {
                                audio.channels = Some(channels as u32);
                            }
                        }

                        // Fill codec if missing
                        if audio.codec.is_none() {
                            audio.codec = audio_stream.codec_name.clone();
                        }

                        // Fill bitrate if missing
                        if audio.bitrate.is_none() {
                            if let Some(bit_rate) = &audio_stream.bit_rate {
                                if let Ok(bitrate) = bit_rate.parse::<u32>() {
                                    audio.bitrate = Some(bitrate / 1000); // Convert to kbps
                                }
                            }
                        }
                    }

                    // Fill duration if missing
                    if audio.duration.is_none() {
                        if let Some(format) = &media_info.format {
                            if let Some(duration_str) = &format.duration {
                                if let Ok(duration_seconds) = duration_str.parse::<f32>() {
                                    audio.duration = Some((duration_seconds * 1000.0) as u32);
                                }
                            }
                        }
                    }
                }

                Material::Image(image) => {
                    // Find video stream (images are treated as video streams by ffprobe)
                    if let Some(image_stream) = media_info
                        .streams
                        .iter()
                        .find(|s| s.codec_type.as_deref() == Some("video"))
                    {
                        // Fill dimensions if missing
                        if image.dimension.width == 0 || image.dimension.height == 0 {
                            if let (Some(width), Some(height)) =
                                (image_stream.width, image_stream.height)
                            {
                                image.dimension.width = width;
                                image.dimension.height = height;
                            }
                        }

                        // Fill format if missing
                        if image.format.is_none() {
                            image.format = image_stream.codec_name.clone();
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Helper function to parse fraction strings like "30/1" to float
    fn parse_fraction_to_float(fraction: &str) -> Result<f32> {
        let parts: Vec<&str> = fraction.split('/').collect();
        if parts.len() == 2 {
            let numerator: f32 = parts[0]
                .parse()
                .map_err(|_| CutError::invalid_params("Invalid numerator in fraction"))?;
            let denominator: f32 = parts[1]
                .parse()
                .map_err(|_| CutError::invalid_params("Invalid denominator in fraction"))?;
            if denominator != 0.0 {
                return Ok(numerator / denominator);
            }
        }
        Err(CutError::invalid_params("Invalid fraction format"))
    }

    /// Validate the current session
    pub fn validate(&self) -> Result<()> {
        self.session.validate()
    }

    /// Convert Cartesian coordinates (origin at center) to FFmpeg coordinates (origin at top-left)
    ///
    /// # Arguments
    /// * `x_cartesian` - X coordinate in Cartesian system (0 at center, represents content center)
    /// * `y_cartesian` - Y coordinate in Cartesian system (0 at center, Y+ is up, represents content center)
    /// * `stage_width` - Width of the stage/canvas
    /// * `stage_height` - Height of the stage/canvas
    /// * `content_width` - Width of the content being positioned
    /// * `content_height` - Height of the content being positioned
    ///
    /// # Returns
    /// Tuple of (x_ffmpeg, y_ffmpeg) where both are FFmpeg coordinates (top-left corner of content)
    fn cartesian_to_ffmpeg_coords(
        x_cartesian: i32,
        y_cartesian: i32,
        stage_width: i32,
        stage_height: i32,
        content_width: i32,
        content_height: i32,
    ) -> (i32, i32) {
        // Convert from center-based coordinates to top-left based coordinates
        // Cartesian: (0,0) is at stage center, (x,y) represents content center
        // FFmpeg: (0,0) is at stage top-left, (x,y) represents content top-left
        let x_ffmpeg = (stage_width - content_width) / 2 + x_cartesian;
        let y_ffmpeg = (stage_height - content_height) / 2 - y_cartesian;
        (x_ffmpeg, y_ffmpeg)
    }

    /// Export video using the built-in composition engine
    pub async fn export(&self, options: ExportOptions) -> Result<()> {
        self.validate()?;

        let mut ffmpeg = FFmpeg::new();
        ffmpeg.set_ffmpeg_options(self.ffmpeg_options.clone());

        // Add inputs for all referenced materials
        let mut material_inputs: HashMap<String, Input> = HashMap::new();
        for track in &self.session.tracks {
            for segment in &track.segments {
                if !material_inputs.contains_key(&segment.material_id) {
                    if let Some(material) = self.session.get_material(&segment.material_id) {
                        let input = ffmpeg.add_input(Input::with_time(
                            segment.source_timerange.start as f32 / 1000.0,
                            segment.source_timerange.duration as f32 / 1000.0,
                            material.src(),
                        ));
                        material_inputs.insert(segment.material_id.clone(), input);
                    }
                }
            }
        }

        // Create stage background
        let mut stage_bg = ffmpeg.add_filter_without_inputs(Filter::color(
            self.session.stage.width,
            self.session.stage.height,
            self.session.total_duration() as f64 / 1000.0,
        ));

        // Process video tracks in reverse order (bottom to top)
        let video_tracks = self.session.video_tracks();
        for track in video_tracks.iter().rev() {
            if !track.enabled {
                continue;
            }

            for segment in &track.segments {
                if let Some(input) = material_inputs.get(&segment.material_id) {
                    let mut f_last_v = input.v();

                    // Apply time-based trimming
                    let target_start = segment.target_timerange.start as f64 / 1000.0;
                    let target_duration = segment.target_timerange.duration as f64 / 1000.0;

                    // 视频流：缩放视频，并获取内容尺寸
                    let (content_width, content_height) = if let Some(scale) = segment.scale {
                        f_last_v =
                            ffmpeg.add_filter(Filter::scale(scale.width, scale.height), [f_last_v]);
                        (scale.width, scale.height)
                    } else {
                        // 如果没有缩放，从素材获取原始尺寸
                        if let Some(material) = self.session.get_material(&segment.material_id) {
                            if let Some(dim) = material.dimensions() {
                                (dim.width, dim.height)
                            } else {
                                (self.session.stage.width, self.session.stage.height)
                            }
                        } else {
                            (self.session.stage.width, self.session.stage.height)
                        }
                    };

                    // 视频流：是否需要倍速
                    if segment.needs_speed_adjustment() {
                        let speed = segment.playback_speed();
                        f_last_v =
                            ffmpeg.add_filter(Filter::setpts(format!("1/{speed}*PTS")), [f_last_v]);
                    }

                    // 视频流：设置本段视频在时间线上的位置
                    f_last_v = ffmpeg
                        .add_filter(Filter::setpts(format!("PTS+{target_start}/TB")), [f_last_v]);

                    // 视频流：合并视频流到主舞台
                    // 将笛卡尔坐标（中心点）转换为FFmpeg坐标（左上角）
                    let x_cartesian = segment.position.map(|p| p.x).unwrap_or(0);
                    let y_cartesian = segment.position.map(|p| p.y).unwrap_or(0);
                    let (x_ffmpeg, y_ffmpeg) = Self::cartesian_to_ffmpeg_coords(
                        x_cartesian,
                        y_cartesian,
                        self.session.stage.width,
                        self.session.stage.height,
                        content_width,
                        content_height,
                    );

                    stage_bg = ffmpeg.add_filter(
                        Filter::overlay_with_enable(
                            x_ffmpeg,
                            y_ffmpeg,
                            format!(
                                "'between(t,{},{})'",
                                target_start,
                                target_start + target_duration
                            ),
                        ),
                        [stage_bg, f_last_v],
                    );
                }
            }
        }

        // Handle audio tracks
        let audio_tracks = self.session.audio_tracks();
        let mut audio_inputs = Vec::new();

        for track in &audio_tracks {
            if !track.enabled || track.muted {
                continue;
            }

            for segment in &track.segments {
                if let Some(input) = material_inputs.get(&segment.material_id) {
                    let mut f_last_a = input.a();

                    // Apply time-based trimming for audio
                    let source_start = segment.source_timerange.start as f64 / 1000.0;
                    let source_duration = segment.source_timerange.duration as f64 / 1000.0;
                    let target_start = segment.target_timerange.start as f64 / 1000.0;
                    let target_duration = segment.target_timerange.duration as f64 / 1000.0;

                    if source_start > 0.0 || source_duration != target_duration {
                        f_last_a = ffmpeg
                            .add_filter(Filter::atrim(source_start, source_duration), [f_last_a]);

                        // Reset audio PTS
                        f_last_a = ffmpeg.add_filter(Filter::asetpts("PTS-STARTPTS"), [f_last_a]);
                    }

                    // Apply speed adjustment for audio
                    if segment.needs_speed_adjustment() {
                        let speed = segment.playback_speed();
                        f_last_a = ffmpeg.add_filter(Filter::atempo(speed), [f_last_a]);
                    }

                    // Add delay for positioning in time
                    if target_start > 0.0 {
                        f_last_a = ffmpeg.add_filter(
                            Filter::with_name("adelay")
                                .param(format!("{}ms", (target_start * 1000.0) as i32)),
                            [f_last_a],
                        );
                    }

                    audio_inputs.push(f_last_a);
                }
            }
        }

        // Mix all audio tracks
        let sound_bg = if audio_inputs.is_empty() {
            ffmpeg.add_filter_without_inputs(Filter::anullsrc(
                self.session.total_duration() as f32 / 1000.0,
            ))
        } else if audio_inputs.len() == 1 {
            audio_inputs[0].clone()
        } else {
            ffmpeg.add_filter(Filter::amix(audio_inputs.len() as i32), audio_inputs)
        };

        // Create output
        let mut output = Output::with_simple(&options.output_file);

        match options.export_type {
            ExportType::Video => {
                output = output
                    .map_stream(stage_bg)
                    .map_stream(sound_bg)
                    .video_codec(VideoCodec::from(
                        options.video_codec.as_deref().unwrap_or("libx264"),
                    ))
                    .audio_codec(AudioCodec::from(
                        options.audio_codec.as_deref().unwrap_or("aac"),
                    ));

                if let Some(quality) = options.quality {
                    output = output.crf(quality);
                }

                if let Some(bitrate) = options.video_bitrate {
                    output = output.video_bitrate(bitrate);
                }

                if let Some(bitrate) = options.audio_bitrate {
                    output = output.audio_bitrate(bitrate);
                }

                output = output.mov_flags("faststart");
            }
            ExportType::Audio => {
                output = output.map_stream(sound_bg).audio_codec(AudioCodec::from(
                    options.audio_codec.as_deref().unwrap_or("mp3"),
                ));

                if let Some(bitrate) = options.audio_bitrate {
                    output = output.audio_bitrate(bitrate);
                }
            }
        }

        ffmpeg.add_output(output);

        ffmpeg.run().await
    }

    /// Export with simple options
    pub async fn simple_export(&self, output_file: &str, export_type: ExportType) -> Result<()> {
        let options = ExportOptions {
            output_file: output_file.to_string(),
            export_type,
            video_codec: None,
            audio_codec: None,
            quality: None,
            video_bitrate: None,
            audio_bitrate: None,
            custom_options: HashMap::new(),
        };

        self.export(options).await
    }

    /// Export as MP4 video
    pub async fn export_mp4(&self, output_file: &str) -> Result<()> {
        self.simple_export(output_file, ExportType::Video).await
    }

    /// Export as MP3 audio
    pub async fn export_mp3(&self, output_file: &str) -> Result<()> {
        self.simple_export(output_file, ExportType::Audio).await
    }
}

impl Default for Editor {
    fn default() -> Self {
        Self::new()
            .set_stage(Stage::new(1280, 720))
            .set_ffmpeg_options(FFmpegOptions::new().debug(true).dry_run(false))
            .set_ffprobe_options(FFprobeOptions::new().debug(true))
    }
}

impl ExportOptions {
    /// Create new export options
    pub fn new<S: Into<String>>(output_file: S, export_type: ExportType) -> Self {
        Self {
            output_file: output_file.into(),
            export_type,
            video_codec: None,
            audio_codec: None,
            quality: None,
            video_bitrate: None,
            audio_bitrate: None,
            custom_options: HashMap::new(),
        }
    }

    /// Set video codec
    pub fn with_video_codec<S: Into<String>>(mut self, codec: S) -> Self {
        self.video_codec = Some(codec.into());
        self
    }

    /// Set audio codec
    pub fn with_audio_codec<S: Into<String>>(mut self, codec: S) -> Self {
        self.audio_codec = Some(codec.into());
        self
    }

    /// Set quality (CRF)
    pub fn with_quality(mut self, quality: i32) -> Self {
        self.quality = Some(quality);
        self
    }

    /// Set video bitrate
    pub fn with_video_bitrate(mut self, bitrate: i32) -> Self {
        self.video_bitrate = Some(bitrate);
        self
    }

    /// Set audio bitrate
    pub fn with_audio_bitrate(mut self, bitrate: i32) -> Self {
        self.audio_bitrate = Some(bitrate);
        self
    }

    /// Add custom option
    pub fn with_custom_option<K: Into<String>, V: Into<String>>(
        mut self,
        key: K,
        value: V,
    ) -> Self {
        self.custom_options.insert(key.into(), value.into());
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cartesian_to_ffmpeg_coords_center() {
        // 舞台: 1920x1080, 内容: 640x360
        // 笛卡尔坐标 (0, 0) 在舞台中心，表示内容中心
        // FFmpeg 坐标应该是 (640, 360)，表示内容左上角
        // 计算: x = (1920-640)/2 + 0 = 640, y = (1080-360)/2 - 0 = 360
        let (x, y) = Editor::cartesian_to_ffmpeg_coords(0, 0, 1920, 1080, 640, 360);
        assert_eq!((x, y), (640, 360));
    }

    #[test]
    fn test_cartesian_to_ffmpeg_coords_top_center() {
        // 舞台: 1920x1080, 内容: 640x360
        // 笛卡尔坐标 (0, 360) 在顶部中心
        // FFmpeg 坐标应该是 (640, 0)
        // 计算: x = 640 + 0 = 640, y = 360 - 360 = 0
        let (x, y) = Editor::cartesian_to_ffmpeg_coords(0, 360, 1920, 1080, 640, 360);
        assert_eq!((x, y), (640, 0));
    }

    #[test]
    fn test_cartesian_to_ffmpeg_coords_bottom_center() {
        // 舞台: 1920x1080, 内容: 640x360
        // 笛卡尔坐标 (0, -360) 在底部中心
        // FFmpeg 坐标应该是 (640, 720)
        // 计算: x = 640 + 0 = 640, y = 360 - (-360) = 720
        let (x, y) = Editor::cartesian_to_ffmpeg_coords(0, -360, 1920, 1080, 640, 360);
        assert_eq!((x, y), (640, 720));
    }

    #[test]
    fn test_cartesian_to_ffmpeg_coords_left_center() {
        // 舞台: 1920x1080, 内容: 640x360
        // 笛卡尔坐标 (-640, 0) 在左侧中心
        // FFmpeg 坐标应该是 (0, 360)
        // 计算: x = 640 + (-640) = 0, y = 360 - 0 = 360
        let (x, y) = Editor::cartesian_to_ffmpeg_coords(-640, 0, 1920, 1080, 640, 360);
        assert_eq!((x, y), (0, 360));
    }

    #[test]
    fn test_cartesian_to_ffmpeg_coords_right_center() {
        // 舞台: 1920x1080, 内容: 640x360
        // 笛卡尔坐标 (640, 0) 在右侧中心
        // FFmpeg 坐标应该是 (1280, 360)
        // 计算: x = 640 + 640 = 1280, y = 360 - 0 = 360
        let (x, y) = Editor::cartesian_to_ffmpeg_coords(640, 0, 1920, 1080, 640, 360);
        assert_eq!((x, y), (1280, 360));
    }

    #[test]
    fn test_cartesian_to_ffmpeg_coords_top_left() {
        // 舞台: 1920x1080, 内容: 640x360
        // 笛卡尔坐标 (-640, 360) 在左上角
        // FFmpeg 坐标应该是 (0, 0)
        // 计算: x = 640 + (-640) = 0, y = 360 - 360 = 0
        let (x, y) = Editor::cartesian_to_ffmpeg_coords(-640, 360, 1920, 1080, 640, 360);
        assert_eq!((x, y), (0, 0));
    }

    #[test]
    fn test_cartesian_to_ffmpeg_coords_bottom_right() {
        // 舞台: 1920x1080, 内容: 640x360
        // 笛卡尔坐标 (640, -360) 在右下角
        // FFmpeg 坐标应该是 (1280, 720)
        // 计算: x = 640 + 640 = 1280, y = 360 - (-360) = 720
        let (x, y) = Editor::cartesian_to_ffmpeg_coords(640, -360, 1920, 1080, 640, 360);
        assert_eq!((x, y), (1280, 720));
    }

    #[test]
    fn test_cartesian_to_ffmpeg_coords_fullscreen() {
        // 舞台: 1920x1080, 内容占满整个舞台: 1920x1080
        // 笛卡尔坐标 (0, 0) 在中心
        // FFmpeg 坐标应该是 (0, 0)，内容左上角对齐舞台左上角
        let (x, y) = Editor::cartesian_to_ffmpeg_coords(0, 0, 1920, 1080, 1920, 1080);
        assert_eq!((x, y), (0, 0));
    }
}
