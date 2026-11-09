/** App-authored text, including previously stored notifications and support replies. */
export function straightDoubleQuotes(text: string): string {
  return text.replace(/[\u00ab\u00bb\u201c\u201d\u201e]/g, '"').replace(/<<([^<>\n]+)>>/g, '"$1"');
}
