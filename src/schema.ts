import { Parser, ModelExporter } from "@dbml/core";

export class SchemaError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function errorMessage(error: unknown): string {
  const value = error as { message?: string; diags?: { message: string }[] };
  return (
    value.diags?.map((d) => d.message).join("\n") ||
    value.message ||
    String(error)
  );
}
export function database(text: string) {
  if (
    typeof text !== "string" ||
    new TextEncoder().encode(text).byteLength > 2_000_000
  )
    throw new SchemaError("DBML must be a string under 2 MB.");
  try {
    return Parser.parse(text, "dbmlv2");
  } catch (error) {
    throw new SchemaError(errorMessage(error));
  }
}
interface RawSchema {
  name: string;
  tables: {
    name: string;
    note?: string;
    headerColor?: string;
    fields: {
      name: string;
      type: { type_name: string; args?: string };
      pk?: boolean;
      unique?: boolean;
      not_null?: boolean;
      note?: string;
    }[];
    indexes: {
      name?: string;
      unique?: boolean;
      pk?: boolean;
      type?: string;
      note?: string;
      columns: { type: string; value: string }[];
    }[];
  }[];
  refs: {
    name?: string;
    endpoints: {
      schemaName?: string;
      tableName: string;
      fieldNames: string[];
      relation: string;
    }[];
  }[];
  tableGroups: {
    name: string;
    note?: string;
    color?: string;
    tables: { tableName: string; schemaName?: string }[];
  }[];
}
export function parseSchema(text: string) {
  const raw = database(text).export() as unknown as {
    schemas: RawSchema[];
    notes: { name: string; content: string }[];
  };
  return {
    notes: raw.notes.map((note) => ({
      id: "note:" + note.name,
      name: note.name,
      content: note.content,
    })),
    tables: raw.schemas.flatMap((schema) =>
      schema.tables.map((table) => ({
        id: `${schema.name}.${table.name}`,
        name: table.name,
        schema: schema.name,
        note: table.note || "",
        color: table.headerColor || "#355772",
        fields: table.fields.map((field) => ({
          name: field.name,
          type: field.type.type_name,
          pk: !!field.pk,
          unique: !!field.unique,
          not_null: !!field.not_null,
          note: field.note || "",
        })),
        indexes: table.indexes,
      })),
    ),
    refs: raw.schemas.flatMap((schema) =>
      schema.refs.map((ref, index) => {
        const [from, to] = ref.endpoints;
        return {
          id: `${schema.name}.ref${index}`,
          name: ref.name || "",
          fromTable: `${from.schemaName || schema.name}.${from.tableName}`,
          fromFields: from.fieldNames,
          toTable: `${to.schemaName || schema.name}.${to.tableName}`,
          toFields: to.fieldNames,
          relation: `${from.relation}:${to.relation}`,
        };
      }),
    ),
    groups: raw.schemas.flatMap((schema) =>
      schema.tableGroups.map((group) => ({
        name: group.name,
        color: group.color || "#e8eef5",
        note: group.note || "",
        tables: group.tables.map(
          (table) => `${table.schemaName || schema.name}.${table.tableName}`,
        ),
      })),
    ),
  };
}
export function exportSchema(text: string, format: string) {
  if (!["postgres", "mysql", "mssql", "dbml"].includes(format))
    throw new SchemaError("Unsupported export format.");
  const model = database(text);
  return format === "dbml"
    ? text
    : ModelExporter.export(model, format as "postgres" | "mysql" | "mssql");
}
