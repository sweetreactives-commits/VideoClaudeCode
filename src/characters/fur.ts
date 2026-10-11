import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';
import { PALETTE } from '../sets/palette';

/**
 * Мех Бумса. Один и тот же «рисунок» используется телом и оболочками ворса:
 * полосы считаются по объектной координате z (перед = +z — мордочка, зад — полосатое брюшко).
 */
export const STRIPES_GLSL = /* glsl */ `
uniform vec3 uHoney, uOrange, uChoc, uCream;
vec3 bumsColor(vec3 o) {
  vec3 d = normalize(o);
  float ang = atan(d.y, d.x);
  float wav = sin(ang * 7.0) * 0.025 + (vnoise3(o * 9.0) - 0.5) * 0.07;
  float z = d.z + wav;
  vec3 col = uHoney;
  // Тёплый переход к оранжевому на макушке и по бокам.
  col = mix(col, mix(uHoney, uOrange, 0.35), smoothstep(0.2, 0.9, d.y) * 0.5);
  float e = 0.035;
  float b1 = smoothstep(-0.02 + e, -0.02 - e, z) * smoothstep(-0.36 - e, -0.36 + e, z);
  float b2 = smoothstep(-0.36 + e, -0.36 - e, z) * smoothstep(-0.6 - e, -0.6 + e, z);
  float b3 = smoothstep(-0.6 + e, -0.6 - e, z) * smoothstep(-0.83 - e, -0.83 + e, z);
  float b4 = smoothstep(-0.83 + e, -0.83 - e, z);
  col = mix(col, uChoc, b1);
  col = mix(col, uOrange, b2);
  col = mix(col, uChoc, b3);
  col = mix(col, uOrange * 0.95, b4);
  // Светлое пушистое пузико.
  col = mix(col, uCream, smoothstep(-0.55, -0.92, d.y) * smoothstep(-0.4, 0.3, d.z) * 0.85);
  return col;
}
`;

export interface FurUniforms {
  uCheekPuff: { value: number };
  uBlush: { value: number };
  uBlushL: { value: THREE.Vector3 };
  uBlushR: { value: THREE.Vector3 };
  uInhale: { value: number };
}

function baseUniforms() {
  return {
    uHoney: { value: PALETTE.bumsHoney },
    uOrange: { value: PALETTE.bumsOrange },
    uChoc: { value: PALETTE.bumsChoc },
    uCream: { value: PALETTE.bumsCream },
  };
}

/** Деформация тела (грушевидность + надутые щёки) — общая для тела и оболочек. */
const DEFORM_GLSL = /* glsl */ `
uniform float uCheekPuff;
uniform vec3 uBlushL, uBlushR;
vec3 bumsDeform(vec3 p, vec3 n) {
  vec3 d = normalize(p);
  float gl = exp(-pow(acos(clamp(dot(d, uBlushL), -1.0, 1.0)) / 0.33, 2.0));
  float gr = exp(-pow(acos(clamp(dot(d, uBlushR), -1.0, 1.0)) / 0.33, 2.0));
  return p + n * uCheekPuff * (gl + gr) * 0.16;
}
`;

