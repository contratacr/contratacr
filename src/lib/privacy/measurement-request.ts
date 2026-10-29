/** Device preference, not an authentication or authorization credential. */
export function requestStatisticsAllowed(req: Request): boolean {
  return req.headers.get("cookie")?.split(";").some(item => item.trim() === "ccr_statistics_consent_v1=accepted") === true;
}
