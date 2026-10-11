import * as THREE from 'three';
import {
  BloomEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { GradeEffect } from './grade';

export interface LookSettings {
  /** Дистанция фокуса (мировые единицы). 0 — DOF выключен. */
  focusDistance: number;
  /** Глубина резкости. */
  focusRange: number;
  bokehScale: number;
  bloomIntensity: number;
  exposure: number;
}

export class Pipeline {
  readonly renderer: THREE.WebGLRenderer;
  composer!: EffectComposer;
  dof!: DepthOfFieldEffect;
  bloom!: BloomEffect;
  grade!: GradeEffect;
  ao!: InstanceType<typeof N8AOPostPass>;
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  private dofPass!: EffectPass;
  private tone!: ToneMappingEffect;
  private width: number;
  private height: number;
  postEnabled = true;

  /** Рендерер создаётся сразу (он нужен миру для PMREM), цепочка эффектов — в attach(). */
  constructor(readonly canvas: HTMLCanvasElement, width: number, height: number) {
    this.width = width;
    this.height = height;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      depth: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;
  }

  attach(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    const renderer = this.renderer;
    const width = this.width;
    const height = this.height;
    const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    composer.addPass(new RenderPass(scene, camera));

    const ao = new N8AOPostPass(scene, camera, width, height);
    ao.configuration.aoRadius = 1.6;
    ao.configuration.distanceFalloff = 0.6;
    ao.configuration.intensity = 2.2;
    ao.configuration.aoSamples = 16;
    ao.configuration.denoiseSamples = 8;
    ao.configuration.denoiseRadius = 10;
    ao.configuration.halfRes = true;
    ao.configuration.depthAwareUpsampling = true;
    ao.configuration.gammaCorrection = false;
    ao.configuration.accumulate = false;
    ao.configuration.color = new THREE.Color(0.08, 0.06, 0.1);
    composer.addPass(ao);
    this.ao = ao;

    this.dof = new DepthOfFieldEffect(camera, {
      focusDistance: 10,
      focusRange: 4,
      bokehScale: 3,
      resolutionScale: 0.5,
    });
    this.dofPass = new EffectPass(camera, this.dof);
    composer.addPass(this.dofPass);

    this.bloom = new BloomEffect({
      luminanceThreshold: 0.85,
      luminanceSmoothing: 0.25,
      intensity: 0.55,
      mipmapBlur: true,
      radius: 0.72,
    });
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    composer.addPass(new EffectPass(camera, this.bloom, this.tone));

    this.grade = new GradeEffect();
    composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH }), this.grade));

    this.composer = composer;
    this.setSize(width, height);
  }

  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.grade.aspect = width / height;
  }

  apply(look: LookSettings, frame: number) {
    this.dofPass.enabled = look.focusDistance > 0;
    this.dof.cocMaterial.focusDistance = Math.max(0.01, look.focusDistance);
    this.dof.cocMaterial.focusRange = look.focusRange;
    this.dof.bokehScale = look.bokehScale;
    this.bloom.intensity = look.bloomIntensity;
    this.renderer.toneMappingExposure = look.exposure;
    this.grade.frame = frame;
  }

  render() {
    if (this.postEnabled) {
      // deltaTime фиксирован: ни один эффект не должен зависеть от реального времени.
      this.composer.render(1 / 30);
    } else {
      this.renderer.toneMapping = THREE.AgXToneMapping;
      this.renderer.render(this.scene, this.camera);
      this.renderer.toneMapping = THREE.NoToneMapping;
    }
  }
}
