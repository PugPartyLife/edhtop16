// This is a helper function to make sure that all calculations are NaN-safe and sanitized

/**
 * Safe division helper function that prevents NaN and infinity results
 * @param numerator - The number to divide
 * @param denominator - The number to divide by
 * @param defaultValue - Value to return if division is invalid (default: 0)
 * @returns Safe division result or defaultValue
 */
export function safeDivision(numerator: number, denominator: number, defaultValue: number = 0): number {
  if (typeof numerator !== 'number' || typeof denominator !== 'number') {
    return defaultValue;
  }
  if (denominator === 0 || !isFinite(denominator) || !isFinite(numerator)) {
    return defaultValue;
  }
  const result = numerator / denominator;
  return isNaN(result) || !isFinite(result) ? defaultValue : result;
}

/**
 * Safe number conversion helper that ensures valid finite numbers
 * @param value - Value to convert/validate as number
 * @param defaultValue - Value to return if invalid (default: 0)
 * @returns Safe number or defaultValue
 */
export function safeNumber(value: any, defaultValue: number = 0): number {
  if (typeof value === 'number' && isFinite(value) && !isNaN(value)) {
    return value;
  }
  return defaultValue;
}

/**
 * Type guard for valid numbers
 * @param value - Value to check
 * @returns true if value is a valid finite number
 */
export function isValidNumber(value: any): value is number {
  return typeof value === 'number' && isFinite(value) && !isNaN(value);
}

/**
 * Sanitize database query results to ensure no NaN values
 * @param result - Database query result object
 * @returns Sanitized result with safe numbers
 */
export function sanitizeQueryResult<T extends Record<string, any>>(result: T): T {
  const sanitized = {...result};
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'number' && (!isFinite(value) || isNaN(value))) {
      (sanitized as any)[key] = 0;
    }
  }
  return sanitized;
}