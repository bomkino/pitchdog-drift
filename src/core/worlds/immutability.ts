export type DeepReadonly<Value> =
  Value extends (...arguments_: never[]) => unknown
    ? Value
    : Value extends readonly unknown[]
      ? { readonly [Index in keyof Value]: DeepReadonly<Value[Index]> }
      : Value extends object
        ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
        : Value;

function freezeValue<Value>(value: Value, seen: WeakSet<object>): DeepReadonly<Value> {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return value as DeepReadonly<Value>;
  }
  const objectValue = value as object;
  if (seen.has(objectValue)) return value as DeepReadonly<Value>;
  seen.add(objectValue);
  for (const key of Reflect.ownKeys(objectValue)) {
    const descriptor = Object.getOwnPropertyDescriptor(objectValue, key);
    if (descriptor && "value" in descriptor) freezeValue(descriptor.value, seen);
  }
  if (!Object.isFrozen(objectValue)) Object.freeze(objectValue);
  return value as DeepReadonly<Value>;
}

/** Recursively freezes registry data and preserves tuple/record types. */
export function deepFreeze<Value>(value: Value): DeepReadonly<Value> {
  return freezeValue(value, new WeakSet());
}
