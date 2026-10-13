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
export const MAX_DBML_BYTES = 100_000_000;
export function validateDbmlText(text: unknown): asserts text is string {
  if (typeof text !== "string") throw new SchemaError("DBML must be a string.");
  if (text.length > MAX_DBML_BYTES || new TextEncoder().encode(text).byteLength > MAX_DBML_BYTES)
    throw new SchemaError("DBML must be no larger than 100 MB.", 413);
}
export function database(text: string) {
  validateDbmlText(text);
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
    color?: string;
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
  const db = database(text);
  const raw = db.export() as unknown as {
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
        color: table.headerColor || "#316896",
        records: (() => {
          const records = db.schemas.find(s => s.name === schema.name)?.tables.find(t => t.name === table.name)?.records[0];
          return records ? {
            columns: records.columns,
            example: !!records.example,
            rows: records.values.map(row => row.map((cell: any) => ({
              value: cell.value,
              type: cell.type,
              literal: text.slice(cell.token.start.offset, cell.token.end.offset),
            }))),
          } : null;
        })(),
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
          color: ref.color || "",
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
