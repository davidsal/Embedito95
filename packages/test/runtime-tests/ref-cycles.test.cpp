// Host unit tests for the cycle collector embedded in the core_mem::Ref motor.
//
// ref.h implements a synchronous, single-threaded trial-deletion collector
// (Bacon-Rajan, like CPython's gc). These tests define, by hand, the per-type
// TypeInfo that the codegen will later emit for a node with handle fields, and
// exercise the shapes an e95 program can build without `weak`, indices or new
// syntax: self cycles, doubly linked lists, parent pointers, small graphs, and
// a graph larger than the fixed worklist.
//
// They also assert there are no false positives (a handle on the stack keeps
// its object alive) and that every scenario ends with zero live nodes, so ASan
// and the live counter both catch a leak, a double free or a use-after-free.

#include "packages/registry/src/strategies/shared/memory/ref.h"

#include <stdio.h>

using core_mem::Ref;
using core_mem::RefBox;
using core_mem::TraceVisitor;
using core_mem::TypeInfo;

static const int RING_NODE_COUNT = 40;

// Node with the four kinds of handle field the scenarios use. `live` counts
// constructed-but-not-destroyed nodes so a leak shows up as a nonzero count.
struct Node {
	static int live;

	int id;
	Ref<Node> next;
	Ref<Node> prev;
	Ref<Node> parent;
	Ref<Node> child;

	Node() : id(0) {
		live++;
	}

	explicit Node(int value) : id(value) {
		live++;
	}

	Node(const Node &other)
		: id(other.id), next(other.next), prev(other.prev), parent(other.parent),
			child(other.child) {
		live++;
	}

	~Node() {
		live--;
	}
};

int Node::live = 0;

// Walks every handle field and reports it to the collector. The default
// leaf TypeInfo (null `trace`) would leak every cycle; this is the shape the
// codegen will emit for an object with reference fields.
static void traceNode(void *box, TraceVisitor visit) {
	RefBox<Node> *typed = (RefBox<Node> *)box;
	typed->value.next.traceChild(visit);
	typed->value.prev.traceChild(visit);
	typed->value.parent.traceChild(visit);
	typed->value.child.traceChild(visit);
}

static const TypeInfo NODE_TYPE_INFO = { &core_mem::destroyRefBox<Node>, &traceNode };

namespace core_mem {

template <>
struct TypeInfoOf<::Node> {
	static const TypeInfo *get() noexcept {
		return &NODE_TYPE_INFO;
	}
};

} // namespace core_mem

// Leaf whose box is never traced (mirrors a `string`/`u8[]` field that the
// collector never visits). Its payload also owns a heap buffer, so leaking
// either the box or the buffer shows up in the counters and under ASan.
struct Leaf {
	static int live;
	static int buffers;

	int *payload;

	Leaf() : payload((int *)malloc(sizeof(int))) {
		if (payload) {
			*payload = 0;
			buffers++;
		}
		live++;
	}

	Leaf(const Leaf &other) : payload((int *)malloc(sizeof(int))) {
		if (payload) {
			*payload = other.payload ? *other.payload : 0;
			buffers++;
		}
		live++;
	}

	~Leaf() {
		if (payload) {
			free(payload);
			buffers--;
		}
		live--;
	}
};

int Leaf::live = 0;
int Leaf::buffers = 0;

// Node with a leaf field plus a cycle field. Its `trace` deliberately visits
// only `next` (the QA repro): the leaf box is therefore never registered with
// the collector and only the white phase's normal release can reclaim it.
struct SparseNode {
	static int live;

	Ref<Leaf> leaf;
	Ref<SparseNode> next;

	SparseNode() {
		live++;
	}

	~SparseNode() {
		live--;
	}
};

int SparseNode::live = 0;

static void traceSparseNode(void *box, TraceVisitor visit) {
	RefBox<SparseNode> *typed = (RefBox<SparseNode> *)box;
	typed->value.next.traceChild(visit);
}

static const TypeInfo SPARSE_NODE_TYPE_INFO = {
	&core_mem::destroyRefBox<SparseNode>, &traceSparseNode};

