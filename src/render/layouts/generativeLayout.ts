import type { RenderEnv } from '../env'
import { planGenerative } from './generativePlan'

// The generative layout is planned before it is drawn — `generativePlan.ts` owns
// the geometry (so the preview can hit-test and drag elements), and drawing is
// just replaying the plan. Re-exported here so existing importers keep working.
export {
  imageAlignAxis,
  mulberry32,
  planImage,
  seededBandPos,
  type ImageMode,
} from './generativePlan'

/** Draw the seeded generative arrangement: plan it, then replay every element. */
export function drawGenerativeLayout(env: RenderEnv): void {
  for (const el of planGenerative(env).elements) el.draw()
}
