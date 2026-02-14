/**
 * AudioWorklet Processor for Gemini Live
 * =======================================
 * 
 * OPTIMIZATION: Processes audio in a separate thread (AudioWorklet)
 * instead of the main thread (ScriptProcessorNode).
 * 
 * This reduces CPU usage and prevents UI stutters when hardware
 * acceleration is disabled.
 * 
 * The processor accumulates audio samples and sends them to the
 * main thread in chunks for encoding and transmission.
 */

class GeminiAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // Buffer configuration
    // 4096 samples at 48kHz = ~85ms of audio per chunk
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    
    // Frame counter for logging
    this.frameCount = 0;
    
    // Control flag
    this.isActive = true;
    
    // Listen for control messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'stop') {
        this.isActive = false;
      } else if (event.data.type === 'start') {
        this.isActive = true;
        this.bufferIndex = 0; // Reset buffer on start
      }
    };
  }

  /**
   * Process audio samples
   * Called by the audio system with 128 samples at a time (at 48kHz)
   */
  process(inputs, outputs, parameters) {
    // Early exit if not active
    if (!this.isActive) {
      return true; // Keep processor alive
    }
    
    const input = inputs[0];
    
    // Check if we have input
    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const inputChannel = input[0];
    
    // Accumulate samples in buffer
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex++] = inputChannel[i];
      
      // When buffer is full, send to main thread
      if (this.bufferIndex >= this.bufferSize) {
        this.frameCount++;
        
        // Send buffer copy to main thread for processing
        // Using slice() to create a copy since the buffer will be reused
        this.port.postMessage({
          type: 'audio',
          buffer: this.buffer.slice(),
          frameCount: this.frameCount
        });
        
        // Reset buffer index
        this.bufferIndex = 0;
      }
    }

    // Return true to keep the processor alive
    return true;
  }
}

// Register the processor
registerProcessor('gemini-audio-processor', GeminiAudioProcessor);
