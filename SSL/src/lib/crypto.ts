import CryptoJS from "crypto-js";

if (!process.env.ENCRYPTION_KEY) {
  throw new Error("ENCRYPTION_KEY is not set");
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

/**
 * Encrypts a string using AES-256
 */
export function encrypt(text: string): string {
  const encrypted = CryptoJS.AES.encrypt(text, ENCRYPTION_KEY);
  return encrypted.toString();
}

/**
 * Decrypts an AES-256 encrypted string
 */
export function decrypt(encryptedText: string): string {
  const decrypted = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
  return decrypted.toString(CryptoJS.enc.Utf8);
}

/**
 * Generates a random secret for bridge authentication
 */
export function generateBridgeSecret(): string {
  return CryptoJS.lib.WordArray.random(32).toString();
}