namespace core_mem {

template <>
struct TypeInfoOf<::SparseNode> {
	static const TypeInfo *get() noexcept {
		return &SPARSE_NODE_TYPE_INFO;
	}
};

} // namespace core_mem

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                          \
		if (!(condition)) {                                                        \
			failures++;                                                               \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);              \
		}                                                                           \
	} while (0)

// a.next = a
static void scenarioSelfCycle() {
	Node::live = 0;
	{
		Ref<Node> a = Ref<Node>::emplace(1);
		a->next = a;
		CHECK(a.refCount() == 2);
		CHECK(Node::live == 1);
	}
	// The external handle is gone; only the self reference remains.
	CHECK(Node::live == 1);
	core_mem::collectCycles();
	CHECK(Node::live == 0);
}

// n1.next = n2; n2.prev = n1
static void scenarioDoublyLinkedList() {
	Node::live = 0;
	{
		Ref<Node> first = Ref<Node>::emplace(1);
		Ref<Node> second = Ref<Node>::emplace(2);
		first->next = second;
		second->prev = first;
		CHECK(first.refCount() == 2);
		CHECK(second.refCount() == 2);
		CHECK(Node::live == 2);
	}
	CHECK(Node::live == 2);
	core_mem::collectCycles();
	CHECK(Node::live == 0);
}

// child.parent = parent; parent.child = child
static void scenarioParentPointerTree() {
	Node::live = 0;
	{
		Ref<Node> parent = Ref<Node>::emplace(1);
		Ref<Node> child = Ref<Node>::emplace(2);
		parent->child = child;
		child->parent = parent;
		CHECK(parent.refCount() == 2);
		CHECK(child.refCount() == 2);
	}
	CHECK(Node::live == 2);
	core_mem::collectCycles();
	CHECK(Node::live == 0);
}

// n1 -> n2 -> n3 -> n1
static void scenarioThreeNodeCycle() {
	Node::live = 0;
	{
		Ref<Node> first = Ref<Node>::emplace(1);
		Ref<Node> second = Ref<Node>::emplace(2);
		Ref<Node> third = Ref<Node>::emplace(3);
		first->next = second;
		second->next = third;
		third->next = first;
		CHECK(Node::live == 3);
	}
	CHECK(Node::live == 3);
	core_mem::collectCycles();
	CHECK(Node::live == 0);
}

// Two parents share one child (a DAG, no cycle). The child stays alive while
// an external handle points at it; no false positive may destroy it.
static void scenarioSharedDagKeepsExternallyReferencedNode() {
	Node::live = 0;
	{
		Ref<Node> shared = Ref<Node>::emplace(7);
		{
			Ref<Node> firstParent = Ref<Node>::emplace(1);
			Ref<Node> secondParent = Ref<Node>::emplace(2);
			firstParent->child = shared;
			secondParent->child = shared;
			CHECK(shared.refCount() == 3);
		}
		// Both parents die here, releasing their shares of the shared node.
		CHECK(shared.refCount() == 1);
		CHECK(Node::live == 1);
		core_mem::collectCycles();
		// A stack handle still owns it: the collector must not touch it.
		CHECK(Node::live == 1);
		CHECK(shared->id == 7);
	}
	CHECK(Node::live == 0);
}

