// DATA LAYER: makes unique IDs such as "CUS-001", "PET-001" and "APT-001".
// With MySQL, the database would create IDs for us (AUTO_INCREMENT). Until then, each repository uses this.
//
// Usage:
//   const nextId = createIdGenerator("CUS", customers); // looks at the existing IDs once
//   nextId(); // "CUS-011" if the highest existing one was "CUS-010"
//   nextId(); // "CUS-012"
//
// The counter only goes up, so an ID is never reused, even after a record is deleted.
export function createIdGenerator(prefix, existingItems) {
  let counter = existingItems.reduce(
    (highest, item) =>
      Math.max(highest, Number(item.id.replace(`${prefix}-`, ""))),
    0,
  );

  return function nextId() {
    counter += 1;
    return `${prefix}-${String(counter).padStart(3, "0")}`;
  };
}
