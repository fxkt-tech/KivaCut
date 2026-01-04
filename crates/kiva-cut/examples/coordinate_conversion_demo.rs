//! Coordinate System Conversion Demo
//!
//! This example demonstrates the coordinate system conversion between
//! Cartesian coordinates (used in frontend) and FFmpeg coordinates (used in export).
//!
//! Cartesian: Origin at stage center, (x,y) represents content center
//! FFmpeg: Origin at top-left, (x,y) represents content top-left corner
//!
//! Run with: cargo run --package kiva-cut --example coordinate_conversion_demo

use kiva_cut::{
    cut::{
        editor::Editor,
        material::{Dimension, Material, VideoMaterial},
        segment::{Position, Segment, TimeRange},
        stage::Stage,
        track::Track,
    },
    error::Result,
};

#[tokio::main]
async fn main() -> Result<()> {
    println!("=== Coordinate System Conversion Demo ===\n");
    println!("This demo shows how Cartesian coordinates (frontend) are converted");
    println!("to FFmpeg coordinates (export) for proper video overlay positioning.\n");

    // Create stage (1920x1080 - Full HD)
    let stage = Stage::new(1920, 1080);
    println!("Stage: {}x{} (Full HD)\n", stage.width, stage.height);

    // Create editor
    let mut editor = Editor::new().set_stage(stage);

    // Add a video material (640x360 content)
    let video_material = Material::Video(VideoMaterial {
        id: "video1".to_string(),
        src: "test_video.mp4".to_string(),
        dimension: Dimension {
            width: 640,
            height: 360,
        },
        duration: Some(10000),
        fps: Some(30.0),
        codec: Some("h264".to_string()),
        bitrate: Some(5000),
    });
    editor.session_mut().add_material(video_material);

    println!("Content: 640x360\n");
    println!("=== Coordinate System Explanation ===\n");
    println!("Cartesian (Frontend):");
    println!("  - Origin (0,0) at STAGE CENTER");
    println!("  - X+ goes right, Y+ goes up");
    println!("  - (x,y) represents CONTENT CENTER position\n");
    println!("FFmpeg (Export):");
    println!("  - Origin (0,0) at TOP-LEFT corner");
    println!("  - X+ goes right, Y+ goes down");
    println!("  - (x,y) represents CONTENT TOP-LEFT corner\n");

    println!("=== Coordinate Conversion Examples ===\n");

    // Create test cases with different positions
    let test_cases = vec![
        (0, 0, "Center (content center at stage center)"),
        (0, 360, "Top Center (content touching top edge)"),
        (0, -360, "Bottom Center (content touching bottom edge)"),
        (-640, 0, "Left Center (content touching left edge)"),
        (640, 0, "Right Center (content touching right edge)"),
        (-640, 360, "Top-Left Corner (content at top-left)"),
        (640, -360, "Bottom-Right Corner (content at bottom-right)"),
        (100, 150, "Custom Position (offset from center)"),
    ];

    // Add track
    let mut track = Track::video();

    for (idx, (x_cartesian, y_cartesian, description)) in test_cases.iter().enumerate() {
        // Create segment with Cartesian coordinates (as frontend would)
        let mut segment = Segment::video(
            "video1",
            TimeRange::new((idx * 2000) as u32, 2000),
            TimeRange::new(0, 2000),
        );

        // Set scale (content size)
        segment.scale = Some(Dimension::new(640, 360));

        // Set position in Cartesian coordinates (frontend coordinate system)
        segment.position = Some(Position::new(*x_cartesian, *y_cartesian));

        track.add_segment(segment);

        // Calculate what FFmpeg coordinates would be
        // Formula: x_ffmpeg = (stage_width - content_width) / 2 + x_cartesian
        //          y_ffmpeg = (stage_height - content_height) / 2 - y_cartesian
        let x_ffmpeg = (1920 - 640) / 2 + x_cartesian;
        let y_ffmpeg = (1080 - 360) / 2 - y_cartesian;

        println!("{}. {}", idx + 1, description);
        println!(
            "   Cartesian (content center): ({:>5}, {:>5})",
            x_cartesian, y_cartesian
        );
        println!(
            "   FFmpeg (top-left corner):   ({:>5}, {:>5})",
            x_ffmpeg, y_ffmpeg
        );
        println!(
            "   Calculation: x = (1920-640)/2 + {} = {}",
            x_cartesian, x_ffmpeg
        );
        println!(
            "                y = (1080-360)/2 - {} = {}",
            y_cartesian, y_ffmpeg
        );
        println!();
    }

    editor.session_mut().add_track(track);

    // Convert to protocol
    let protocol = editor.save_to_protocol();

    println!("=== Protocol Representation ===\n");
    println!("The protocol.json file stores positions in Cartesian coordinates:");
    println!("(This is what gets saved and loaded by the frontend)\n");

    for (idx, segment) in protocol.tracks[0].segments.iter().enumerate() {
        if let Some(pos) = &segment.position {
            println!(
                "Segment {}: position: {{ x: {:>5}, y: {:>5} }}  (content center)",
                idx + 1,
                pos.x,
                pos.y
            );
        }
    }

    println!("\n=== Coordinate System Visualization ===\n");
    print_coordinate_systems();

    println!("\n=== Export Behavior ===\n");
    println!("When exporting video:");
    println!("1. Editor reads Cartesian coordinates from protocol (content center)");
    println!("2. Converts them to FFmpeg coordinates (content top-left) using:");
    println!("   x_ffmpeg = (stage_width - content_width) / 2 + x_cartesian");
    println!("   y_ffmpeg = (stage_height - content_height) / 2 - y_cartesian");
    println!("3. Passes FFmpeg coordinates to overlay filter");
    println!("4. FFmpeg renders content at correct position\n");

    println!("=== Why This Coordinate System? ===\n");
    println!("✓ Origin at center:");
    println!("  - Symmetric coordinates (-x and +x are mirrored)");
    println!("  - Center alignment is simple: just set (0, 0)");
    println!("  - More intuitive for physics and math (up is +Y)\n");
    println!("✓ Position represents content center:");
    println!("  - Rotation naturally happens around content center");
    println!("  - Scaling keeps center point fixed");
    println!("  - Easier to reason about alignment\n");
    println!("✓ Conversion happens automatically during export:");
    println!("  - Protocol always stores Cartesian coordinates");
    println!("  - FFmpeg gets properly converted coordinates");
    println!("  - No user intervention needed\n");

    println!("=== Validation ===");
    match protocol.validate() {
        Ok(_) => println!("✓ Protocol is valid"),
        Err(e) => println!("✗ Protocol validation failed: {}", e),
    }

    println!("\n=== Demo Complete ===");

    Ok(())
}

