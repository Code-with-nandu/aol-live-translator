/**
 * Audio Player for Hindi speech playback in student earphones.
 * Uses Web Audio API with GainNode for independent student volume control.
 */

export class StudentAudioPlayer {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private volume: number = 0.85; // Default 85%
  private isUnlocked: boolean = false;
  private isMuted: boolean = false;
  private queue: Array<{ base64Audio?: string; textFallback?: string }> = [];
  private isPlaying: boolean = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private onPlayStateChange?: (playing: boolean) => void;

  constructor(onPlayStateChange?: (playing: boolean) => void) {
    this.onPlayStateChange = onPlayStateChange;
  }

  public async unlock(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioContextClass();
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
        this.gainNode.connect(this.ctx.destination);
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      // Play a short silent buffer to prime audio on Android Chrome / iOS
      const buffer = this.ctx.createBuffer(1, 1, 22050);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      source.start(0);

      this.isUnlocked = true;
      return true;
    } catch (err) {
      console.warn('AudioContext unlock failed:', err);
      return false;
    }
  }

  public getUnlocked(): boolean {
    return this.isUnlocked && this.ctx?.state === 'running';
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public isCurrentlyMuted(): boolean {
    return this.isMuted;
  }

  public queueAudio(base64Audio?: string, textFallback?: string) {
    if (!this.isUnlocked) {
      // If not unlocked yet, we store up to 3 latest items
      if (this.queue.length > 3) this.queue.shift();
      this.queue.push({ base64Audio, textFallback });
      return;
    }

    this.queue.push({ base64Audio, textFallback });
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  private async playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.onPlayStateChange?.(false);
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.isPlaying = true;
    this.onPlayStateChange?.(true);

    if (item.base64Audio) {
      try {
        await this.playBase64Wav(item.base64Audio);
      } catch (err) {
        console.warn('Failed to decode base64 audio, trying speech synthesis fallback:', err);
        if (item.textFallback) {
          await this.playSpeechSynthesis(item.textFallback);
        }
      }
    } else if (item.textFallback) {
      await this.playSpeechSynthesis(item.textFallback);
    }

    // Short gap between phrases
    setTimeout(() => {
      this.playNext();
    }, 150);
  }

  private async playBase64Wav(base64: string): Promise<void> {
    if (!this.ctx || !this.gainNode) {
      await this.unlock();
    }
    if (!this.ctx || !this.gainNode) return;

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    // Convert base64 to ArrayBuffer
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Decode audio buffer (WAV)
    const audioBuffer = await this.ctx.decodeAudioData(bytes.buffer.slice(0));

    return new Promise((resolve) => {
      if (!this.ctx || !this.gainNode) {
        resolve();
        return;
      }
      const source = this.ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode);
      this.currentSource = source;

      source.onended = () => {
        this.currentSource = null;
        resolve();
      };

      source.start();
    });
  }

  private playSpeechSynthesis(hindiText: string): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        resolve();
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(hindiText);
      utterance.lang = 'hi-IN';
      utterance.rate = 0.95; // Slightly slower, calm pace for meditation
      utterance.pitch = 1.0;
      utterance.volume = this.isMuted ? 0 : this.volume;

      // Select Hindi voice if available
      const voices = window.speechSynthesis.getVoices();
      const hindiVoice = voices.find((v) => v.lang.includes('hi') || v.lang.includes('Hindi'));
      if (hindiVoice) {
        utterance.voice = hindiVoice;
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    });
  }

  public stop() {
    this.queue = [];
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {}
      this.currentSource = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.isPlaying = false;
    this.onPlayStateChange?.(false);
  }

  public close() {
    this.stop();
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close();
    }
    this.ctx = null;
  }
}
