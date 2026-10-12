export type Detail = "all" | "keys" | "names";
export function visibleFields<T extends { name: string; pk?: boolean }>(
  fields: T[],
  detail: Detail,
  keys: string[],
) {
  return detail === "names"
    ? []
    : detail === "keys"
      ? fields.filter((f) => f.pk || keys.includes(f.name))
      : fields;
}
export function matchesSearch(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}