export function createFurMaterial(): { material: THREE.MeshPhysicalMaterial; uniforms: FurUniforms } {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.42,
    sheenColor: new THREE.Color('#ffe2a8'),
  });
  const uniforms: FurUniforms = {
    uCheekPuff: { value: 0 },
    uBlush: { value: 0.35 },
    uBlushL: { value: new THREE.Vector3(1, 0, 0) },
    uBlushR: { value: new THREE.Vector3(-1, 0, 0) },
    uInhale: { value: 0 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, baseUniforms(), uniforms, { uBlushColor: { value: PALETTE.bumsBlush } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DEFORM_GLSL}\nvarying vec3 vObj;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvObj = position;\ntransformed = bumsDeform(position, normal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${NOISE_GLSL}\n${STRIPES_GLSL}\nvarying vec3 vObj;\nuniform float uBlush;\nuniform vec3 uBlushL, uBlushR, uBlushColor;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    vec3 d = normalize(vObj);
    vec3 col = bumsColor(vObj);
    float bl = exp(-pow(acos(clamp(dot(d, uBlushL), -1.0, 1.0)) / 0.2, 2.0));
    float br = exp(-pow(acos(clamp(dot(d, uBlushR), -1.0, 1.0)) / 0.2, 2.0));
    col = mix(col, uBlushColor, clamp((bl + br) * uBlush, 0.0, 0.85));
    // Мелкая неоднородность ворса.
    col *= 0.93 + 0.14 * vnoise3(vObj * 22.0);
    diffuseColor.rgb *= col;
  }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  {
    // Процедурный «бамп» ворса: волоски, «зачёсанные» сверху вниз (шум вытянут вдоль Y),
    // нормаль возмущается через экранные производные.
    vec3 dn = normalize(vObj);
    float hgt = vnoise3(dn * vec3(150.0, 26.0, 150.0)) * 0.65 + vnoise3(dn * vec3(260.0, 50.0, 260.0)) * 0.35;
    vec2 dH = vec2(dFdx(hgt), dFdy(hgt)) * 0.0028;
    vec3 vSigmaX = dFdx(-vViewPosition);
    vec3 vSigmaY = dFdy(-vViewPosition);
    vec3 R1 = cross(vSigmaY, normal);
    vec3 R2 = cross(normal, vSigmaX);
    float fDet = dot(vSigmaX, R1) * faceDirection;
    vec3 vGrad = sign(fDet) * (dH.x * R1 + dH.y * R2);
    normal = normalize(abs(fDet) * normal - vGrad);
  }`,
      );
  };
  return { material, uniforms };
}

/**
 * Оболочки ворса: несколько расширенных копий тела, у которых видны только «волоски»
 * у силуэта. Дают пушистый контур без настоящих волос.
 */
export function createFuzzShellMaterial(layer: number, layers: number, furUniforms: FurUniforms): THREE.MeshStandardMaterial {
  // Полупрозрачные оболочки дают мягкий пух без «шума»; запись глубины оставляем, чтобы DOF видел пух на теле.
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, transparent: true, depthWrite: true });
  const h = (layer + 1) / layers;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, baseUniforms(), furUniforms, { uLayer: { value: h } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DEFORM_GLSL}\nvarying vec3 vObj;\nuniform float uLayer;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vObj = position;
  transformed = bumsDeform(position, normal) + normal * uLayer * 0.075;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE_GLSL}\n${STRIPES_GLSL}\nvarying vec3 vObj;\nuniform float uLayer;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    vec3 d = normalize(vObj);
    // Волоски: тонкие ячейки шума; от слоя к слою порог растёт — волосок сужается к кончику.
    float strand = vnoise3(d * 165.0) * 0.75 + vnoise3(d * 70.0) * 0.25;
    float th = 0.42 + uLayer * 0.3;
    float a = smoothstep(th, th + 0.07, strand);
    // Только у силуэта: обращённые к камере участки прозрачны.
    vec3 Vv = normalize(vViewPosition);
    float facing = abs(dot(normalize(vNormal), Vv));
    float rim = 1.0 - smoothstep(0.22, 0.6, facing);
    a *= rim * (1.0 - uLayer * 0.25);
    if (a < 0.05) discard;
    vec3 col = bumsColor(vObj);
    // Кончики светлее — пух «светится» по контуру.
    diffuseColor.rgb *= col * (0.95 + 0.45 * uLayer);
    diffuseColor.a = a;
  }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  // Волоски освещаются почти «в лоб», иначе контур на скользящих углах темнеет и выглядит как стекло.
  normal = normalize(mix(normal, vec3(0.0, 0.0, 1.0), 0.6));`,
      );
  };
  return material;
}

/** Веки: тот же медовый мех, только без полос (своя система координат). */
export function createLidMaterial(): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    color: PALETTE.bumsHoney.clone().lerp(PALETTE.bumsOrange, 0.35).multiplyScalar(0.82),
    roughness: 0.85,
    sheen: 1,
    sheenRoughness: 0.42,
    sheenColor: new THREE.Color('#ffe2a8'),
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLid;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLid = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE_GLSL}\nvarying vec3 vLid;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  diffuseColor.rgb *= 0.92 + 0.14 * vnoise3(vLid * 70.0);`,
      );
  };
  return material;
}
