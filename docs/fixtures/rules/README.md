# Rule Scenario Golden Fixtures

These files capture subtle domain-rule interactions as renderer-independent JSON examples.

- `ice-drop-carried-treasure.json`: entering ice while carrying treasure drops the treasure at the deterministic drop position selected by the domain policy.
- `river-formation.json`: three connected water tiles normalize into river tiles after a throw.
- `river-movement-block.json`: normal movement cannot enter a river tile.

The domain test `packages/domain/src/scenario-golden.test.ts` fails if current rule behavior drifts from these samples. Update these files only when a rule change is intentional.
