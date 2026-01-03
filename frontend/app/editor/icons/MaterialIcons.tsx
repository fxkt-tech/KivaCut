/**
 * Material Icons
 * SVG icons for material/resource types
 * Designed specifically for resource/media representation
 */

interface IconProps {
  size?: number;
  className?: string;
}

export function VideoIcon({ size = 16, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M2 4a1 1 0 011-1h14a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" />
      <path d="M8 7l5 3-5 3V7z" fill="white" />
    </svg>
  );
}

export function AudioIcon({ size = 16, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* 八分音符 - 饱满样式 */}

      {/* 第一个音符头 - 实心椭圆，饱满圆润 */}
      <ellipse
        cx="7"
        cy="17.5"
        rx="2.5"
        ry="3"
        fill="currentColor"
        transform="rotate(-20 7 17.5)"
      />

      {/* 第一个音符茎 - 粗壮的竖线 */}
      <rect
        x="8.8"
        y="6"
        width="1.5"
        height="11.5"
        fill="currentColor"
        rx="0.75"
      />

      {/* 第二个音符头 - 实心椭圆，饱满圆润 */}
      <ellipse
        cx="15"
        cy="15.5"
        rx="2.5"
        ry="3"
        fill="currentColor"
        transform="rotate(-20 15 15.5)"
      />

      {/* 第二个音符茎 - 粗壮的竖线 */}
      <rect
        x="16.8"
        y="4"
        width="1.5"
        height="11.5"
        fill="currentColor"
        rx="0.75"
      />

      {/* 连接横梁 - 饱满的梁 */}
      <path
        d="M8.8 6.5 C12 5.5 15 4.2 18.3 4.2 L18.3 6 C15 6 12 7.3 8.8 8.3 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ImageIcon({ size = 16, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="2" y="3" width="16" height="14" rx="1" />
      <circle cx="6" cy="7" r="1.5" fill="white" />
      <path
        d="M2 15l5-5 3 3 8-8"
        stroke="white"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
