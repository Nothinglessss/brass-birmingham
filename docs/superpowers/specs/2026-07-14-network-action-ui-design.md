# Network Action UI Design

## Scope

Issue #23 improves the wording and option presentation for the existing Network action. It does not change Network legality, cost calculation, resource planning, or execution.

## Behavior

- Canal Era choices remain single-link choices.
- Rail Era choices distinguish a single rail from the existing two-rail Network action.
- The phase instruction explains that the player may choose one rail or a two-rail action when both are available.
- A two-rail option names both connections and shows `£15 + 2 coal + 1 beer` before selection.
- A single-rail option remains clearly identified as one rail and continues to show its calculated cost.

## Design

`UIManager.startNetwork()` will retain the generated Network targets in `pendingData` and render each target through a small view-model helper. `getTargetInstruction()` will use those targets to choose accurate singular or two-link wording. The selected target still passes the same one-or-two connection ID array into the resource planner.

## Testing

A focused DOM-free UI regression will verify the instruction and view-model output for Canal, single-rail, and two-rail targets. Existing resource-action and rule-deviation tests will verify that gameplay behavior remains unchanged.

## Explicitly Out of Scope

- Sequentially clicking two separate board links.
- Changing the £15, two-coal, or one-beer rule.
- Changing resource-source selection.
- General redesign of the action phase bar.
