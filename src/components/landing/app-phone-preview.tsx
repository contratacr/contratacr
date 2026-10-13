"use client";

import { useId } from "react";

type Point = [number, number];
const WIDTH = 588;
const HEIGHT = 1278;

// Four measured glass corners in the 1200×800 photograph. SVG triangles keep
// this perspective consistent in Safari too: its foreignObject + matrix3d
// rendering offsets the image even when Chromium renders it correctly.
function project([x, y]: Point): Point {
  const denominator = 1 + 0.00003852971823263108 * x - 0.00004765179820385138 * y;
  return [(0.3779112962993665 * x - 0.1600638733263074 * y + 645) / denominator,
    (0.1379594170008467 * x + 0.33013498447131934 * y + 150) / denominator];
}

function affine(source: Point[], destination: Point[]) {
  const [s0, s1, s2] = source, [p0, p1, p2] = destination;
  const x1 = s1[0] - s0[0], y1 = s1[1] - s0[1], x2 = s2[0] - s0[0], y2 = s2[1] - s0[1];
  const u1 = p1[0] - p0[0], v1 = p1[1] - p0[1], u2 = p2[0] - p0[0], v2 = p2[1] - p0[1];
  const determinant = x1 * y2 - x2 * y1;
  const a = (u1 * y2 - u2 * y1) / determinant, c = (x1 * u2 - x2 * u1) / determinant;
  const b = (v1 * y2 - v2 * y1) / determinant, d = (x1 * v2 - x2 * v1) / determinant;
  return `matrix(${a},${b},${c},${d},${p0[0] - a * s0[0] - c * s0[1]},${p0[1] - b * s0[0] - d * s0[1]})`;
}

const triangles: Point[][] = [];
for (let row = 0; row < 4; row++) for (let column = 0; column < 2; column++) {
  const x = column * WIDTH / 2, y = row * HEIGHT / 4;
  const tl: Point = [x, y], tr: Point = [x + WIDTH / 2, y], bl: Point = [x, y + HEIGHT / 4], br: Point = [x + WIDTH / 2, y + HEIGHT / 4];
  triangles.push([tl, tr, br], [tl, br, bl]);
}
const round = 60;
const p = (x: number, y: number) => project([x, y]).join(",");
const glass = `M${p(round, 0)} L${p(WIDTH - round, 0)} Q${p(WIDTH, 0)} ${p(WIDTH, round)} L${p(WIDTH, HEIGHT - round)} Q${p(WIDTH, HEIGHT)} ${p(WIDTH - round, HEIGHT)} L${p(round, HEIGHT)} Q${p(0, HEIGHT)} ${p(0, HEIGHT - round)} L${p(0, round)} Q${p(0, 0)} ${p(round, 0)} Z`;

export function AppPhonePreview() {
  const id = useId().replaceAll(":", "");
  return <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1200 800" aria-hidden="true" data-testid="app-phone-screen">
    <defs>
      <image id={`${id}-capture`} href="/guia/profesionales.jpg" width={WIDTH} height={HEIGHT} />
      <clipPath id={`${id}-glass`}><path d={glass} /></clipPath>
      <linearGradient id={`${id}-reflection`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="white" stopOpacity=".06" /><stop offset=".5" stopColor="white" stopOpacity="0" /><stop offset="1" stopColor="black" stopOpacity=".08" /></linearGradient>
      {triangles.map((source, index) => {
        const points = source.map(project);
        const center = points.reduce((sum, point) => [sum[0] + point[0] / 3, sum[1] + point[1] / 3] as Point, [0, 0] as Point);
        // A subpixel overlap prevents antialiased seams between the tiles.
        const clip = points.map(([x, y]) => [center[0] + (x - center[0]) * 1.02, center[1] + (y - center[1]) * 1.02]);
        return <clipPath key={index} id={`${id}-tile-${index}`}><polygon points={clip.map(point => point.join(",")).join(" ")} /></clipPath>;
      })}
    </defs>
    <g clipPath={`url(#${id}-glass)`}>
      {triangles.map((source, index) => <g key={index} clipPath={`url(#${id}-tile-${index})`}><use href={`#${id}-capture`} transform={affine(source, source.map(project))} /></g>)}
      <path d={glass} fill={`url(#${id}-reflection)`} />
    </g>
  </svg>;
}
