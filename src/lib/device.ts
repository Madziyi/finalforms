const KEY = "ecc_device_token_v1";
export function getDeviceToken() { return localStorage.getItem(KEY) ?? ""; }
export function setDeviceToken(value: string) { const trimmed=value.trim(); if(trimmed) localStorage.setItem(KEY,trimmed); else localStorage.removeItem(KEY); window.dispatchEvent(new Event("ecc-device-token")); }
export function hasDeviceToken() { return Boolean(getDeviceToken()); }