fn print_coordinate_systems() {
    println!("Cartesian (Frontend)            FFmpeg (Export)");
    println!("Origin: Stage Center            Origin: Top-Left");
    println!("Coords: Content Center          Coords: Content Top-Left");
    println!();
    println!("        Y+                           (0,0)");
    println!("        ↑                              ↓ Y+");
    println!("     540│                              0 ┌──────────┐");
    println!("        │                                │          │");
    println!("     360│    ●(0,360)                360 │  ●       │ (640,360)");
    println!("        │                                │          │");
    println!(" ───640─┼────0────640─→ X+              │          │");
    println!("        │                                │          │");
    println!("    -360│    ●(0,-360)               720 │  ●       │ (640,720)");
    println!("        │                                │          │");
    println!("    -540│                             1080└──────────┘");
    println!("                                          0   640   1280");
    println!("                                               ──→ X+");
    println!();
    println!("Example: Cartesian (0, 0) → FFmpeg (640, 360)");
    println!("Content center at stage center → Content top-left at (640, 360)");
    println!();
    println!("Key Points:");
    println!("  • Cartesian (0,0) = Stage center, Content center");
    println!("  • FFmpeg (640,360) = Content top-left for centered content");
    println!("  • Stage: 1920×1080, Content: 640×360");
}
