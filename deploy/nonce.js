// js_set evaluates this once per HTML request and reuses it for the CSP and body.
function createNonce() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Buffer.from(bytes).toString('base64');
}

export default { createNonce };
