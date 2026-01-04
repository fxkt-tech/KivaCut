//! Example demonstrating that scale and position are always present in protocol
//! This verifies the fix for missing width/height information in clip segments

use kiva_cut::{
    cut::{
        editor::Editor,
        material::{Dimension, ImageMaterial, Material, VideoMaterial},
        protocol::CutProtocol,
        segment::{Segment, TimeRange},
        stage::Stage,
        track::Track,
    },
    error::Result,
};

#[tokio::main]
async fn main() -> Result<()> {
    println!("=== Testing Scale and Position Always Present in Protocol ===\n");

    // Create a new editor with stage
    let mut editor = Editor::new().set_stage(Stage::new(1920, 1080));

    // Add video material
    let video_material = Material::Video(VideoMaterial {
        id: "video1".to_string(),
        src: "test.mp4".to_string(),
        dimension: Dimension {
            width: 1920,
            height: 1080,
        },
        duration: Some(10000), // 10 seconds
        fps: Some(30.0),
        codec: Some("h264".to_string()),
        bitrate: Some(5000),
    });
    editor.session_mut().add_material(video_material);

    // Add image material
    let image_material = Material::Image(ImageMaterial {
        id: "image1".to_string(),
        src: "test.jpg".to_string(),
        dimension: Dimension {
            width: 3840,
            height: 2160,
        },
        format: Some("jpeg".to_string()),
    });
    editor.session_mut().add_material(image_material);

    // Add a video track with segments
    let mut video_track = Track::video();

    // Case 1: Segment WITHOUT explicit scale (should get scale from material)
    let segment1 = Segment::video("video1", TimeRange::new(0, 5000), TimeRange::new(0, 5000));
    video_track.add_segment(segment1);

    // Case 2: Segment WITH explicit scale (custom size)
    let mut segment2 = Segment::video(
        "video1",
        TimeRange::new(5000, 5000),
        TimeRange::new(5000, 5000),
    );
    segment2.scale = Some(Dimension::new(1280, 720)); // Scaled down
    segment2.position = Some(kiva_cut::cut::segment::Position::new(100, 100));
    video_track.add_segment(segment2);

    // Case 3: Image segment without scale (should get scale from material)
    let segment3 = Segment::image(
        "segment3",
        "image1",
        TimeRange::new(10000, 3000),
        TimeRange::new(0, 3000),
    );
    video_track.add_segment(segment3);

    editor.session_mut().add_track(video_track);

    // Convert to protocol
    let protocol = editor.save_to_protocol();

    println!("Protocol tracks: {}", protocol.tracks.len());
    println!();

    // Verify that all segments have scale and position
    for (track_idx, track) in protocol.tracks.iter().enumerate() {
        println!("Track {} ({})", track_idx, track.track_type);
        println!("  Segments: {}", track.segments.len());

        for (seg_idx, segment) in track.segments.iter().enumerate() {
            println!("\n  Segment {} (ID: {})", seg_idx, segment.id);
            println!("    Type: {}", segment.segment_type);
            println!("    Material ID: {}", segment.material_id);

            // Check scale
            match &segment.scale {
                Some(scale) => {
                    println!("    ✓ Scale: {}x{} (PRESENT)", scale.width, scale.height);
                }
                None => {
                    println!("    ✗ Scale: MISSING (This should not happen!)");
                }
            }

            // Check position
            match &segment.position {
                Some(pos) => {
                    println!("    ✓ Position: ({}, {}) (PRESENT)", pos.x, pos.y);
                }
                None => {
                    println!("    ✗ Position: MISSING (This should not happen!)");
                }
            }
        }
        println!();
    }

    // Verify JSON serialization
    let json = protocol.to_json()?;
    println!("\n=== Protocol JSON ===");

    // Pretty print relevant parts
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&json) {
        if let Some(tracks) = value.get("tracks") {
            if let Some(tracks_array) = tracks.as_array() {
                for (idx, track) in tracks_array.iter().enumerate() {
                    if let Some(segments) = track.get("segments") {
                        if let Some(segments_array) = segments.as_array() {
                            for (seg_idx, segment) in segments_array.iter().enumerate() {
                                println!("\nTrack {} Segment {}:", idx, seg_idx);

                                if let Some(scale) = segment.get("scale") {
                                    println!("  scale: {}", scale);
                                } else {
                                    println!("  scale: null (MISSING!)");
                                }

                                if let Some(position) = segment.get("position") {
                                    println!("  position: {}", position);
                                } else {
                                    println!("  position: null (MISSING!)");
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Verify conversion back to session
    println!("\n=== Testing Round-trip Conversion ===");
    let session = CutProtocol::to_session(&protocol)?;
    println!("✓ Protocol successfully converted back to EditSession");
    println!("  Materials: {}", session.materials.len());
    println!("  Tracks: {}", session.tracks.len());

    // Final validation
    println!("\n=== Validation ===");
    match protocol.validate() {
        Ok(_) => println!("✓ Protocol is valid"),
        Err(e) => println!("✗ Protocol validation failed: {}", e),
    }

    println!("\n=== Test Complete ===");
    println!("Expected: All segments should have scale and position fields");
    println!("Result: Check the output above for ✓ (PRESENT) markers");

    Ok(())
}
