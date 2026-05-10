class ChunkedAudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.framesPerChunk = Math.round(sampleRate * 1);
    this.pendingFrames = 0;
    this.channelBuffers = [];
  }

  appendChannelData(input) {
    const frameCount = input[0]?.length || 0;

    if (!frameCount) {
      return;
    }

    if (!this.channelBuffers.length) {
      this.channelBuffers = input.map(() => []);
    }

    for (let channel = 0; channel < input.length; channel += 1) {
      this.channelBuffers[channel].push(new Float32Array(input[channel]));
    }

    this.pendingFrames += frameCount;
  }

  flushChunk() {
    const channelCount = this.channelBuffers.length;
    const chunk = Array.from({ length: channelCount }, () => new Float32Array(this.framesPerChunk));
    const transfer = chunk.map((channel) => channel.buffer);

    for (let channel = 0; channel < channelCount; channel += 1) {
      let writeOffset = 0;
      let remaining = this.framesPerChunk;
      const buffers = this.channelBuffers[channel];

      while (remaining > 0 && buffers.length) {
        const current = buffers[0];
        const framesToCopy = Math.min(remaining, current.length);

        chunk[channel].set(current.subarray(0, framesToCopy), writeOffset);
        writeOffset += framesToCopy;
        remaining -= framesToCopy;

        if (framesToCopy === current.length) {
          buffers.shift();
        } else {
          buffers[0] = current.subarray(framesToCopy);
        }
      }
    }

    this.pendingFrames -= this.framesPerChunk;

    this.port.postMessage({
      type: "AUDIO_CHUNK",
      sampleRate,
      channels: chunk
    }, transfer);
  }

  process(inputs) {
    const input = inputs[0];

    if (!input?.length) {
      return true;
    }

    this.appendChannelData(input);

    while (this.pendingFrames >= this.framesPerChunk) {
      this.flushChunk();
    }

    return true;
  }
}

registerProcessor("chunked-audio-capture", ChunkedAudioCaptureProcessor);
