import { clipperLab } from './labs/clipper'
import { clipVsLimitLab } from './labs/clipVsLimit'
import { compressorLab } from './labs/compressor'
import { gateLab } from './labs/gate'
import { limiterLab } from './labs/limiter'
import { multibandLab } from './labs/multiband'
import { parallelLab } from './labs/parallel'
import { reverbLab } from './labs/reverb'
import { sidechainLab } from './labs/sidechain'
import type { LabDef } from './types'

export const LABS: LabDef<any>[] = [
  compressorLab,
  limiterLab,
  clipperLab,
  clipVsLimitLab,
  gateLab,
  multibandLab,
  sidechainLab,
  parallelLab,
  reverbLab,
]
