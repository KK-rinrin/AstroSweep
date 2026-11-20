import { EffectTier } from './vfxBus';

/**
 * Studio-Grade Procedural Sci-Fi & Realistic Explosion Web Audio Engine
 * - Master bus with DynamicsCompressor + subtle futuristic spatial feedback delay
 * - FM Synthesis + Resonant Filter Sweeps + Laser Transients for intense Sci-Fi tile reveals
 * - 5-Layer Physically Modeled Explosion (Supersonic Crack, Saturated Sub Pressure Wave,
 *   Turbulent Fireball Roar, Stochastic Shrapnel/Debris Crackle, Cavernous Shockwave Tail)
 */

const COSMIC_SCALE = [
  261.63, // C4
  293.66, // D4
  329.63, // E4
  369.99, // F#4
  392.00, // G4
  440.00, // A4
  493.88, // B4
  523.25, // C5
  587.33, // D5
  659.25, // E5
  739.99, // F#5
  783.99, // G5
  880.00, // A5
  987.77, // B5
  1046.50, // C6
  1174.66, // D6
  1318.51, // E6
];

class CosmicSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private sciFiDelaySend: GainNode | null = null;
  private saturationCurve: Float32Array<ArrayBuffer> | null = null;
  private whiteNoiseBuffer: AudioBuffer | null = null;
  private brownNoiseBuffer: AudioBuffer | null = null;
  private enabled = true;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  private createSaturationCurve(amount = 28): Float32Array<ArrayBuffer> {
    const samples = 1024;
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * (amount / 10));
    }
    return curve;
  }

  private ensureNoiseBuffers(ctx: AudioContext): void {
    if (!this.whiteNoiseBuffer) {
      const len = Math.floor(ctx.sampleRate * 2.2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.whiteNoiseBuffer = buf;
    }

    if (!this.brownNoiseBuffer) {
      const len = Math.floor(ctx.sampleRate * 2.4);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        // Turbulent brown/pink hybrid with organic low-end density
        lastOut = (lastOut + 0.045 * white) / 1.045;
        data[i] = Math.max(-1, Math.min(1, lastOut * 3.8 + white * 0.22));
      }
      this.brownNoiseBuffer = buf;
    }
  }

  private getAudioBus(): {
    ctx: AudioContext;
    dry: AudioNode;
    wet: AudioNode;
  } | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-14, ctx.currentTime);
      compressor.knee.setValueAtTime(12, ctx.currentTime);
      compressor.ratio.setValueAtTime(6, ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      compressor.release.setValueAtTime(0.18, ctx.currentTime);

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.88, ctx.currentTime);

      // Futuristic Holographic Spatial Delay Bus (68ms metallic echo)
      const delaySend = ctx.createGain();
      delaySend.gain.setValueAtTime(0.28, ctx.currentTime);

      const delayNode = ctx.createDelay(0.5);
      delayNode.delayTime.setValueAtTime(0.068, ctx.currentTime);

      const feedback = ctx.createGain();
      feedback.gain.setValueAtTime(0.32, ctx.currentTime);

      const delayFilter = ctx.createBiquadFilter();
      delayFilter.type = 'bandpass';
      delayFilter.frequency.setValueAtTime(1950, ctx.currentTime);
      delayFilter.Q.setValueAtTime(1.1, ctx.currentTime);

      delaySend.connect(delayNode);
      delayNode.connect(delayFilter);
      delayFilter.connect(feedback);
      feedback.connect(delayNode);
      delayFilter.connect(compressor);

      compressor.connect(masterGain);
      masterGain.connect(ctx.destination);

      this.ctx = ctx;
      this.compressor = compressor;
      this.masterGain = masterGain;
      this.sciFiDelaySend = delaySend;
      this.saturationCurve = this.createSaturationCurve(26);
      this.ensureNoiseBuffers(ctx);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return {
      ctx: this.ctx,
      dry: this.compressor!,
      wet: this.sciFiDelaySend!,
    };
  }

  /**
   * FM Sci-Fi Synthesizer voice: creates metallic/quantum holographic chimes & pulses
   */
  private triggerFmVoice(
    ctx: AudioContext,
    dest: AudioNode,
    wetDest: AudioNode | null,
    params: {
      carrierFreq: number;
      carrierEndFreq?: number;
      modRatio: number;
      modIndexStart: number;
      modIndexEnd: number;
      startTime: number;
      duration: number;
      gain: number;
      carrierType?: OscillatorType;
      modType?: OscillatorType;
      wetAmount?: number;
    }
  ): void {
    const {
      carrierFreq,
      carrierEndFreq,
      modRatio,
      modIndexStart,
      modIndexEnd,
      startTime,
      duration,
      gain,
      carrierType = 'sine',
      modType = 'sine',
      wetAmount = 0.45,
    } = params;

    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const amp = ctx.createGain();

    carrier.type = carrierType;
    mod.type = modType;

    carrier.frequency.setValueAtTime(Math.max(28, carrierFreq), startTime);
    if (carrierEndFreq !== undefined) {
      carrier.frequency.exponentialRampToValueAtTime(
        Math.max(28, carrierEndFreq),
        startTime + duration
      );
    }

    const modFreq = Math.max(28, carrierFreq * modRatio);
    mod.frequency.setValueAtTime(modFreq, startTime);
    if (carrierEndFreq !== undefined) {
      mod.frequency.exponentialRampToValueAtTime(
        Math.max(28, carrierEndFreq * modRatio),
        startTime + duration
      );
    }

    modGain.gain.setValueAtTime(modIndexStart, startTime);
    modGain.gain.exponentialRampToValueAtTime(Math.max(0.5, modIndexEnd), startTime + duration * 0.85);

    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(gain, startTime + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(amp);
    amp.connect(dest);

    if (wetDest && wetAmount > 0) {
      const send = ctx.createGain();
      send.gain.setValueAtTime(wetAmount, startTime);
      amp.connect(send);
      send.connect(wetDest);
    }

    carrier.start(startTime);
    mod.start(startTime);
    carrier.stop(startTime + duration + 0.03);
    mod.stop(startTime + duration + 0.03);
  }

  /**
   * Resonant Sci-Fi Filter Sweep (laser slash / plasma shield discharge)
   */
  private triggerResonantSweep(
    ctx: AudioContext,
    dest: AudioNode,
    wetDest: AudioNode | null,
    params: {
      oscFreqStart: number;
      oscFreqEnd: number;
      filterStart: number;
      filterEnd: number;
      q: number;
      startTime: number;
      duration: number;
      gain: number;
      type?: OscillatorType;
      filterType?: BiquadFilterType;
    }
  ): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();

    osc.type = params.type ?? 'sawtooth';
    osc.frequency.setValueAtTime(Math.max(28, params.oscFreqStart), params.startTime);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(28, params.oscFreqEnd),
      params.startTime + params.duration
    );

    filter.type = params.filterType ?? 'bandpass';
    filter.Q.setValueAtTime(params.q, params.startTime);
    filter.frequency.setValueAtTime(Math.max(40, params.filterStart), params.startTime);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, params.filterEnd),
      params.startTime + params.duration
    );

    amp.gain.setValueAtTime(0.0001, params.startTime);
    amp.gain.linearRampToValueAtTime(params.gain, params.startTime + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0001, params.startTime + params.duration);

    osc.connect(filter);
    filter.connect(amp);
    amp.connect(dest);
    if (wetDest) {
      amp.connect(wetDest);
    }

    osc.start(params.startTime);
    osc.stop(params.startTime + params.duration + 0.03);
  }

  private triggerSimpleTone(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    peakGain: number,
    endFreq?: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), startTime);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + duration);
    }

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  /**
   * Systematic 5-Tier Sci-Fi Cell Opening Synthesizer
   */
  public playTierImpact(
    tier: EffectTier,
    clearedCount: number,
    combo: number,
    isFever: boolean
  ): void {
    const bus = this.getAudioBus();
    if (!bus) return;
    const { ctx, dry, wet } = bus;
    const now = ctx.currentTime;

    const idx = Math.min(COSMIC_SCALE.length - 1, Math.max(0, combo % COSMIC_SCALE.length));
    const root = COSMIC_SCALE[idx];

    // === TIER 1 (All Openings): Quantum FM Ping + Laser Micro-Chirp + Tight Plasma Thump ===
    // Sharp sci-fi scanner laser chirp (instant futuristic identity)
    this.triggerResonantSweep(ctx, dry, wet, {
      oscFreqStart: root * 3.8,
      oscFreqEnd: root * 1.15,
      filterStart: 4200,
      filterEnd: 950,
      q: 6.5,
      startTime: now,
      duration: 0.055,
      gain: 0.14,
      type: 'sawtooth',
      filterType: 'bandpass',
    });

    // Metallic Quantum FM main crystal voice (inharmonic ratio 2.41 for sci-fi glass/metal edge)
    this.triggerFmVoice(ctx, dry, wet, {
      carrierFreq: root,
      modRatio: isFever ? 3.0 : 2.414,
      modIndexStart: root * (isFever ? 1.8 : 1.15),
      modIndexEnd: 12,
      startTime: now,
      duration: 0.19,
      gain: 0.17,
      wetAmount: 0.5,
    });

    // Tight futuristic pneumatic/plasma low-end click
    this.triggerSimpleTone(ctx, dry, 195, now, 0.06, 'sine', 0.16, 54);

    // === TIER 2 (PLASMA BURST): Resonant Energy Discharge + Rising FM 5th Harmonic ===
    if (tier >= 2) {
      this.triggerResonantSweep(ctx, dry, wet, {
        oscFreqStart: root * 0.75,
        oscFreqEnd: root * 2.0,
        filterStart: 580,
        filterEnd: 3800,
        q: 10,
        startTime: now + 0.015,
        duration: 0.18,
        gain: 0.13,
        type: 'sawtooth',
        filterType: 'bandpass',
      });

      this.triggerFmVoice(ctx, dry, wet, {
        carrierFreq: root * 1.5,
        carrierEndFreq: root * 1.52,
        modRatio: 2.0,
        modIndexStart: root * 1.6,
        modIndexEnd: 18,
        startTime: now + 0.028,
        duration: 0.24,
        gain: 0.12,
        wetAmount: 0.65,
      });
    }

    // === TIER 3 (NOVA WAVE / CHORD): Cascading Holographic Data-Stream FM Arpeggio + Plasma Bass ===
    if (tier >= 3) {
      const steps = Math.min(10, Math.max(4, Math.ceil(clearedCount / 2.2)));
      const startIdx = Math.min(COSMIC_SCALE.length - steps, Math.max(0, combo % 7));
      for (let i = 0; i < steps; i++) {
        const f = COSMIC_SCALE[Math.min(COSMIC_SCALE.length - 1, startIdx + i)];
        const t = now + 0.02 + i * 0.022;
        this.triggerFmVoice(ctx, dry, wet, {
          carrierFreq: f * (i % 2 === 0 ? 1 : 2),
          modRatio: 1.5,
          modIndexStart: f * 0.9,
          modIndexEnd: 8,
          startTime: t,
          duration: 0.17,
          gain: 0.095,
          wetAmount: 0.55,
        });
      }

      // Sci-fi capacitor punch
      this.triggerSimpleTone(ctx, dry, 150, now, 0.18, 'sine', 0.22, 38);
      this.triggerResonantSweep(ctx, dry, wet, {
        oscFreqStart: 110,
        oscFreqEnd: 48,
        filterStart: 1600,
        filterEnd: 240,
        q: 5,
        startTime: now,
        duration: 0.2,
        gain: 0.13,
        type: 'square',
        filterType: 'lowpass',
      });
    }

    // === TIER 4 (GALAXY SLASH): Twin Hyper-Laser Beam Slash + Detuned Sci-Fi Hypersaw Chord ===
    if (tier >= 4) {
      // High-velocity orbital laser slash (dual crossed sweeps)
      this.triggerResonantSweep(ctx, dry, wet, {
        oscFreqStart: 3200,
        oscFreqEnd: 260,
        filterStart: 5400,
        filterEnd: 420,
        q: 9,
        startTime: now,
        duration: 0.22,
        gain: 0.16,
        type: 'sawtooth',
        filterType: 'bandpass',
      });
      this.triggerResonantSweep(ctx, dry, wet, {
        oscFreqStart: 740,
        oscFreqEnd: 2960,
        filterStart: 900,
        filterEnd: 5800,
        q: 8,
        startTime: now + 0.02,
        duration: 0.24,
        gain: 0.11,
        type: 'sawtooth',
        filterType: 'bandpass',
      });

      // Futuristic wide FM Major-9th holographic bloom
      const chord = [root, root * 1.25, root * 1.5, root * 1.875, root * 2.25];
      chord.forEach((f, i) => {
        this.triggerFmVoice(ctx, dry, wet, {
          carrierFreq: f,
          modRatio: 2.0,
          modIndexStart: f * 0.75,
          modIndexEnd: 10,
          startTime: now + 0.015 + i * 0.016,
          duration: 0.36,
          gain: 0.075,
          wetAmount: 0.7,
        });
      });
    }

    // === TIER 5 (BIG BANG / OVERDRIVE): Warp-Core Seismic Pulse + Shimmering Quantum Crown ===
    if (tier >= 5) {
      // Deep sci-fi seismic charge bass pulse
      this.triggerFmVoice(ctx, dry, wet, {
        carrierFreq: 135,
        carrierEndFreq: 32,
        modRatio: 3.5,
        modIndexStart: 420,
        modIndexEnd: 12,
        startTime: now,
        duration: 0.42,
        gain: 0.24,
        wetAmount: 0.35,
      });

      // Shimmering high-orbit octave crown
      this.triggerFmVoice(ctx, dry, wet, {
        carrierFreq: root * 2,
        carrierEndFreq: root * 2.01,
        modRatio: 2.414,
        modIndexStart: root * 2.2,
        modIndexEnd: 20,
        startTime: now + 0.05,
        duration: 0.52,
        gain: 0.11,
        wetAmount: 0.85,
      });
    }
  }

  /**
   * Sci-Fi Energy Orb Absorption Chime (when homing orbs reach Score HUD)
   */
  public playOrbCollect(pitchStep: number): void {
    const bus = this.getAudioBus();
    if (!bus) return;
    const { ctx, dry, wet } = bus;
    const now = ctx.currentTime;
    const freq = COSMIC_SCALE[Math.min(COSMIC_SCALE.length - 1, 8 + (pitchStep % 9))];

    this.triggerFmVoice(ctx, dry, wet, {
      carrierFreq: freq * 1.5,
      carrierEndFreq: freq * 2.0,
      modRatio: 2.0,
      modIndexStart: 320,
      modIndexEnd: 10,
      startTime: now,
      duration: 0.085,
      gain: 0.06,
      wetAmount: 0.5,
    });
  }

  /**
   * Sci-Fi Magnetic Beacon Lock-On Sound for Flag placement/removal
   */
  public playFlag(placed: boolean): void {
    const bus = this.getAudioBus();
    if (!bus) return;
    const { ctx, dry, wet } = bus;
    const now = ctx.currentTime;

    if (placed) {
      this.triggerFmVoice(ctx, dry, wet, {
        carrierFreq: 640,
        carrierEndFreq: 1180,
        modRatio: 2.5,
        modIndexStart: 480,
        modIndexEnd: 20,
        startTime: now,
        duration: 0.075,
        gain: 0.12,
        wetAmount: 0.4,
      });
      this.triggerSimpleTone(ctx, dry, 1760, now + 0.028, 0.08, 'sine', 0.07);
    } else {
      this.triggerFmVoice(ctx, dry, wet, {
        carrierFreq: 560,
        carrierEndFreq: 280,
        modRatio: 2.0,
        modIndexStart: 220,
        modIndexEnd: 15,
        startTime: now,
        duration: 0.08,
        gain: 0.09,
        wetAmount: 0.25,
      });
    }
  }

  /**
   * Hyperdrive Ignition Swell for SUPERNOVA FEVER
   */
  public playFeverStart(): void {
    const bus = this.getAudioBus();
    if (!bus) return;
    const { ctx, dry, wet } = bus;
    const now = ctx.currentTime;

    // Warp engine turbine spool-up sweep
    this.triggerResonantSweep(ctx, dry, wet, {
      oscFreqStart: 140,
      oscFreqEnd: 1680,
      filterStart: 320,
      filterEnd: 6400,
      q: 7.5,
      startTime: now,
      duration: 0.36,
      gain: 0.16,
      type: 'sawtooth',
      filterType: 'bandpass',
    });

    const notes = [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.51, 1567.98];
    notes.forEach((freq, i) => {
      this.triggerFmVoice(ctx, dry, wet, {
        carrierFreq: freq,
        modRatio: 2.0,
        modIndexStart: freq * 0.9,
        modIndexEnd: 12,
        startTime: now + i * 0.038,
        duration: 0.42,
        gain: 0.1,
        wetAmount: 0.75,
      });
    });

    this.triggerSimpleTone(ctx, dry, 130, now, 0.4, 'sine', 0.22, 44);
  }

  /**
   * Orbital Radar Sonar Ping for Pulse Scanner
   */
  public playScannerPulse(): void {
    const bus = this.getAudioBus();
    if (!bus) return;
    const { ctx, dry, wet } = bus;
    const now = ctx.currentTime;

    this.triggerResonantSweep(ctx, dry, wet, {
      oscFreqStart: 1100,
      oscFreqEnd: 2200,
      filterStart: 1200,
      filterEnd: 4600,
      q: 11,
      startTime: now,
      duration: 0.22,
      gain: 0.14,
      type: 'sine',
      filterType: 'bandpass',
    });
    this.triggerFmVoice(ctx, dry, wet, {
      carrierFreq: 1760,
      modRatio: 1.5,
      modIndexStart: 600,
      modIndexEnd: 10,
      startTime: now + 0.06,
      duration: 0.28,
      gain: 0.1,
      wetAmount: 0.8,
    });
  }

  /**
   * Ultra-Realistic 5-Layer Physical Detonation Explosion
   * 1. Supersonic Concussion Crack (0-55ms)
   * 2. Saturated Chest-Punch Sub Pressure Wave (0-950ms)
   * 3. Turbulent Rolling Fireball Roar with Dynamic Filter Collapse (15-1650ms)
   * 4. Stochastic Metallic Hull Shatter & Secondary Shrapnel Crackle (50-1150ms)
   * 5. Deep Cavernous Shockwave After-Rumble (120-2000ms)
   */
  public playMineExplosion(): void {
    const bus = this.getAudioBus();
    if (!bus) return;
    const { ctx, dry } = bus;
    this.ensureNoiseBuffers(ctx);
    const now = ctx.currentTime;

    // Shared warm soft-clipping saturator for realistic explosive distortion & weight
    const saturator = ctx.createWaveShaper();
    saturator.curve = this.saturationCurve;
    saturator.oversample = '2x';

    const explosionMaster = ctx.createGain();
    explosionMaster.gain.setValueAtTime(1.05, now);
    saturator.connect(explosionMaster);
    explosionMaster.connect(dry);

    // === LAYER 1: Supersonic Detonation Crack / Air-Slap Transient ===
    if (this.whiteNoiseBuffer) {
      const crackSrc = ctx.createBufferSource();
      crackSrc.buffer = this.whiteNoiseBuffer;

      const crackFilter = ctx.createBiquadFilter();
      crackFilter.type = 'bandpass';
      crackFilter.frequency.setValueAtTime(2800, now);
      crackFilter.frequency.exponentialRampToValueAtTime(480, now + 0.075);
      crackFilter.Q.setValueAtTime(0.85, now);

      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(0.95, now);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

      crackSrc.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(saturator);
      crackSrc.start(now, Math.random() * 0.4, 0.1);
    }

    // Hard physical punch snap (520Hz -> 42Hz in 35ms)
    this.triggerSimpleTone(ctx, saturator, 520, now, 0.045, 'triangle', 0.72, 42);

    // === LAYER 2: Dual Saturated Sub-Bass Seismic Pressure Wave ===
    const sub1 = ctx.createOscillator();
    const sub2 = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub1.type = 'sine';
    sub2.type = 'triangle';

    sub1.frequency.setValueAtTime(118, now);
    sub1.frequency.exponentialRampToValueAtTime(42, now + 0.14);
    sub1.frequency.exponentialRampToValueAtTime(22, now + 0.95);

    sub2.frequency.setValueAtTime(76, now);
    sub2.frequency.exponentialRampToValueAtTime(27, now + 0.85);

    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.75, now + 0.012);
    subGain.gain.exponentialRampToValueAtTime(0.22, now + 0.28);
    subGain.gain.exponentialRampToValueAtTime(0.0008, now + 1.05);

    const subLowpass = ctx.createBiquadFilter();
    subLowpass.type = 'lowpass';
    subLowpass.frequency.setValueAtTime(190, now);

    sub1.connect(subLowpass);
    sub2.connect(subLowpass);
    subLowpass.connect(subGain);
    subGain.connect(saturator);

    sub1.start(now);
    sub2.start(now);
    sub1.stop(now + 1.1);
    sub2.stop(now + 1.1);

    // === LAYER 3: Turbulent Rolling Fireball Roar (Brown/Pink Noise + LFO Billow) ===
    if (this.brownNoiseBuffer) {
      const roarSrc = ctx.createBufferSource();
      roarSrc.buffer = this.brownNoiseBuffer;

      const roarFilter = ctx.createBiquadFilter();
      roarFilter.type = 'lowpass';
      roarFilter.Q.setValueAtTime(1.6, now);
      roarFilter.frequency.setValueAtTime(3400, now);
      roarFilter.frequency.exponentialRampToValueAtTime(620, now + 0.24);
      roarFilter.frequency.exponentialRampToValueAtTime(115, now + 1.45);

      // Organic fireball turbulence modulation (irregular low-freq flutter)
      const flutterLfo = ctx.createOscillator();
      const flutterDepth = ctx.createGain();
      flutterLfo.type = 'sine';
      flutterLfo.frequency.setValueAtTime(17, now);
      flutterLfo.frequency.exponentialRampToValueAtTime(5.5, now + 1.4);
      flutterDepth.gain.setValueAtTime(0.18, now);
      flutterDepth.gain.exponentialRampToValueAtTime(0.02, now + 1.4);

      const roarGain = ctx.createGain();
      roarGain.gain.setValueAtTime(0.001, now);
      roarGain.gain.linearRampToValueAtTime(0.82, now + 0.022);
      roarGain.gain.exponentialRampToValueAtTime(0.36, now + 0.35);
      roarGain.gain.exponentialRampToValueAtTime(0.0008, now + 1.65);

      flutterLfo.connect(flutterDepth);
      flutterDepth.connect(roarGain.gain);

      roarSrc.connect(roarFilter);
      roarFilter.connect(roarGain);
      roarGain.connect(saturator);

      roarSrc.start(now, Math.random() * 0.25, 1.7);
      flutterLfo.start(now);
      flutterLfo.stop(now + 1.7);
    }

    // === LAYER 4: Stochastic Debris, Hull Shrapnel & Electrical Crackle Bursts ===
    if (this.whiteNoiseBuffer) {
      const debrisCount = 15;
      for (let i = 0; i < debrisCount; i++) {
        const delay = 0.035 + Math.pow(i / debrisCount, 1.35) * 0.92 + Math.random() * 0.04;
        const burstDur = 0.018 + Math.random() * 0.045;
        const freq = 950 + Math.random() * 4400;
        const level = (1 - i / debrisCount) * (0.14 + Math.random() * 0.16);

        const src = ctx.createBufferSource();
        src.buffer = this.whiteNoiseBuffer;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(freq, now + delay);
        bp.Q.setValueAtTime(2.5 + Math.random() * 4, now + delay);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now + delay);
        g.gain.linearRampToValueAtTime(level, now + delay + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, now + delay + burstDur);

        src.connect(bp);
        bp.connect(g);
        g.connect(dry);

        src.start(now + delay, Math.random() * 1.2, burstDur + 0.01);
      }
    }

    // === LAYER 5: Deep Cavernous Shockwave After-Rumble ===
    if (this.brownNoiseBuffer) {
      const tailSrc = ctx.createBufferSource();
      tailSrc.buffer = this.brownNoiseBuffer;

      const tailFilter = ctx.createBiquadFilter();
      tailFilter.type = 'bandpass';
      tailFilter.frequency.setValueAtTime(145, now + 0.08);
      tailFilter.frequency.exponentialRampToValueAtTime(52, now + 1.9);
      tailFilter.Q.setValueAtTime(1.4, now + 0.08);

      const tailGain = ctx.createGain();
      tailGain.gain.setValueAtTime(0.0001, now + 0.06);
      tailGain.gain.linearRampToValueAtTime(0.55, now + 0.24);
      tailGain.gain.exponentialRampToValueAtTime(0.0006, now + 1.98);

      tailSrc.connect(tailFilter);
      tailFilter.connect(tailGain);
      tailGain.connect(dry);

      tailSrc.start(now + 0.06, Math.random() * 0.2, 2.0);
    }
  }

  /**
   * Compact realistic secondary detonation pop for chain-reacting mines
   */
  public playSecondaryDetonation(intensity = 0.6): void {
    const bus = this.getAudioBus();
    if (!bus) return;
    const { ctx, dry } = bus;
    this.ensureNoiseBuffers(ctx);
    const now = ctx.currentTime;
    const clamped = Math.max(0.18, Math.min(0.85, intensity));

    // Punchy low thump
    this.triggerSimpleTone(ctx, dry, 115 + Math.random() * 45, now, 0.19, 'sine', 0.28 * clamped, 28);

    // Filtered crackle blast
    if (this.brownNoiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.brownNoiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(650 + Math.random() * 900, now);
      filter.frequency.exponentialRampToValueAtTime(120, now + 0.24);
      filter.Q.setValueAtTime(1.1, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.32 * clamped, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(dry);
      src.start(now, Math.random() * 0.6, 0.28);
    }
  }

  /**
   * Act 3 Grand Finale Supernova Blast (ultra-deep seismic shockwave + long atmospheric roar)
   */
  public playFinaleSupernova(): void {
    const bus = this.getAudioBus();
    if (!bus) return;
    const { ctx, dry } = bus;
    this.ensureNoiseBuffers(ctx);
    const now = ctx.currentTime;

    const saturator = ctx.createWaveShaper();
    saturator.curve = this.saturationCurve;
    saturator.oversample = '2x';
    saturator.connect(dry);

    // Massive sub-seismic drop (92Hz -> 18Hz over 1.3s)
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(92, now);
    sub.frequency.exponentialRampToValueAtTime(34, now + 0.22);
    sub.frequency.exponentialRampToValueAtTime(18, now + 1.35);

    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.88, now + 0.015);
    subGain.gain.exponentialRampToValueAtTime(0.0008, now + 1.45);

    sub.connect(subGain);
    subGain.connect(saturator);
    sub.start(now);
    sub.stop(now + 1.5);

    // Wide supersonic air-blast crack
    if (this.whiteNoiseBuffer) {
      const crack = ctx.createBufferSource();
      crack.buffer = this.whiteNoiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2200, now);
      bp.frequency.exponentialRampToValueAtTime(320, now + 0.14);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.85, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      crack.connect(bp);
      bp.connect(g);
      g.connect(saturator);
      crack.start(now, 0.1, 0.18);
    }

    // Long rolling supernova fireball tail
    if (this.brownNoiseBuffer) {
      const roar = ctx.createBufferSource();
      roar.buffer = this.brownNoiseBuffer;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2600, now);
      lp.frequency.exponentialRampToValueAtTime(85, now + 1.6);
      lp.Q.setValueAtTime(1.8, now);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.9, now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 1.75);

      roar.connect(lp);
      lp.connect(g);
      g.connect(saturator);
      roar.start(now, 0.05, 1.8);
    }
  }

  /**
   * Radiant Sci-Fi Orbital Victory Fanfare
   */
  public playVictory(): void {
    const bus = this.getAudioBus();
    if (!bus) return;
    const { ctx, dry, wet } = bus;
    const now = ctx.currentTime;

    const fanfare = [
      { freq: 523.25, t: 0, d: 0.28 },
      { freq: 659.25, t: 0.085, d: 0.28 },
      { freq: 783.99, t: 0.17, d: 0.32 },
      { freq: 1046.5, t: 0.26, d: 0.6 },
      { freq: 987.77, t: 0.4, d: 0.25 },
      { freq: 1318.51, t: 0.5, d: 0.8 },
    ];
    fanfare.forEach(({ freq, t, d }) => {
      this.triggerFmVoice(ctx, dry, wet, {
        carrierFreq: freq,
        modRatio: 2.0,
        modIndexStart: freq * 0.75,
        modIndexEnd: 10,
        startTime: now + t,
        duration: d,
        gain: 0.13,
        wetAmount: 0.75,
      });
      this.triggerSimpleTone(ctx, dry, freq * 0.5, now + t, d, 'sine', 0.08);
    });
  }
}

export const soundEngine = new CosmicSoundEngine();
