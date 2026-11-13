/** Builds the ID token a fake Google would hand back. Not signed: the app trusts the token endpoint over TLS, not a signature. */
export function fakeIdToken(claims: Record<string, unknown> = {}): string {
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${b({ alg: "RS256", typ: "JWT" })}.${b({
    iss: "https://accounts.google.com",
    aud: "client-123.apps.googleusercontent.com",
    sub: "1099887766",
    email: "ama@example.com",
    email_verified: true,
    name: "Ama Mensah",
    nonce: "n",
    iat: now,
    exp: now + 3600,
    ...claims,
  })}.sig`;
}
