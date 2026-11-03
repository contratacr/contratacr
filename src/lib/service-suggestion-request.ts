export function serviceSuggestionEditorLink(categoryId: string) {
  return `/dashboard/profesional?mode=offer&tab=services&serviceRequest=${encodeURIComponent(categoryId)}`;
}
