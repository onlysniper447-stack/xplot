"use client";

import { useEffect, useRef } from "react";

type Node = { x: number; y: number; vx: number; vy: number };

/** Faint nodes and connecting lines. Stops when motion is reduced or the tab is hidden. */
export function DataField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");

    const nodes: Node[] = Array.from({ length: 16 }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.012,
      vy: (Math.random() - 0.5) * 0.01,
    }));

    let frame = 0;
    let width = 0;
    let height = 0;
    let running = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const paint = (dt: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const node of nodes) {
        node.x += node.vx * dt;
        node.y += node.vy * dt;
        if (node.x <= 0 || node.x >= 1) node.vx *= -1;
        if (node.y <= 0 || node.y >= 1) node.vy *= -1;
        node.x = Math.min(1, Math.max(0, node.x));
        node.y = Math.min(1, Math.max(0, node.y));
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = (nodes[i].x - nodes[j].x) * width;
          const dy = (nodes[i].y - nodes[j].y) * height;
          const dist = Math.hypot(dx, dy);
          if (dist > 220) continue;
          ctx.strokeStyle = `rgba(255, 128, 0, ${0.18 * (1 - dist / 220)})`;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x * width, nodes[i].y * height);
          ctx.lineTo(nodes[j].x * width, nodes[j].y * height);
          ctx.stroke();
        }
      }
      ctx.fillStyle = "rgba(32, 35, 32, 0.35)";
      for (const node of nodes) {
        ctx.beginPath();
        ctx.arc(node.x * width, node.y * height, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let last = performance.now();
    const tick = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      paint(dt);
      frame = requestAnimationFrame(tick);
    };

    const sync = () => {
      const allow = !media.matches && document.visibilityState === "visible";
      if (allow && !running) {
        running = true;
        last = performance.now();
        frame = requestAnimationFrame(tick);
      } else if (!allow && running) {
        running = false;
        cancelAnimationFrame(frame);
      }
      if (!allow) ctx.clearRect(0, 0, width, height);
    };

    resize();
    sync();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", sync);
    media.addEventListener("change", sync);
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", sync);
      media.removeEventListener("change", sync);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 h-dvh w-full opacity-40"
    />
  );
}
