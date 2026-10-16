// Firmas HMAC (sesión, state de OAuth, webhooks) y cifrado de los tokens de
// las tiendas con AES-256-GCM. Solo WebCrypto: corre igual en Workers y Node.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function aBase64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deBase64url(texto) {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((texto.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const aHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function claveHmac(secreto) {
  return crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function hmac(secreto, datos) {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await claveHmac(secreto), typeof datos === 'string' ? enc.encode(datos) : datos));
}

/** Comparación en tiempo constante. */
export function iguales(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Valor firmado con vencimiento: "dato.vence.firma". */
export async function firmarValor(secreto, dato, segundos, ahora = Date.now()) {
  const vence = Math.floor(ahora / 1000) + segundos;
  const cuerpo = `${dato}.${vence}`;
  return `${cuerpo}.${aBase64url(await hmac(secreto, cuerpo))}`;
}

export async function leerValorFirmado(secreto, texto, ahora = Date.now()) {
  if (typeof texto !== 'string') return null;
  const partes = texto.split('.');
  if (partes.length !== 3) return null;
  const [dato, vence, firma] = partes;
  if (!/^\d+$/.test(vence) || Number(vence) < Math.floor(ahora / 1000)) return null;
  const esperada = aBase64url(await hmac(secreto, `${dato}.${vence}`));
  return iguales(firma, esperada) ? dato : null;
}

/** Firma de los webhooks de Tiendanube: HMAC-SHA256 en hex del cuerpo, con el client_secret. */
export async function webhookValido(cuerpo, encabezado, clientSecret) {
  if (!encabezado || !clientSecret) return false;
  const esperado = aHex(await hmac(clientSecret, cuerpo));
  return iguales(encabezado.trim().toLowerCase(), esperado);
}

async function claveAes(claveB64) {
  const bytes = deBase64url(claveB64);
  if (bytes.length !== 32) throw new Error('TOKEN_KEY debe tener 32 bytes en base64url');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function cifrar(texto, claveB64) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await claveAes(claveB64), enc.encode(texto)));
  const todo = new Uint8Array(12 + ct.length);
  todo.set(iv);
  todo.set(ct, 12);
  return aBase64url(todo);
}

export async function descifrar(texto, claveB64) {
  const todo = deBase64url(texto);
  const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: todo.slice(0, 12) }, await claveAes(claveB64), todo.slice(12));
  return dec.decode(plano);
}

export const nuevaClave = () => aBase64url(crypto.getRandomValues(new Uint8Array(32)));
