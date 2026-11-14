import { randomInt } from "node:crypto";

import type { RandomSource } from "@kabu/game-core";

export const secureRandomSource: RandomSource = {
  integer(maxExclusive) {
    return randomInt(maxExclusive);
  },
};
