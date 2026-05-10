class AiProcessor {
  constructor() {
    this.session = null;
    this.isReady = false;
    this.failureReason = "";
  }

  async initialize() {
    if (!globalThis.ort) {
      this.failureReason = "ONNX Runtime Web is not bundled yet.";
      return false;
    }

    try {
      this.session = await globalThis.ort.InferenceSession.create("models/voice-separator.onnx", {
        executionProviders: ["webgpu", "wasm"]
      });
      this.isReady = true;
      return true;
    } catch (error) {
      this.failureReason = error?.message || "Unable to load the voice separation model.";
      return false;
    }
  }

  async processChunk(channels, sampleRate) {
    if (!this.isReady) {
      return { channels, sampleRate, usedAi: false };
    }

    const mono = this.downmixToMono(channels);
    const inputName = this.session.inputNames[0];
    const outputName = this.session.outputNames[0];
    const inputTensor = new globalThis.ort.Tensor("float32", mono, [1, 1, mono.length]);
    const outputs = await this.session.run({ [inputName]: inputTensor });
    const output = outputs[outputName];
    const speech = output?.data instanceof Float32Array
      ? output.data
      : mono;

    return {
      channels: channels.map(() => new Float32Array(speech)),
      sampleRate,
      usedAi: Boolean(output?.data)
    };
  }

  downmixToMono(channels) {
    const frameCount = channels[0]?.length || 0;
    const mono = new Float32Array(frameCount);

    for (const channel of channels) {
      for (let index = 0; index < frameCount; index += 1) {
        mono[index] += channel[index] / channels.length;
      }
    }

    return mono;
  }
}

globalThis.cutTheMusicAiProcessor = new AiProcessor();