// A ring larger than E95_CYCLES_WORKLIST cannot be marked in one pass. The
// collector must roll back cleanly (no gray boxes, no corrupted refcounts) and
// either skip or collect; a second set of handles keeps the nodes alive while
// the attempt happens, then breaks the ring so the scenario can end at 0.
static void scenarioWorklistOverflowDoesNotCorrupt() {
	Node::live = 0;
	{
		Ref<Node> nodes[RING_NODE_COUNT];
		Ref<Node> keepAlive[RING_NODE_COUNT];
		for (int i = 0; i < RING_NODE_COUNT; i++) {
			nodes[i] = Ref<Node>::emplace(i);
			keepAlive[i] = nodes[i];
		}
		for (int i = 0; i < RING_NODE_COUNT; i++) {
			nodes[i]->next = nodes[(i + 1) % RING_NODE_COUNT];
		}
		CHECK(Node::live == RING_NODE_COUNT);
		CHECK(nodes[0].refCount() == 3);

		// Dropping one handle per node fills the candidate list; extra purple
		// nodes past the fixed capacity are simply not registered. A later
		// allocation nudges the collector, which overflows on the 40-node ring
		// and must roll back without corrupting anything.
		for (int i = 0; i < RING_NODE_COUNT; i++) {
			nodes[i].reset();
		}
		CHECK(Node::live == RING_NODE_COUNT);
		Ref<Node> extra = Ref<Node>::emplace(RING_NODE_COUNT);
		CHECK(Node::live == RING_NODE_COUNT + 1);
		extra.reset();
		CHECK(Node::live == RING_NODE_COUNT);
		core_mem::collectCycles();
		CHECK(Node::live == RING_NODE_COUNT);

		// Breaking the ring through the surviving handles proves the boxes are
		// still valid (a corrupted refcount/color would crash or leak here).
		for (int i = 0; i < RING_NODE_COUNT; i++) {
			keepAlive[i]->next.reset();
		}
		for (int i = 0; i < RING_NODE_COUNT; i++) {
			keepAlive[i].reset();
		}
	}
	CHECK(Node::live == 0);
}

// A cyclic node that also owns a leaf handle its `trace` never visits: the
// leaf is not registered with the collector, so dropping the external handle
// must still free the leaf box and its buffer during the white phase.
static void scenarioCycleReleasesUntracedLeafChild() {
	SparseNode::live = 0;
	Leaf::live = 0;
	Leaf::buffers = 0;
	{
		Ref<SparseNode> node = Ref<SparseNode>::emplace();
		node->leaf = Ref<Leaf>::emplace();
		node->next = node;
		CHECK(SparseNode::live == 1);
		CHECK(Leaf::live == 1);
		CHECK(node.refCount() == 2);
	}
	// Only the self reference remains; the leaf is owned by the white node.
	CHECK(SparseNode::live == 1);
	CHECK(Leaf::live == 1);
	core_mem::collectCycles();
	CHECK(SparseNode::live == 0);
	CHECK(Leaf::live == 0);
	CHECK(Leaf::buffers == 0);
}

// Two cyclic nodes sharing one untraced leaf: the white phase must release each
// edge exactly once and free the leaf when its count reaches 0.
static void scenarioCycleSharedUntracedLeaf() {
	SparseNode::live = 0;
	Leaf::live = 0;
	Leaf::buffers = 0;
	{
		Ref<Leaf> shared = Ref<Leaf>::emplace();
		Ref<SparseNode> first = Ref<SparseNode>::emplace();
		Ref<SparseNode> second = Ref<SparseNode>::emplace();
		first->leaf = shared;
		second->leaf = shared;
		first->next = second;
		second->next = first;
		CHECK(Leaf::live == 1);
		CHECK(shared.refCount() == 3);
	}
	CHECK(SparseNode::live == 2);
	core_mem::collectCycles();
	CHECK(SparseNode::live == 0);
	CHECK(Leaf::live == 0);
	CHECK(Leaf::buffers == 0);
}

// collectCycles with nothing pending is a no-op and must not disturb handles.
static void scenarioCollectWithNoCandidatesIsNoop() {
	Node::live = 0;
	{
		Ref<Node> value = Ref<Node>::emplace(5);
		core_mem::collectCycles();
		CHECK(value.refCount() == 1);
		CHECK(value->id == 5);
		core_mem::collectCycles();
		CHECK(Node::live == 1);
	}
	CHECK(Node::live == 0);
}

int main() {
	scenarioSelfCycle();
	scenarioDoublyLinkedList();
	scenarioParentPointerTree();
	scenarioThreeNodeCycle();
	scenarioSharedDagKeepsExternallyReferencedNode();
	scenarioWorklistOverflowDoesNotCorrupt();
	scenarioCycleReleasesUntracedLeafChild();
	scenarioCycleSharedUntracedLeaf();
	scenarioCollectWithNoCandidatesIsNoop();

	if (failures == 0) {
		printf("Ref cycles: all scenarios passed\n");
		return 0;
	}
	printf("Ref cycles: %d check(s) failed\n", failures);
	return 1;
}
