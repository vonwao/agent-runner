/**
 * Redactor - Pattern-based secret redaction for command output
 *
 * Prevents sensitive data (tokens, API keys, credentials) from being
 * stored in receipts and logs.
 */

// Replacement text for redacted content
const REDACTED = '[REDACTED]';

// Common secret patterns to detect and redact
const SECRET_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  // Environment variable assignments with sensitive names
  { pattern: /\b(TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|APIKEY|AUTH|CREDENTIAL|PRIVATE_KEY)=\S+/gi, name: 'env_var' },

  // Auth headers
  { pattern: /\b(Bearer|Basic|Token)\s+[A-Za-z0-9_\-./+=]{20,}/gi, name: 'auth_header' },

  // AWS credentials
  { pattern: /\bAWS_[A-Z_]*=\S+/g, name: 'aws_cred' },
  { pattern: /\b(AKIA|ASIA)[A-Z0-9]{16,}/g, name: 'aws_key_id' },

  // Cloud provider tokens
  { pattern: /\bSUPABASE_[A-Z_]*=\S+/gi, name: 'supabase' },
  { pattern: /\bOPENAI_[A-Z_]*=\S+/gi, name: 'openai' },
  { pattern: /\bANTHROPIC_[A-Z_]*=\S+/gi, name: 'anthropic' },
  { pattern: /\bSTRIPE_[A-Z_]*=\S+/gi, name: 'stripe' },
  { pattern: /\bTWILIO_[A-Z_]*=\S+/gi, name: 'twilio' },
  { pattern: /\bSENDGRID_[A-Z_]*=\S+/gi, name: 'sendgrid' },

  // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
  { pattern: /\b(ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]{36,}/g, name: 'github_token' },

  // npm tokens
  { pattern: /\bnpm_[A-Za-z0-9]{36,}/g, name: 'npm_token' },
  { pattern: /\/\/registry\.npmjs\.org\/:_authToken=\S+/g, name: 'npm_auth' },

  // Generic long hex strings (likely tokens) - 40+ chars
  { pattern: /\b[a-fA-F0-9]{40,}\b/g, name: 'hex_token' },

  // Base64 encoded secrets (common in configs)
  { pattern: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g, name: 'base64_token' },

  // Private keys
  { pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g, name: 'private_key' },

  // Connection strings with credentials
  { pattern: /:\/\/[^:]+:[^@]+@/g, name: 'connection_string' },

  // Generic secret-looking assignments in various formats
  { pattern: /"(api_key|apiKey|secret|token|password|auth)":\s*"[^"]+"/gi, name: 'json_secret' },
  { pattern: /'(api_key|apiKey|secret|token|password|auth)':\s*'[^']+'/gi, name: 'yaml_secret' },
];

/**
 * Redact sensitive data from text.
 *
 * @param text - The text to redact
 * @returns The text with sensitive data replaced with [REDACTED]
 */
export function redact(text: string): string {
  if (!text) return text;

  let result = text;

  for (const { pattern } of SECRET_PATTERNS) {
    // Reset regex state for global patterns
    pattern.lastIndex = 0;
    result = result.replace(pattern, REDACTED);
  }

  return result;
}

/**
 * Check if text likely contains secrets (for warnings).
 *
 * @param text - The text to check
 * @returns true if secrets were detected
 */
export function containsSecrets(text: string): boolean {
  if (!text) return false;

  for (const { pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Get list of secret pattern names that matched.
 * Useful for debugging/logging.
 *
 * @param text - The text to check
 * @returns Array of pattern names that matched
 */
export function detectSecretTypes(text: string): string[] {
  if (!text) return [];

  const matches: string[] = [];

  for (const { pattern, name } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      matches.push(name);
    }
  }

  return matches;
}

export { REDACTED };
