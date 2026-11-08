/** Reconstruct visual rows, including right-aligned dates, rather than PDF drawing order. */
export function pdfTextLines(items: Array<{ str?: string; transform?: number[]; width?: number; height?: number }>): string {
  const rows: { y: number; items: typeof items }[] = [];
  for (const item of items) {
    if (!item.str?.trim() || !item.transform) continue;
    const y = item.transform[5];
    let row = rows.find(row => Math.abs(row.y - y) < 2);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push(item);
  }
  return rows.sort((a,b) => b.y-a.y).map(row => row.items.sort((a,b) => a.transform![4]-b.transform![4]).reduce((line, item, index, sorted) => {
    const previous = sorted[index - 1];
    const gap = previous ? item.transform![4] - (previous.transform![4] + (previous.width || 0)) : 0;
    return line + (previous && gap > 0.8 ? ' ' : '') + item.str;
  }, '').replace(/\s+/g,' ').trim()).join('\n');
}
