// Input validation utilities

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PROMPT_LENGTH = 10000; // characters
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

export function validateImageData(imageData, mimeType) {
  const errors = [];
  
  // Validate MIME type
  if (mimeType && !ALLOWED_IMAGE_TYPES.includes(mimeType.toLowerCase())) {
    errors.push(`Invalid image type: ${mimeType}. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`);
  }
  
  // Validate image size (approximate from base64)
  if (imageData) {
    // Base64 encoding adds ~33% overhead, so we check the base64 string size
    const base64Size = imageData.length;
    // Rough estimate: base64_size ≈ original_size * 4/3
    const estimatedSize = (base64Size * 3) / 4;
    
    if (estimatedSize > MAX_IMAGE_SIZE) {
      errors.push(`Image too large: ${(estimatedSize / 1024 / 1024).toFixed(2)}MB. Maximum size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
    }
    
    // Validate base64 format
    if (!/^[A-Za-z0-9+/=]+$/.test(imageData)) {
      errors.push('Invalid base64 image data format');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export function validatePrompt(prompt) {
  const errors = [];
  
  if (!prompt || typeof prompt !== 'string') {
    errors.push('Prompt must be a non-empty string');
    return { valid: false, errors };
  }
  
  if (prompt.length > MAX_PROMPT_LENGTH) {
    errors.push(`Prompt too long: ${prompt.length} characters. Maximum: ${MAX_PROMPT_LENGTH} characters`);
  }
  
  if (prompt.trim().length === 0) {
    errors.push('Prompt cannot be empty or only whitespace');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateRequestBody(body, requirePrompt = true) {
  const errors = [];
  
  // Validate prompt
  if (requirePrompt) {
    const promptValidation = validatePrompt(body.prompt);
    if (!promptValidation.valid) {
      errors.push(...promptValidation.errors);
    }
  }
  
  // Validate image data if provided
  if (body.imageData || body.mimeType) {
    const imageValidation = validateImageData(body.imageData, body.mimeType);
    if (!imageValidation.valid) {
      errors.push(...imageValidation.errors);
    }
  }
  
  // Validate model name (basic check)
  if (body.model && typeof body.model !== 'string') {
    errors.push('Model must be a string');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

