"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useSyncExternalStore } from "react";

const palette = {
  dark: [[28, 55, 112], [78, 55, 137], [155, 52, 133], [210, 94, 65]],
  light: [[101, 137, 198], [151, 124, 188], [198, 125, 170], [221, 166, 112]],
};

function colorAt(colors: number[][], value: number, alpha: number) {
  const scaled = ((value % 1) + 1) % 1 * (colors.length - 1);
  const index = Math.min(Math.floor(scaled), colors.length - 2);
  const mix = scaled - index;
  const red = Math.round(colors[index][0] + (colors[index + 1][0] - colors[index][0]) * mix);
  const green = Math.round(colors[index][1] + (colors[index + 1][1] - colors[index][1]) * mix);
  const blue = Math.round(colors[index][2] + (colors[index + 1][2] - colors[index][2]) * mix);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function ParticleWaveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedAtRef = useRef<number | null>(null);
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const dark = resolvedTheme === "dark";
    const colors = dark ? palette.dark : palette.light;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    let frame = 0;
    let width = 0;
    let height = 0;
    startedAtRef.current ??= performance.now();
    const startedAt = startedAtRef.current;
    let lastFrameAt = 0;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.round(width * ratio);
      canvas!.height = Math.round(height * ratio);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw(performance.now());
    }

    function draw(now: number) {
      if (!width || !height) return;
      const phase = reducedMotion ? 0.85 : ((now - startedAt) / 48_000) * Math.PI * 2;
      const spacing = width < 640 ? 30 : 38;
      const rows = Math.ceil(height / spacing) + 5;
      context!.clearRect(0, 0, width, height);
      context!.lineWidth = 0.75;

      for (let row = -2; row < rows; row += 1) {
        const baseY = row * spacing;
        const rowRatio = row / rows;
        context!.beginPath();
        for (let x = -spacing; x <= width + spacing; x += spacing) {
          const wave = Math.sin(x / 230 + phase + row * 0.28) * (24 + rowRatio * 12)
            + Math.sin(x / 105 - phase * 0.72 + row * 0.12) * 10;
          const y = baseY + wave + Math.sin(phase + row * 0.2) * 12;
          if (x === -spacing) context!.moveTo(x, y);
          else context!.lineTo(x, y);
        }
        const edgeFade = Math.max(0.15, 1 - Math.abs(rowRatio - 0.5));
        context!.strokeStyle = colorAt(colors, rowRatio * 0.42 + phase / (Math.PI * 2) * 0.12, (dark ? 0.36 : 0.28) * edgeFade);
        context!.stroke();

        for (let x = -spacing; x <= width + spacing; x += spacing) {
          const wave = Math.sin(x / 230 + phase + row * 0.28) * (24 + rowRatio * 12)
            + Math.sin(x / 105 - phase * 0.72 + row * 0.12) * 10;
          const y = baseY + wave + Math.sin(phase + row * 0.2) * 12;
          const colorValue = x / Math.max(width, 1) * 0.68 + rowRatio * 0.32;
          const emphasis = 0.5 + 0.5 * Math.sin(x / 170 - phase + row * 0.4);
          context!.beginPath();
          context!.arc(x, y, dark ? 0.8 + emphasis * 0.85 : 0.75 + emphasis * 0.65, 0, Math.PI * 2);
          context!.fillStyle = colorAt(colors, colorValue, (dark ? 0.72 : 0.5) * edgeFade);
          context!.fill();
        }
      }
    }

    function animate(now: number) {
      if (document.visibilityState === "visible" && now - lastFrameAt >= 33) {
        draw(now);
        lastFrameAt = now;
      }
      frame = window.requestAnimationFrame(animate);
    }

    function updateMotion() {
      reducedMotion = motionQuery.matches;
      canvas!.dataset.motion = reducedMotion ? "static" : "animated";
      window.cancelAnimationFrame(frame);
      if (!reducedMotion && document.visibilityState === "visible") {
        lastFrameAt = 0;
        frame = window.requestAnimationFrame(animate);
      } else {
        draw(performance.now());
      }
    }

    resize();
    updateMotion();
    window.addEventListener("resize", resize);
    motionQuery.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateMotion);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      motionQuery.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateMotion);
    };
  }, [resolvedTheme]);

  return (
    <div className="particle-wave" data-theme={mounted ? resolvedTheme ?? "system" : "system"} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
