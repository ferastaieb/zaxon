"use client";

import { useEffect, useRef } from "react";

export function CanvasBackdrop({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrame = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      width = parent.clientWidth;
      height = parent.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(15, 23, 42, 0.08)";
      const grid = 44;
      const offset = (time / 60) % grid;
      for (let x = 0; x < width; x += grid) {
        for (let y = 0; y < height; y += grid) {
          ctx.beginPath();
          ctx.arc(x + offset, y + offset, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.strokeStyle = "rgba(56, 189, 248, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const wave = Math.sin(time / 900) * 14;
      ctx.moveTo(0, height * 0.35 + wave);
      ctx.bezierCurveTo(
        width * 0.35,
        height * 0.2 - wave,
        width * 0.65,
        height * 0.5 + wave,
        width,
        height * 0.35 - wave,
      );
      ctx.stroke();
    };

    const animate = (time: number) => {
      draw(time);
      animationFrame = window.requestAnimationFrame(animate);
    };

    resize();
    animationFrame = window.requestAnimationFrame(animate);
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className ?? "absolute inset-0 -z-10 h-full w-full"}
      aria-hidden="true"
    />
  );
}
