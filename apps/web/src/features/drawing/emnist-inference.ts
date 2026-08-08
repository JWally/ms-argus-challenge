export const EMNIST_INPUT_SIDE = 28;
export const EMNIST_INPUT_PIXELS = EMNIST_INPUT_SIDE * EMNIST_INPUT_SIDE;
const EMNIST_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const EMNIST_CLASS_COUNT = EMNIST_LETTERS.length;
const EMNIST_MODEL_BYTES = 908_392;

interface EmnistWeights {
  convolutionOneKernel: Float32Array;
  convolutionOneBias: Float32Array;
  convolutionTwoKernel: Float32Array;
  convolutionTwoBias: Float32Array;
  denseOneKernel: Float32Array;
  denseOneBias: Float32Array;
  denseTwoKernel: Float32Array;
  denseTwoBias: Float32Array;
}

export interface EmnistGrade {
  letter: string;
  confidence: number;
  confidences: number[];
}

interface WeightSpec {
  name: keyof EmnistWeights;
  count: number;
}

const WEIGHT_SPECS: WeightSpec[] = [
  { name: 'convolutionOneKernel', count: 3 * 3 * 1 * 32 },
  { name: 'convolutionOneBias', count: 32 },
  { name: 'convolutionTwoKernel', count: 3 * 3 * 32 * 64 },
  { name: 'convolutionTwoBias', count: 64 },
  { name: 'denseOneKernel', count: 1_600 * 128 },
  { name: 'denseOneBias', count: 128 },
  { name: 'denseTwoKernel', count: 128 * EMNIST_CLASS_COUNT },
  { name: 'denseTwoBias', count: EMNIST_CLASS_COUNT },
];

export function parseEmnistWeights(buffer: ArrayBuffer): EmnistWeights {
  if (buffer.byteLength !== EMNIST_MODEL_BYTES) throw new Error('invalid_emnist_model');
  const parsed: Partial<EmnistWeights> = {};
  let offset = 0;
  for (const spec of WEIGHT_SPECS) {
    const bytes = spec.count * Float32Array.BYTES_PER_ELEMENT;
    const aligned = buffer.slice(offset, offset + bytes);
    parsed[spec.name] = new Float32Array(aligned);
    offset += bytes;
  }
  return parsed as EmnistWeights;
}

interface ConvolutionInput {
  values: Float32Array;
  kernel: Float32Array;
  bias: Float32Array;
  height: number;
  width: number;
  inputChannels: number;
  outputChannels: number;
}

function convolutionValue(input: ConvolutionInput, y: number, x: number, channel: number): number {
  let sum = input.bias[channel] ?? 0;
  for (let kernelY = 0; kernelY < 3; kernelY += 1) {
    for (let kernelX = 0; kernelX < 3; kernelX += 1) {
      const inputOffset = ((y + kernelY) * input.width + x + kernelX) * input.inputChannels;
      const kernelOffset =
        (kernelY * 3 + kernelX) * input.inputChannels * input.outputChannels + channel;
      for (let inputChannel = 0; inputChannel < input.inputChannels; inputChannel += 1) {
        sum +=
          (input.values[inputOffset + inputChannel] ?? 0) *
          (input.kernel[kernelOffset + inputChannel * input.outputChannels] ?? 0);
      }
    }
  }
  return Math.max(0, sum);
}

function convolve(input: ConvolutionInput): Float32Array {
  const outputHeight = input.height - 2;
  const outputWidth = input.width - 2;
  const output = new Float32Array(outputHeight * outputWidth * input.outputChannels);
  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      for (let channel = 0; channel < input.outputChannels; channel += 1) {
        output[(y * outputWidth + x) * input.outputChannels + channel] = convolutionValue(
          input,
          y,
          x,
          channel
        );
      }
    }
  }
  return output;
}

function maxPool(
  input: Float32Array,
  height: number,
  width: number,
  channels: number
): Float32Array {
  const outputHeight = Math.floor(height / 2);
  const outputWidth = Math.floor(width / 2);
  const output = new Float32Array(outputHeight * outputWidth * channels);
  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const sourceY = y * 2;
        const sourceX = x * 2;
        const at = (dy: number, dx: number) =>
          input[((sourceY + dy) * width + sourceX + dx) * channels + channel] ?? 0;
        output[(y * outputWidth + x) * channels + channel] = Math.max(
          at(0, 0),
          at(0, 1),
          at(1, 0),
          at(1, 1)
        );
      }
    }
  }
  return output;
}

function dense(
  input: Float32Array,
  kernel: Float32Array,
  bias: Float32Array,
  outputSize: number,
  useActivation: boolean
): Float32Array {
  const output = new Float32Array(outputSize);
  for (let outputIndex = 0; outputIndex < outputSize; outputIndex += 1) {
    let sum = bias[outputIndex] ?? 0;
    for (let inputIndex = 0; inputIndex < input.length; inputIndex += 1) {
      sum += (input[inputIndex] ?? 0) * (kernel[inputIndex * outputSize + outputIndex] ?? 0);
    }
    output[outputIndex] = useActivation ? Math.max(0, sum) : sum;
  }
  return output;
}

function softmax(logits: Float32Array): number[] {
  const maximum = Math.max(...logits);
  const exponentials = Array.from(logits, (value) => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map((value) => value / total);
}

export function inferEmnistLetter(raster: Float32Array, weights: EmnistWeights): EmnistGrade {
  if (raster.length !== EMNIST_INPUT_PIXELS) throw new Error('invalid_emnist_raster');
  const first = convolve({
    values: raster,
    kernel: weights.convolutionOneKernel,
    bias: weights.convolutionOneBias,
    height: 28,
    width: 28,
    inputChannels: 1,
    outputChannels: 32,
  });
  const firstPool = maxPool(first, 26, 26, 32);
  const second = convolve({
    values: firstPool,
    kernel: weights.convolutionTwoKernel,
    bias: weights.convolutionTwoBias,
    height: 13,
    width: 13,
    inputChannels: 32,
    outputChannels: 64,
  });
  const secondPool = maxPool(second, 11, 11, 64);
  const hidden = dense(secondPool, weights.denseOneKernel, weights.denseOneBias, 128, true);
  const probabilities = softmax(
    dense(hidden, weights.denseTwoKernel, weights.denseTwoBias, EMNIST_CLASS_COUNT, false)
  );
  let bestIndex = 0;
  for (let index = 1; index < probabilities.length; index += 1) {
    if ((probabilities[index] ?? 0) > (probabilities[bestIndex] ?? 0)) bestIndex = index;
  }
  return {
    letter: EMNIST_LETTERS.charAt(bestIndex),
    confidence: probabilities[bestIndex] ?? 0,
    confidences: probabilities,
  };
}

let weightsPromise: Promise<EmnistWeights> | null = null;

export function loadEmnistWeights(): Promise<EmnistWeights> {
  weightsPromise ??= fetch('/emnist-weights.bin')
    .then((response) => {
      if (!response.ok) throw new Error('emnist_model_unavailable');
      return response.arrayBuffer();
    })
    .then(parseEmnistWeights);
  return weightsPromise;
}
