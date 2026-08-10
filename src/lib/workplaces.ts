export type WorkplaceLike = {
  id?: string | null;
  name?: string | null;
  address?: string | null;
  provinciaId?: string | null;
  cantonId?: string | null;
};

function toStableToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function stableWorkplaceId(workplace: WorkplaceLike, index = 0): string {
  const existing = workplace.id?.trim();
  if (existing) return existing;

  const token = toStableToken(
    [
      workplace.provinciaId,
      workplace.cantonId,
      workplace.name,
      workplace.address,
    ]
      .filter(Boolean)
      .join("_")
  );

  return token ? `wp_${token}` : `wp_legacy_${index}`;
}

export function normalizeWorkplaceId<T extends WorkplaceLike>(workplace: T, index = 0): T & { id: string } {
  return { ...workplace, id: stableWorkplaceId(workplace, index) };
}
