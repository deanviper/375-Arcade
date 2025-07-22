'use client';

export default function BlurredPreview() {
  return (
    <div
      style={{
        width: 300,
        height: 600,
        background:
          'repeating-linear-gradient(0deg, #444, #444 20px, #555 20px, #555 40px)',
        filter: 'blur(8px)',
        opacity: 0.6,
        margin: 'auto',
        pointerEvents: 'none',
      }}
    />
  );
}
