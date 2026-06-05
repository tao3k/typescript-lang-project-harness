import assert from "node:assert/strict";

type JsonObject = Record<string, unknown>;

export function assertTypeSurfaces(
  value: unknown,
  surfaceSchema: JsonObject,
  typeRefSchema: JsonObject,
  typeMemberSchema: JsonObject,
  context: string,
): void {
  assertArray(value, context, (surface, surfaceContext) =>
    assertTypeSurface(surface, surfaceSchema, typeRefSchema, typeMemberSchema, surfaceContext),
  );
}

export function assertSemanticHandles(value: unknown, schema: JsonObject, context: string): void {
  assertArray(value, context, (handle, handleContext) =>
    assertSemanticHandle(handle, schema, handleContext),
  );
}

function assertTypeSurface(
  surface: JsonObject,
  surfaceSchema: JsonObject,
  typeRefSchema: JsonObject,
  typeMemberSchema: JsonObject,
  context: string,
): void {
  assertSchemaObject(surface, surfaceSchema, context);
  assertString(surface.id, `${context}.id`);
  assertString(surface.name, `${context}.name`);
  assertString(surface.kind, `${context}.kind`);
  assertString(surface.role, `${context}.role`);
  assertString(surface.ownerPath, `${context}.ownerPath`);
  if (surface.location !== undefined)
    assertLocation(record(surface.location), `${context}.location`);
  assertString(surface.visibility, `${context}.visibility`);
  assert.equal(typeof surface.external, "boolean", `${context}.external must be boolean`);
  if (surface.source !== undefined) assertString(surface.source, `${context}.source`);
  if (surface.package !== undefined) assertString(surface.package, `${context}.package`);
  if (surface.module !== undefined) assertString(surface.module, `${context}.module`);
  if (surface.symbol !== undefined) assertString(surface.symbol, `${context}.symbol`);
  if (surface.versionScope !== undefined)
    assertString(surface.versionScope, `${context}.versionScope`);
  if (surface.carrier !== undefined) {
    assertTypeRef(record(surface.carrier), typeRefSchema, `${context}.carrier`);
  }
  assertArray(surface.members, `${context}.members`, (member, memberContext) =>
    assertTypeMember(member, typeMemberSchema, typeRefSchema, memberContext),
  );
  assertArray(surface.relatedTypes, `${context}.relatedTypes`, (typeRef, typeRefContext) =>
    assertTypeRef(typeRef, typeRefSchema, typeRefContext),
  );
  assertFields(surface.fields, `${context}.fields`);
}

function assertTypeRef(typeRef: JsonObject, schema: JsonObject, context: string): void {
  assertSchemaObject(typeRef, schema, context);
  if (typeRef.name !== undefined) assertString(typeRef.name, `${context}.name`);
  if (typeRef.languageName !== undefined)
    assertString(typeRef.languageName, `${context}.languageName`);
  if (typeRef.qualifiedName !== undefined) {
    assertString(typeRef.qualifiedName, `${context}.qualifiedName`);
  }
  assertString(typeRef.carrier, `${context}.carrier`);
  if (typeRef.package !== undefined) assertString(typeRef.package, `${context}.package`);
  if (typeRef.module !== undefined) assertString(typeRef.module, `${context}.module`);
  if (typeRef.symbol !== undefined) assertString(typeRef.symbol, `${context}.symbol`);
  if (typeRef.versionScope !== undefined)
    assertString(typeRef.versionScope, `${context}.versionScope`);
  if (typeRef.external !== undefined) {
    assert.equal(typeof typeRef.external, "boolean", `${context}.external must be boolean`);
  }
  assertArray(typeRef.typeArguments, `${context}.typeArguments`, (nestedTypeRef, nestedContext) =>
    assertTypeRef(nestedTypeRef, schema, nestedContext),
  );
  if (typeRef.fields !== undefined) assertFields(typeRef.fields, `${context}.fields`);
}

function assertTypeMember(
  member: JsonObject,
  memberSchema: JsonObject,
  typeRefSchema: JsonObject,
  context: string,
): void {
  assertSchemaObject(member, memberSchema, context);
  assertString(member.name, `${context}.name`);
  assertString(member.role, `${context}.role`);
  assertTypeRef(record(member.type), typeRefSchema, `${context}.type`);
  if (member.visibility !== undefined) assertString(member.visibility, `${context}.visibility`);
  if (member.optional !== undefined) {
    assert.equal(typeof member.optional, "boolean", `${context}.optional must be boolean`);
  }
  if (member.readonly !== undefined) {
    assert.equal(typeof member.readonly, "boolean", `${context}.readonly must be boolean`);
  }
  if (member.mutable !== undefined) {
    assert.equal(typeof member.mutable, "boolean", `${context}.mutable must be boolean`);
  }
  if (member.location !== undefined) assertLocation(record(member.location), `${context}.location`);
  if (member.fields !== undefined) assertFields(member.fields, `${context}.fields`);
}

