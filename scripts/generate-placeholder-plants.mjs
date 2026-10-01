// 실제 식물 이미지가 오기 전까지 쓰는 임시 성장 단계 그림(투명 배경 512×512)을 만든다.
// 사용자가 제공한 이미지로 같은 경로의 파일을 덮어쓰면 된다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png.mjs';

const SIZE = 512;
const OUT_DIR = fileURLToPath(new URL('../apps/app/assets/plants/', import.meta.url));

const PLANTS = {
  monstera: { leaf: '#3E7651', flower: null },
  rose: { leaf: '#4F7A4B', flower: '#C6667E' },
  sunflower: { leaf: '#5B7F3A', flower: '#D8AA32' },
  tulip: { leaf: '#4E7C55', flower: '#CB7F98' },
  lavender: { leaf: '#5E7F5A', flower: '#8873B2' },
  _default: { leaf: '#6B8F71', flower: '#B9C7B4' },
};

const POT = '#B07A54';
const SOIL = '#6E4B33';

function hex(color) {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}

function canvas() {
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  const set = (x, y, rgba) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    pixels.set(rgba, (y * SIZE + x) * 4);
  };
  return {
    pixels,
    rect(x0, y0, x1, y1, color) {
      const rgba = hex(color);
      for (let y = Math.round(y0); y < y1; y += 1) for (let x = Math.round(x0); x < x1; x += 1) set(x, y, rgba);
    },
    ellipse(cx, cy, rx, ry, color) {
      const rgba = hex(color);
      for (let y = Math.floor(cy - ry); y <= cy + ry; y += 1) {
        for (let x = Math.floor(cx - rx); x <= cx + rx; x += 1) {
          if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(x, y, rgba);
        }
      }
    },
    trapezoid(cx, yTop, yBottom, topHalf, bottomHalf, color) {
      const rgba = hex(color);
      for (let y = yTop; y < yBottom; y += 1) {
        const t = (y - yTop) / (yBottom - yTop);
        const half = topHalf + (bottomHalf - topHalf) * t;
        for (let x = Math.round(cx - half); x < cx + half; x += 1) set(x, y, rgba);
      }
    },
  };
}

function drawStage(plant, stage) {
  const c = canvas();
  const cx = SIZE / 2;
  // 화분과 흙: 모든 단계에서 같은 위치(단계 전환 시 겹쳐도 튀지 않게)
  c.trapezoid(cx, 380, 480, 110, 80, POT);
  c.rect(cx - 118, 370, cx + 118, 392, POT);
  c.ellipse(cx, 384, 104, 12, SOIL);

  const stemHeight = [0, 40, 110, 170, 220, 250][stage];
  const stemTop = 384 - stemHeight;
  c.rect(cx - 5, stemTop, cx + 5, 384, plant.leaf);

  const leafPairs = [0, 1, 2, 3, 3, 4][stage];
  for (let i = 0; i < leafPairs; i += 1) {
    const y = 370 - (i + 1) * (stemHeight / (leafPairs + 1));
    const size = 18 + stage * 6 - i * 3;
    c.ellipse(cx - size - 4, y, size, size * 0.55, plant.leaf);
    c.ellipse(cx + size + 4, y - 6, size, size * 0.55, plant.leaf);
  }

  if (stage === 4 && plant.flower) c.ellipse(cx, stemTop - 10, 16, 22, plant.flower);
  if (stage === 5) {
    if (plant.flower) {
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI * 2 * i) / 6;
        c.ellipse(cx + Math.cos(angle) * 30, stemTop - 20 + Math.sin(angle) * 30, 24, 24, plant.flower);
      }
      c.ellipse(cx, stemTop - 20, 18, 18, '#E8C547');
    } else {
      c.ellipse(cx, stemTop - 10, 70, 46, plant.leaf);
    }
  }
  return c.pixels;
}

for (const [id, plant] of Object.entries(PLANTS)) {
  const dir = `${OUT_DIR}${id}`;
  mkdirSync(dir, { recursive: true });
  for (let stage = 1; stage <= 5; stage += 1) {
    writeFileSync(`${dir}/stage-${stage}.png`, encodePng(SIZE, SIZE, drawStage(plant, stage)));
  }
}
console.log(`임시 식물 그림 ${Object.keys(PLANTS).length * 5}장을 만들었습니다: ${OUT_DIR}`);
