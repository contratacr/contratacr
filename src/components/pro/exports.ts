/** All exports escape formulas, including contact names and SKUs. */
export function businessCsv(rows: object[]) {
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    return (
      '"' + (/^[\s]*[=+@-]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"'
    );
  };
  return (
    "\uFEFF" +
    [
      keys,
      ...rows.map((row) =>
        keys.map((k) => (row as Record<string, unknown>)[k]),
      ),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
export async function downloadFile(
  content: string,
  name: string,
  type: string,
) {
  const { saveFile } = await import("@/lib/file-download");
  return saveFile(new Blob([content], { type }), name);
}
