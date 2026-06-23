const crypto = require("node:crypto");

const COOKIE_NAME = "cha_lista_espaco_mae";
const SESSION_DURATION_SECONDS = 8 * 60 * 60;

function hash(value) {
  return crypto.createHash("sha256").update(value).digest();
}

function safePasswordMatch(received, expected) {
  return crypto.timingSafeEqual(hash(received), hash(expected));
}

function signature(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function createSessionToken(secret) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const payload = String(expiresAt);
  return `${payload}.${signature(payload, secret)}`;
}

function isValidSessionToken(token, secret) {
  if (!token) return false;
  const [expiresAt, receivedSignature] = token.split(".");
  if (!expiresAt || !receivedSignature || !/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;

  const expectedSignature = signature(expiresAt, secret);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, item) => {
    const separator = item.indexOf("=");
    if (separator === -1) return cookies;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
    }
    return cookies;
  }, {});
}

function setSessionCookie(res, token, secure) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${SESSION_DURATION_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res, secure) {
  const parts = [
    `${COOKIE_NAME}=`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function createAuth({ password, secret, secureCookies }) {
  const requireMotherSpace = (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    if (!isValidSessionToken(cookies[COOKIE_NAME], secret)) {
      return res.status(401).json({ error: "Faça login para acessar esta área." });
    }
    next();
  };

  return {
    requireMotherSpace,
    login(receivedPassword) {
      if (!safePasswordMatch(receivedPassword, password)) return null;
      return createSessionToken(secret);
    },
    setCookie(res, token) {
      setSessionCookie(res, token, secureCookies);
    },
    clearCookie(res) {
      clearSessionCookie(res, secureCookies);
    },
    hasValidSession(req) {
      const cookies = parseCookies(req.headers.cookie);
      return isValidSessionToken(cookies[COOKIE_NAME], secret);
    },
  };
}

module.exports = { createAuth };
