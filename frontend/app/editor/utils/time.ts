/**
 * Time Utility Functions
 * Helpers for time formatting and manipulation
 */

/**
 * Format seconds to MM:SS or HH:MM:SS format
 * @param seconds - Time in seconds
 * @param format - Time display format: "milliseconds" or "frames"
 * @param fps - Frames per second (default 30, used when format is "frames")
 * @returns Formatted time string
 */
export function formatTime(
  seconds: number,
  format: "milliseconds" | "frames" = "milliseconds",
  fps: number = 30,
): string {
  if (!isFinite(seconds) || seconds < 0) {
    return format === "frames" ? "00:00:00.00" : "00:00:00.000";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

  if (format === "frames") {
    // Convert remaining milliseconds to frames
    const frames = Math.floor(((seconds % 1) * 1000 * fps) / 1000);
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${frames.toString().padStart(2, "0")}`;
  }

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
}

/**
 * Parse time string (MM:SS or HH:MM:SS) to seconds
 * @param timeString - Time string to parse
 * @returns Time in seconds
 */
export function parseTime(timeString: string): number {
  const [timePart, millisecondPart] = timeString.split(".");
  const parts = timePart.split(":").map((part) => parseInt(part, 10));
  const milliseconds = millisecondPart ? parseInt(millisecondPart, 10) : 0;

  if (parts.length === 2) {
    // MM:SS format
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds + milliseconds / 1000;
  } else if (parts.length === 3) {
    // HH:MM:SS format
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
  }

  return 0;
}

/**
 * Get duration string from video element
 * @param video - HTMLVideoElement
 * @returns Formatted duration string or null if not available
 */
export function getVideoDuration(video: HTMLVideoElement): string | null {
  if (!video.duration || !isFinite(video.duration)) {
    return null;
  }
  return formatTime(video.duration);
}

/**
 * Get current time string from video element
 * @param video - HTMLVideoElement
 * @returns Formatted current time string
 */
export function getVideoCurrentTime(video: HTMLVideoElement): string {
  if (!video.currentTime || !isFinite(video.currentTime)) {
    return "00:00:00.000";
  }
  return formatTime(video.currentTime);
}

/**
 * Format time with duration (current / total)
 * @param currentTime - Current time in seconds
 * @param duration - Total duration in seconds
 * @returns Formatted time string like "01:23 / 05:45"
 */
export function formatTimeWithDuration(
  currentTime: number,
  duration: number,
): string {
  const current = formatTime(currentTime);
  const total = formatTime(duration);
  return `${current} / ${total}`;
}
