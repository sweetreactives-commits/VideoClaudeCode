import * as THREE from 'three';

// Палитра фильма «Апчхи!»: тёплое солнечное утро на лугу.
// Значения задаются в sRGB-hex, THREE.Color переводит их в линейное пространство.
const c = (hex: string) => new THREE.Color(hex);

export const PALETTE = {
  // Небо и воздух
  skyZenith: c('#4f8fd0'),
  skyMid: c('#93c3ea'),
  skyHorizon: c('#f8dcb6'),
  skyGround: c('#8fa26e'),
  sun: c('#ffd59a'),
  fog: c('#d9dfcf'),
  envGround: c('#577532'),

  // Земля и трава
  soil: c('#3e3220'),
  soilLight: c('#6b5a34'),
  grassDeep: c('#1f4a1a'),
  grassMid: c('#4f8a2a'),
  grassTip: c('#b6d36a'),
  grassDry: c('#cdbb62'),
  leaf: c('#3f7a2c'),
  stem: c('#4d8a30'),
  stone: c('#8f8a80'),
  moss: c('#6f8f3a'),
  hillNear: c('#7fa24c'),
  hillFar: c('#9db7a0'),
  treeFar: c('#7d9a86'),

  // Цветы
  petalPink: c('#f59dc4'),
  petalMagenta: c('#e0559a'),
  petalWhite: c('#fbf6ec'),
  petalLilac: c('#b9a0ec'),
  petalButter: c('#f9d94e'),
  petalCoral: c('#ff8f6b'),
  flowerCenter: c('#f2a51f'),
  pollen: c('#ffd23a'),

  // Бумс
  bumsHoney: c('#f4b63a'),
  bumsOrange: c('#ea8a2c'),
  bumsChoc: c('#3d2316'),
  bumsCream: c('#fff0c4'),
  bumsNose: c('#e2453c'),
  bumsIris: c('#6a3a1a'),
  bumsIrisRim: c('#2a140a'),
  bumsIrisLight: c('#c8892f'),
  bumsMouth: c('#4a0f14'),
  bumsTongue: c('#f06f78'),
  bumsBlush: c('#ff7a6a'),
  wing: c('#dff3ff'),
};