function assertSemanticHandle(value: JsonObject, schema: JsonObject, context: string): void {
  assertSchemaObject(value, schema, context);
  assertString(value.id, `${context}.id`);
  assertString(value.kind, `${context}.kind`);
  assertString(value.source, `${context}.source`);
  assertString(value.title, `${context}.title`);
  if (value.ownerPath !== undefined) assertString(value.ownerPath, `${context}.ownerPath`);
  if (value.implementationOwnerPath !== undefined) {
    assertString(value.implementationOwnerPath, `${context}.implementationOwnerPath`);
  }
  if (value.testPaths !== undefined) stringArray(value.testPaths, `${context}.testPaths`);
  assertArray(value.locations, `${context}.locations`, (location, locationContext) =>
    assertLocation(location, locationContext),
  );
  if (value.queryTerms !== undefined) stringArray(value.queryTerms, `${context}.queryTerms`);
  if (value.fields !== undefined) assertFields(value.fields, `${context}.fields`);
}

export function assertSchemaObject(value: JsonObject, schema: JsonObject, context: string): void {
  assertAllowedKeys(
    value,
    Object.keys(record(schema.properties, `${context} schema properties`)),
    context,
  );
  if (schema.required !== undefined) {
    assertRequiredKeys(value, stringArray(schema.required, `${context} schema required`), context);
  }
}

export function assertLocation(location: JsonObject, context: string): void {
  assertAllowedKeys(location, ["path", "lineRange"], context);
  assertString(location.path, `${context}.path`);
  if (location.lineRange !== undefined) {
    assertString(location.lineRange, `${context}.lineRange`);
    assert.match(String(location.lineRange), /^[1-9][0-9]*:[1-9][0-9]*$/u);
  }
}

export function assertFields(value: unknown, context: string): void {
  const fields = record(value, context);
  for (const [key, fieldValue] of Object.entries(fields)) {
    assertScalar(fieldValue, `${context}.${key}`);
  }
}

export function assertScalar(value: unknown, context: string): void {
  if (typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${context} must be finite`);
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertScalarArrayItem(item, `${context}[${index}]`);
    }
    return;
  }
  assert.fail(`${context} must be a scalar field value`);
}

function assertScalarArrayItem(value: unknown, context: string): void {
  if (typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  assert.fail(`${context} must be a string, number, or boolean`);
}

function assertArray(
  value: unknown,
  context: string,
  itemAssertion: (item: JsonObject, context: string) => void,
): void {
  if (value === undefined) return;
  assert.ok(Array.isArray(value), `${context} must be an array`);
  for (const [index, item] of value.entries()) {
    itemAssertion(record(item, `${context}[${index}]`), `${context}[${index}]`);
  }
}

export function assertAllowedKeys(
  value: JsonObject,
  allowedKeys: readonly string[],
  context: string,
): void {
  for (const key of Object.keys(value)) {
    assert.ok(allowedKeys.includes(key), `${context} has unexpected key ${key}`);
  }
}

export function assertRequiredKeys(
  value: JsonObject,
  requiredKeys: readonly string[],
  context: string,
): void {
  for (const key of requiredKeys) {
    assert.ok(Object.hasOwn(value, key), `${context} missing required key ${key}`);
  }
}

export function assertString(value: unknown, context: string): void {
  assert.equal(typeof value, "string", `${context} must be a string`);
}

export function assertPositiveInteger(value: unknown, context: string): void {
  assert.equal(typeof value, "number", `${context} must be a number`);
  const numberValue = value as number;
  assert.ok(
    Number.isInteger(numberValue) && numberValue >= 1,
    `${context} must be an integer >= 1`,
  );
}

export function record(value: unknown, context = "value"): JsonObject {
  assert.equal(typeof value, "object", `${context} must be an object`);
  assert.notEqual(value, null, `${context} must not be null`);
  assert.equal(Array.isArray(value), false, `${context} must not be an array`);
  return value as JsonObject;
}

function stringArray(value: unknown, context: string): string[] {
  assert.ok(Array.isArray(value), `${context} must be an array`);
  for (const [index, item] of value.entries()) {
    assertString(item, `${context}[${index}]`);
  }
  return value;
}
