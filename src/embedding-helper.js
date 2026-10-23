/**
 * JARVIS Conversational AI - Semantic Embedding & Vector Utility
 * 
 * Provides fast, zero-dependency in-process vector generation, serialization,
 * and cosine similarity search for facts and retrieval-augmented context.
 */

const DEFAULT_DIMENSIONS = 64;

/**
 * Clean text and extract character n-grams and tokens for vector representation
 * @param {string} text
 * @returns {string[]}
 */
function extractFeatures(text) {
  if (!text || typeof text !== 'string') return [];
  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = clean.split(/\s+/).filter(w => w.length > 1);
  const features = [...words];

  // Also extract char 3-grams for typo & morphology tolerance
  for (const word of words) {
    if (word.length >= 3) {
      for (let i = 0; i <= word.length - 3; i++) {
        features.push(word.substring(i, i + 3));
      }
    }
  }

  return features;
}

/**
 * 32-bit Murmur-like hash helper
 * @param {string} str
 * @returns {number}
 */
function hashString(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0);
}

/**
 * Generate a normalized dense vector for text using feature hashing
 * @param {string} text Input text
 * @param {number} [dimensions=64] Vector dimensionality
 * @returns {Float32Array} Unit-normalized vector
 */
export function generateEmbedding(text, dimensions = DEFAULT_DIMENSIONS) {
  const vec = new Float32Array(dimensions);
  const features = extractFeatures(text);

  if (features.length === 0) return vec;

  for (const feat of features) {
    const hash = hashString(feat);
    const index = hash % dimensions;
    const sign = (hash & 0x10000) === 0 ? 1.0 : -1.0;
    vec[index] += sign;
  }

  // L2 Normalize
  let norm = 0.0;
  for (let i = 0; i < dimensions; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      vec[i] /= norm;
    }
  }

  return vec;
}

/**
 * Calculate cosine similarity between two Float32Array vectors
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number} Score between -1.0 and 1.0
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0.0;

  let dot = 0.0;
  let normA = 0.0;
  let normB = 0.0;

  for (let i = 0; i < a.length; i++) {
    const valA = a[i];
    const valB = b[i];
    dot += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0.0;
  return dot / denom;
}

/**
 * Serialize a Float32Array into a Node.js Buffer for SQLite BLOB storage
 * @param {Float32Array} vec
 * @returns {Buffer}
 */
export function vectorToBlob(vec) {
  if (!vec) return null;
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

/**
 * Deserialize a SQLite BLOB Buffer back into Float32Array
 * @param {Buffer|Uint8Array} blob
 * @returns {Float32Array|null}
 */
export function blobToVector(blob) {
  if (!blob) return null;
  const uint8 = new Uint8Array(blob);
  return new Float32Array(uint8.buffer, uint8.byteOffset, uint8.byteLength / 4);
}

export default {
  generateEmbedding,
  cosineSimilarity,
  vectorToBlob,
  blobToVector
};
