// A named object type's info carries its data `fields` and its `methods`. A
// CALLBACK RECORD (0 data fields, >=1 method) is the one shape whose value is a
// handle whose methods are function-pointer MEMBERS rather than free functions,
// so the "has data fields" distinction is consulted in several renderers and in
// the object-handle fixpoint. Keep the predicate in one place.
export const hasDataFields = (objectInfo) => {
	return Object.keys(objectInfo?.fields ?? {}).length > 0;
};
