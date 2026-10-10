export type MetaDeliveryResult = "sent" | "retry";
export async function sendMetaConversion(payload: Record<string, unknown>, config: { pixelId: string; token: string; version: string; testCode?: string }, transport: typeof fetch = fetch): Promise<MetaDeliveryResult> {
  try {
    const response = await transport(`https://graph.facebook.com/${config.version}/${config.pixelId}/events`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ data: [payload], ...(config.testCode ? { test_event_code: config.testCode } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    const body = await response.json().catch(() => ({}));
    return response.ok && body.events_received === 1 ? "sent" : "retry";
  } catch { return "retry"; }
}

export function metaTestEventCode(value: string | undefined): string | undefined {
  const code = value?.trim();
  return code && code.toLowerCase() !== "off" && /^[A-Za-z0-9_-]{1,80}$/.test(code) ? code : undefined;
}
